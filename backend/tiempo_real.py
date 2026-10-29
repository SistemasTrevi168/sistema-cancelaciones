"""
Avisos en tiempo real al navegador (Server-Sent Events) por GET /api/eventos.

- «notificaciones»: llegó o cambió una notificación (p. ej. te compartieron un expediente).
- «sesion_cerrada»: cerraron esta sesión desde otro dispositivo, cambiaron la contraseña, desactivaron al usuario…

El navegador abre una sola conexión que se queda abierta; si se corta, se vuelve a conectar sola.
(Además sigue la revisión de cada pocos segundos, por si la conexión no está disponible.)
"""
import asyncio
import json
import threading
import time
from typing import Any, Dict, Optional, Set, Tuple

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import event
from sqlalchemy.orm import Session as SesionBD

router = APIRouter(prefix="/api", tags=["tiempo-real"])

_bloqueo = threading.Lock()
_loop: Optional[asyncio.AbstractEventLoop] = None
# Cada conexión abierta: (usuario, id de sesión, cola)
_conexiones: Set[Tuple[str, str, "asyncio.Queue[Dict[str, Any]]"]] = set()

LATIDO_SEG = 20        # comentario vacío para que la conexión no se corte por inactividad
DURACION_MAX = 600     # cada 10 min se renueva la conexión (el navegador se reconecta solo)


def _enviar(filtro, evento: Dict[str, Any]):
    """Manda el evento a las conexiones que cumplan el filtro (se puede llamar desde cualquier hilo)."""
    loop = _loop
    if loop is None:
        return
    with _bloqueo:
        destinos = [c for c in _conexiones if filtro(c)]
    for _, _, cola in destinos:
        try:
            loop.call_soon_threadsafe(cola.put_nowait, evento)
        except RuntimeError:
            pass  # el servidor se está apagando


def publicar_usuario(username: str, tipo: str, datos: Optional[Dict[str, Any]] = None):
    _enviar(lambda c: c[0] == username, {"tipo": tipo, **(datos or {})})


def publicar_cierre(sesion_id: str, motivo: str):
    _enviar(lambda c: c[1] == sesion_id, {"tipo": "sesion_cerrada", "motivo": motivo})


def publicar_todos(tipo: str, datos: Optional[Dict[str, Any]] = None):
    _enviar(lambda c: True, {"tipo": tipo, **(datos or {})})


# Se avisa cuando lo que cambió ya quedó guardado (después del commit):
#  - «notificaciones» solo a esa persona;
#  - «sesiones» (se abrió o cerró una sesión) a todos los conectados con el usuario que cambió:
#    así se actualizan «Mi perfil → Sesiones» y el perfil que esté viendo un administrador.
def avisar_al_guardar(db, username: str, tipo: str = "notificaciones", datos: Optional[Dict[str, Any]] = None):
    if username:
        extra = json.dumps(datos, sort_keys=True, ensure_ascii=False) if datos else ""
        db.info.setdefault("tr_pendientes", set()).add((username, tipo, extra))


@event.listens_for(SesionBD, "after_flush")
def _tras_flush(db, _contexto):
    import models
    for obj in list(db.new) + list(db.deleted):
        if isinstance(obj, models.Sesion):
            avisar_al_guardar(db, obj.username, "sesiones")


@event.listens_for(SesionBD, "after_commit")
def _tras_commit(db):
    pendientes = db.info.pop("tr_pendientes", None)
    for u, tipo, extra in pendientes or ():
        if tipo == "sesiones":
            publicar_todos("sesiones", {"usuario": u})
        else:
            publicar_usuario(u, tipo, json.loads(extra) if extra else None)


@event.listens_for(SesionBD, "after_rollback")
def _tras_rollback(db):
    db.info.pop("tr_pendientes", None)


def _formato(evento: Dict[str, Any]) -> str:
    return f"event: {evento.get('tipo', 'mensaje')}\ndata: {json.dumps(evento, ensure_ascii=False)}\n\n"


@router.get("/eventos")
async def eventos(request: Request):
    global _loop
    import auth
    from database import SessionLocal

    def validar():
        db = SessionLocal()
        try:
            return auth.obtener_sesion(request, db)
        finally:
            db.close()

    def sigue_activa(sid: str) -> Optional[str]:
        """None si la sesión sigue; si no, el motivo del cierre."""
        db = SessionLocal()
        try:
            s = db.query(auth.Sesion).filter(auth.Sesion.id == sid).first()
            return None if s else auth.motivo_de_cierre(sid)
        finally:
            db.close()

    try:
        usuario = await run_in_threadpool(validar)
    except Exception:
        sid = auth.session_id_de(request) or ""
        motivo = auth.motivo_de_cierre(sid) if sid else "expirada"

        async def cerrado():
            yield _formato({"tipo": "sesion_cerrada", "motivo": motivo})
        return StreamingResponse(cerrado(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    _loop = asyncio.get_running_loop()
    cola: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue()
    clave = (usuario["username"], usuario["sesion_id"], cola)
    with _bloqueo:
        _conexiones.add(clave)

    async def flujo():
        inicio = time.monotonic()
        try:
            yield "retry: 3000\n" + _formato({"tipo": "listo"})
            while time.monotonic() - inicio < DURACION_MAX:
                if await request.is_disconnected():
                    break
                try:
                    evento = await asyncio.wait_for(cola.get(), timeout=LATIDO_SEG)
                    yield _formato(evento)
                    if evento.get("tipo") == "sesion_cerrada":
                        break
                except asyncio.TimeoutError:
                    # Latido; de paso se revisa que la sesión siga abierta (por si se cerró en otro servidor)
                    motivo = await run_in_threadpool(sigue_activa, usuario["sesion_id"])
                    if motivo:
                        yield _formato({"tipo": "sesion_cerrada", "motivo": motivo})
                        break
                    yield ": latido\n\n"
        finally:
            with _bloqueo:
                _conexiones.discard(clave)

    return StreamingResponse(flujo(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
