"""
Notificaciones de cada usuario (la campana del menú).
Por ahora: cuando alguien le comparte expedientes (o todos sus expedientes).
"""
from datetime import timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

import models
from auth import _a_utc, _ahora, require_user
from database import get_db

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])
DIAS_CONSERVAR = 90
MAXIMO = 40


def notificar(db: Session, username: str, tipo: str, titulo: str, mensaje: str = "", datos: Optional[Dict[str, Any]] = None):
    """Agrega una notificación (sin commit: se guarda con lo demás)."""
    db.add(models.Notificacion(username=username, tipo=tipo, titulo=titulo[:250], mensaje=(mensaje or "")[:1000], datos=datos or {}))


def _json(n: models.Notificacion) -> Dict[str, Any]:
    return {
        "id": n.id,
        "tipo": n.tipo,
        "titulo": n.titulo,
        "mensaje": n.mensaje or "",
        "datos": n.datos or {},
        "creada_en": _a_utc(n.creada_en).isoformat() if n.creada_en else None,
        "leida": n.leida_en is not None,
    }


@router.get("")
def mis_notificaciones(db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    N = models.Notificacion
    yo = sesion["username"]
    # Las muy viejas se van solas
    db.query(N).filter(N.username == yo, N.creada_en < _ahora() - timedelta(days=DIAS_CONSERVAR)).delete(synchronize_session=False)
    db.commit()
    filas = db.query(N).filter(N.username == yo).order_by(N.creada_en.desc()).limit(MAXIMO).all()
    no_leidas = db.query(N).filter(N.username == yo, N.leida_en.is_(None)).count()
    return {"no_leidas": no_leidas, "notificaciones": [_json(n) for n in filas]}


@router.post("/leer")
def marcar_leidas(payload: Dict[str, Any] = Body(default={}), db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    """{ids: [...]} marca esas como leídas; {todas: true} todas."""
    N = models.Notificacion
    q = db.query(N).filter(N.username == sesion["username"], N.leida_en.is_(None))
    ids: List[str] = [str(i) for i in (payload.get("ids") or [])]
    if not payload.get("todas"):
        if not ids:
            return {"marcadas": 0}
        q = q.filter(N.id.in_(ids))
    n = q.update({N.leida_en: _ahora()}, synchronize_session=False)
    db.commit()
    return {"marcadas": n}
