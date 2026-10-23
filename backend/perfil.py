"""
Mi perfil: cada usuario edita sus propios datos.

- Nombre para mostrar, foto (ya recortada en el navegador), color del sistema y tema (claro / oscuro / automático).
- Mi resumen: sus expedientes de hoy, la semana y el mes.
- Seguridad: sus sesiones abiertas (dispositivo, IP, último uso) y cerrar las de otros dispositivos.
- El administrador puede ver el perfil de cualquier usuario (solo lectura) y cerrarle sesiones.
"""
import re
from datetime import datetime, timedelta, time
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from auth import _a_utc, _ahora, anotar_cierre, require_admin, require_user, session_id_de
from database import get_db

router = APIRouter(prefix="/api/perfil", tags=["perfil"])
ZONA = ZoneInfo("America/Mexico_City")
TEMAS = {"claro", "oscuro", "sistema"}
MAX_FOTO = 600_000  # caracteres del data URL (~450 KB); el navegador la manda recortada a 320x320
MAX_PORTADA = 1_600_000  # ~1.2 MB; el navegador la reduce a 1600 px de ancho


def _usuario(db: Session, sesion: dict) -> models.Usuario:
    user = db.query(models.Usuario).filter(models.Usuario.username == sesion["username"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def _dispositivo(user_agent: str) -> str:
    ua = user_agent or ""
    navegador = ("Edge" if "Edg/" in ua else "Opera" if "OPR/" in ua else "Chrome" if "Chrome/" in ua
                 else "Firefox" if "Firefox/" in ua else "Safari" if "Safari/" in ua else "")
    sistema = ("iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua else "Android" if "Android" in ua
               else "Windows" if "Windows" in ua else "Mac" if "Mac OS" in ua else "Linux" if "Linux" in ua else "")
    if navegador and sistema:
        return f"{navegador} en {sistema}"
    return navegador or sistema or "Dispositivo desconocido"


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    return _a_utc(dt).astimezone(ZONA).strftime("%Y-%m-%d %H:%M")


def _resumen(db: Session, username: str) -> Dict[str, Any]:
    E = models.Expediente
    hoy = datetime.now(ZONA).date()
    inicio_dia = datetime.combine(hoy, time.min, tzinfo=ZONA)
    inicio_semana = inicio_dia - timedelta(days=hoy.weekday())
    inicio_mes = datetime.combine(hoy.replace(day=1), time.min, tzinfo=ZONA)

    def contar(desde=None):
        q = db.query(func.count(E.id)).filter(E.usuario_propietario == username)
        if desde is not None:
            q = q.filter(E.fecha_creacion >= desde)
        return q.scalar() or 0

    ultimo = db.query(func.max(E.fecha_creacion)).filter(E.usuario_propietario == username).scalar()
    # Últimos 14 días (para la gráfica pequeña)
    desde14 = inicio_dia - timedelta(days=13)
    filas = db.query(E.fecha_creacion).filter(E.usuario_propietario == username, E.fecha_creacion >= desde14).all()
    conteo: Dict[str, int] = {}
    for (f,) in filas:
        d = _a_utc(f).astimezone(ZONA).date().isoformat()
        conteo[d] = conteo.get(d, 0) + 1
    ultimos = [{"fecha": (desde14 + timedelta(days=i)).date().isoformat(),
                "total": conteo.get((desde14 + timedelta(days=i)).date().isoformat(), 0)} for i in range(14)]
    return {
        "hoy": contar(inicio_dia),
        "semana": contar(inicio_semana),
        "mes": contar(inicio_mes),
        "total": contar(),
        "ultimo_expediente": _iso(ultimo),
        "ultimos_14_dias": ultimos,
    }


def _sesiones(db: Session, username: str, actual: Optional[str]):
    filas = db.query(models.Sesion).filter(models.Sesion.username == username).all()
    lista = []
    for s in filas:
        if _a_utc(s.expira_en) < _ahora():
            continue
        lista.append({
            "id": s.id[:8],
            "actual": s.id == actual,
            "dispositivo": _dispositivo(getattr(s, "user_agent", "") or ""),
            "ip": getattr(s, "ip", "") or "",
            "inicio": _iso(s.creada_en),
            "ultimo_uso": _iso(getattr(s, "ultimo_uso", None) or s.creada_en),
        })
    lista.sort(key=lambda x: (not x["actual"], x["ultimo_uso"] or ""), reverse=False)
    actual_primero = [x for x in lista if x["actual"]] + sorted([x for x in lista if not x["actual"]], key=lambda x: x["ultimo_uso"] or "", reverse=True)
    return actual_primero


def _perfil(db: Session, user: models.Usuario, request: Request) -> Dict[str, Any]:
    return {
        "username": user.username,
        "nombre_mostrar": user.nombre_mostrar or "",
        "foto": user.foto or "",
        "portada": getattr(user, "portada", None) or "",
        "portada_pos": 50 if getattr(user, "portada_pos", None) is None else user.portada_pos,
        "color_acento": user.color_acento or "",
        "tema": user.tema or "",
        "es_admin": bool(user.es_admin),
        "creado_en": _iso(user.creado_en),
        "resumen": _resumen(db, user.username),
        "sesiones": _sesiones(db, user.username, session_id_de(request)),
    }


@router.get("")
def obtener_perfil(request: Request, db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    return _perfil(db, _usuario(db, sesion), request)


@router.put("")
def actualizar_perfil(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    user = _usuario(db, sesion)
    if "nombre_mostrar" in payload:
        nombre = " ".join(str(payload.get("nombre_mostrar") or "").split())
        if len(nombre) > 60:
            raise HTTPException(status_code=400, detail="El nombre puede tener máximo 60 caracteres.")
        user.nombre_mostrar = nombre or None
    if "color_acento" in payload:
        color = str(payload.get("color_acento") or "").strip().lower()
        if color and not re.fullmatch(r"#[0-9a-f]{6}", color):
            raise HTTPException(status_code=400, detail="Color no válido (usa el formato #rrggbb).")
        user.color_acento = color or None
    if "tema" in payload:
        tema = str(payload.get("tema") or "").strip().lower()
        if tema and tema not in TEMAS:
            raise HTTPException(status_code=400, detail="Tema no válido.")
        user.tema = tema or None
    db.commit()
    return _perfil(db, user, request)


@router.put("/foto")
def cambiar_foto(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    foto = str(payload.get("foto") or "")
    if not re.match(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$", foto):
        raise HTTPException(status_code=400, detail="La foto no es una imagen válida.")
    if len(foto) > MAX_FOTO:
        raise HTTPException(status_code=400, detail="La foto es demasiado grande.")
    user = _usuario(db, sesion)
    user.foto = foto
    db.commit()
    return _perfil(db, user, request)


@router.delete("/foto")
def quitar_foto(request: Request, db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    user = _usuario(db, sesion)
    user.foto = None
    db.commit()
    return _perfil(db, user, request)


@router.put("/portada")
def cambiar_portada(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    """{portada: dataURL, posicion: 0-100} o solo {posicion} para acomodar la que ya está."""
    user = _usuario(db, sesion)
    if "portada" in payload:
        portada = str(payload.get("portada") or "")
        if not re.match(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$", portada):
            raise HTTPException(status_code=400, detail="La portada no es una imagen válida.")
        if len(portada) > MAX_PORTADA:
            raise HTTPException(status_code=400, detail="La portada es demasiado grande.")
        user.portada = portada
    if "posicion" in payload:
        try:
            user.portada_pos = max(0, min(100, int(round(float(payload.get("posicion"))))))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Posición no válida.")
    db.commit()
    return _perfil(db, user, request)


@router.delete("/portada")
def quitar_portada(request: Request, db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    user = _usuario(db, sesion)
    user.portada = None
    user.portada_pos = None
    db.commit()
    return _perfil(db, user, request)


@router.delete("/sesiones/{prefijo}")
def cerrar_sesion(prefijo: str, request: Request, db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    actual = session_id_de(request)
    filas = db.query(models.Sesion).filter(models.Sesion.username == sesion["username"]).all()
    objetivo = [s for s in filas if s.id.startswith(prefijo) and s.id != actual]
    if not objetivo:
        raise HTTPException(status_code=404, detail="No se encontró esa sesión (o es la sesión actual).")
    anotar_cierre([s.id for s in objetivo], "otro_dispositivo")
    for s in objetivo:
        db.delete(s)
    db.commit()
    return _perfil(db, _usuario(db, sesion), request)


@router.post("/sesiones/cerrar-otras")
def cerrar_otras(request: Request, db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    actual = session_id_de(request)
    q = db.query(models.Sesion).filter(models.Sesion.username == sesion["username"], models.Sesion.id != actual)
    anotar_cierre([s.id for s in q.all()], "otro_dispositivo")
    q.delete(synchronize_session=False)
    db.commit()
    return _perfil(db, _usuario(db, sesion), request)


# ---------------- Perfil de otro usuario (solo el administrador) ----------------
router_admin = APIRouter(prefix="/api/admin/usuarios", tags=["perfil"])


def _usuario_por_id(db: Session, usuario_id: str) -> models.Usuario:
    import uuid as _uuid
    try:
        uid = _uuid.UUID(str(usuario_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user = db.query(models.Usuario).filter(models.Usuario.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def _perfil_para_admin(db: Session, user: models.Usuario, request: Request) -> Dict[str, Any]:
    import compartir
    datos = _perfil(db, user, request)
    datos.update({
        "id": str(user.id),
        "rol": compartir.rol_de(user),
        "activo": bool(getattr(user, "activo", True)),
        "debe_cambiar_password": bool(getattr(user, "debe_cambiar_password", False)),
    })
    return datos


@router_admin.get("/{usuario_id}/perfil")
def ver_perfil(usuario_id: str, request: Request, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return _perfil_para_admin(db, _usuario_por_id(db, usuario_id), request)


@router_admin.delete("/{usuario_id}/sesiones/{prefijo}")
def cerrar_sesion_de_usuario(usuario_id: str, prefijo: str, request: Request, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    user = _usuario_por_id(db, usuario_id)
    actual = session_id_de(request)
    filas = db.query(models.Sesion).filter(models.Sesion.username == user.username).all()
    objetivo = [s for s in filas if s.id.startswith(prefijo) and s.id != actual]
    if not objetivo:
        raise HTTPException(status_code=404, detail="No se encontró esa sesión (o es tu sesión actual).")
    anotar_cierre([s.id for s in objetivo], "admin")
    for s in objetivo:
        db.delete(s)
    db.commit()
    return _perfil_para_admin(db, user, request)


@router_admin.post("/{usuario_id}/sesiones/cerrar-todas")
def cerrar_todas_de_usuario(usuario_id: str, request: Request, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    user = _usuario_por_id(db, usuario_id)
    actual = session_id_de(request)
    q = db.query(models.Sesion).filter(models.Sesion.username == user.username, models.Sesion.id != actual)
    anotar_cierre([s.id for s in q.all()], "admin")
    q.delete(synchronize_session=False)
    db.commit()
    return _perfil_para_admin(db, user, request)
