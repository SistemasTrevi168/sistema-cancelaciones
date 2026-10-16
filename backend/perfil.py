"""
Mi perfil: cada usuario edita sus propios datos.

- Nombre para mostrar, foto (ya recortada en el navegador), color del sistema y tema (claro / oscuro / automático).
- Mi resumen: sus expedientes de hoy, la semana y el mes.
- Seguridad: sus sesiones abiertas (dispositivo, IP, último uso) y cerrar las de otros dispositivos.
"""
import re
from datetime import datetime, timedelta, time
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from auth import _a_utc, _ahora, anotar_cierre, require_user, session_id_de
from database import get_db

router = APIRouter(prefix="/api/perfil", tags=["perfil"])
ZONA = ZoneInfo("America/Mexico_City")
TEMAS = {"claro", "oscuro", "sistema"}
MAX_FOTO = 600_000  # caracteres del data URL (~450 KB); el navegador la manda recortada a 320x320


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
