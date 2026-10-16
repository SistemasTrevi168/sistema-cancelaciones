"""
Versiones de las plantillas.

Cada vez que se genera un Word se guarda la "huella" (sha256) del archivo .docx que se usó, y una copia
de esa versión en la base (tabla plantilla_versiones, una sola vez por versión). Así, si después la
plantilla cambia, el Word de un expediente viejo se puede volver a generar exactamente igual.
"""
import hashlib
import os
from typing import Dict, Optional, Tuple

from sqlalchemy.orm import Session

import models
from database import SessionLocal

CARPETA_VERSIONES = os.path.join("templates", "_versiones")
_cache_huellas: Dict[Tuple[str, float, int], str] = {}


def huella(ruta: str) -> Optional[str]:
    """Huella corta (16 caracteres) del archivo; se recuerda mientras el archivo no cambie."""
    try:
        st = os.stat(ruta)
    except OSError:
        return None
    clave = (os.path.abspath(ruta), st.st_mtime, st.st_size)
    if clave not in _cache_huellas:
        with open(ruta, "rb") as f:
            _cache_huellas[clave] = hashlib.sha256(f.read()).hexdigest()[:16]
    return _cache_huellas[clave]


def registrar(nombre: str, ruta: str) -> Optional[str]:
    """Guarda en la base la versión actual de la plantilla (si no estaba) y regresa su huella.
    Usa su propia conexión para no afectar la operación que está generando el Word."""
    h = huella(ruta)
    if not h:
        return None
    db = SessionLocal()
    try:
        if not db.query(models.PlantillaVersion.huella).filter(models.PlantillaVersion.huella == h).first():
            with open(ruta, "rb") as f:
                db.add(models.PlantillaVersion(huella=h, nombre=os.path.basename(nombre or ruta), contenido=f.read()))
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Aviso: no se pudo guardar la versión de la plantilla {nombre}: {e}")
    finally:
        db.close()
    return h


def ruta_de(db: Session, h: Optional[str]) -> Optional[str]:
    """Archivo .docx de una versión guardada (se escribe en disco desde la base si hace falta)."""
    if not h or not h.isalnum():
        return None
    ruta = os.path.join(CARPETA_VERSIONES, f"{h}.docx")
    if os.path.exists(ruta):
        return ruta
    fila = db.query(models.PlantillaVersion).filter(models.PlantillaVersion.huella == h).first()
    if not fila:
        return None
    os.makedirs(CARPETA_VERSIONES, exist_ok=True)
    with open(ruta, "wb") as f:
        f.write(fila.contenido)
    return ruta


def info(db: Session, h: Optional[str]) -> Optional[dict]:
    if not h:
        return None
    fila = db.query(models.PlantillaVersion.huella, models.PlantillaVersion.nombre, models.PlantillaVersion.creada_en) \
        .filter(models.PlantillaVersion.huella == h).first()
    if not fila:
        return None
    return {"huella": fila[0], "nombre": fila[1], "desde": fila[2].isoformat() if fila[2] else None}
