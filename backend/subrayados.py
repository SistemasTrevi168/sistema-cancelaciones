"""
Subrayados en los PDF del visor (constancia, carta…). Se guardan por la huella (sha256) del archivo,
así el mismo PDF muestra sus subrayados al generar el expediente, en la carga masiva y al editarlo.
"""
import re
from typing import Any, Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

import models
from auth import require_user
from database import get_db

router = APIRouter(prefix="/api/subrayados", tags=["subrayados"])

COLORES = ("amarillo", "verde", "azul", "rosa", "naranja")
MAX_MARCAS = 1500
MAX_RECTS = 300


def _huella(huella: str) -> str:
    h = str(huella or "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", h):
        raise HTTPException(status_code=400, detail="Huella de archivo no válida.")
    return h


def _num(v: Any) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Subrayado con medidas no válidas.")
    if n != n or abs(n) > 100000:
        raise HTTPException(status_code=400, detail="Subrayado con medidas no válidas.")
    return round(n, 2)


def limpiar(marcas: Any) -> List[Dict[str, Any]]:
    if not isinstance(marcas, list):
        raise HTTPException(status_code=400, detail="Se esperaba una lista de subrayados.")
    if len(marcas) > MAX_MARCAS:
        raise HTTPException(status_code=400, detail=f"Demasiados subrayados (máximo {MAX_MARCAS}).")
    salida = []
    for m in marcas:
        if not isinstance(m, dict):
            continue
        rects = m.get("rects")
        if not isinstance(rects, list) or not rects:
            continue
        rects = [[_num(x) for x in r[:4]] for r in rects[:MAX_RECTS] if isinstance(r, (list, tuple)) and len(r) >= 4]
        if not rects:
            continue
        try:
            pagina = int(m.get("pagina"))
        except (TypeError, ValueError):
            continue
        if pagina < 1 or pagina > 5000:
            continue
        color = str(m.get("color") or "").lower()
        if color not in COLORES and not re.fullmatch(r"#[0-9a-f]{6}", color):
            color = "amarillo"
        salida.append({
            "id": str(m.get("id") or "")[:40] or f"m{len(salida)}",
            "pagina": pagina,
            "color": color,
            "rects": rects,
            "texto": str(m.get("texto") or "")[:500],
        })
    return salida


@router.get("/{huella}")
def ver(huella: str, db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    fila = db.query(models.Subrayado).filter(models.Subrayado.huella == _huella(huella)).first()
    return {"marcas": (fila.marcas if fila else []) or []}


@router.put("/{huella}")
def guardar(huella: str, payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    h = _huella(huella)
    marcas = limpiar(payload.get("marcas"))
    fila = db.query(models.Subrayado).filter(models.Subrayado.huella == h).first()
    if fila is None:
        if not marcas:
            return {"marcas": []}
        fila = models.Subrayado(huella=h, marcas=marcas, actualizado_por=usuario.get("username"))
        db.add(fila)
    else:
        fila.marcas = marcas
        fila.actualizado_por = usuario.get("username")
    db.commit()
    return {"marcas": marcas}
