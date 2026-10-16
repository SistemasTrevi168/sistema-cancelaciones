"""
Respaldos de la información del sistema.

- Una vez al día (y cuando el admin lo pide) se arma un ZIP con toda la base: usuarios, expedientes,
  bitácora, plantillas subidas y versiones de plantillas, más los archivos de /templates.
- Se guardan en la tabla "respaldos" (los últimos 7 automáticos y los últimos 5 manuales).
- El admin los descarga desde Usuarios → Respaldos para tener una copia fuera del servidor.
  Con el respaldo se puede reconstruir todo (los Word se vuelven a generar con los datos y su versión de plantilla).
"""
import base64
import io
import json
import os
import threading
import time
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

import models
from auth import require_admin
from database import SessionLocal, get_db

router = APIRouter(prefix="/api/admin/respaldos", tags=["respaldos"])
CONSERVAR_AUTOMATICOS = 7
CONSERVAR_MANUALES = 5
CADA_HORAS = 24
ZONA = ZoneInfo("America/Mexico_City")


def _valor(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"base64": base64.b64encode(bytes(v)).decode()}
    if hasattr(v, "hex") and v.__class__.__name__ == "UUID":
        return str(v)
    return v


def _tabla(db: Session, modelo) -> List[Dict[str, Any]]:
    columnas = [c.name for c in modelo.__table__.columns]
    return [{c: _valor(getattr(fila, c)) for c in columnas} for fila in db.query(modelo).all()]


def armar_zip(db: Session) -> bytes:
    buf = io.BytesIO()
    ahora = datetime.now(timezone.utc)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        resumen = {"creado_en": ahora.isoformat(), "tablas": {}}
        for nombre, modelo in [("usuarios", models.Usuario), ("expedientes", models.Expediente),
                               ("actividad", models.Actividad), ("plantillas_subidas", models.PlantillaSubida),
                               ("plantilla_versiones", models.PlantillaVersion)]:
            filas = _tabla(db, modelo)
            resumen["tablas"][nombre] = len(filas)
            z.writestr(f"base/{nombre}.json", json.dumps(filas, ensure_ascii=False, indent=1, default=str))
        carpeta = "templates"
        if os.path.isdir(carpeta):
            for f in sorted(os.listdir(carpeta)):
                ruta = os.path.join(carpeta, f)
                if f.lower().endswith(".docx") and os.path.isfile(ruta) and not f.startswith("~$"):
                    z.write(ruta, arcname=f"plantillas/{f}")
        z.writestr("LEEME.txt", (
            "Respaldo del Sistema de Cancelaciones\n"
            f"Creado: {ahora.astimezone(ZONA).strftime('%Y-%m-%d %H:%M')}\n\n"
            "base/      -> tablas de la base de datos en formato JSON\n"
            "plantillas/ -> plantillas Word que había en el servidor\n\n"
            "Los Word de cada expediente se pueden volver a generar con sus datos (expedientes.json)\n"
            "y la versión de plantilla que usaron (plantilla_versiones.json).\n"
        ))
        z.writestr("resumen.json", json.dumps(resumen, ensure_ascii=False, indent=1))
    return buf.getvalue()


def crear(db: Session, automatico: bool, usuario: str = "sistema") -> models.Respaldo:
    contenido = armar_zip(db)
    r = models.Respaldo(automatico=automatico, creado_por=usuario, tamano=len(contenido), contenido=contenido)
    db.add(r)
    db.commit()
    db.refresh(r)
    # Solo se conservan los más recientes
    limite = CONSERVAR_AUTOMATICOS if automatico else CONSERVAR_MANUALES
    viejos = (db.query(models.Respaldo.id).filter(models.Respaldo.automatico == automatico)
              .order_by(models.Respaldo.creado_en.desc()).offset(limite).all())
    if viejos:
        db.query(models.Respaldo).filter(models.Respaldo.id.in_([v[0] for v in viejos])).delete(synchronize_session=False)
        db.commit()
    return r


def _a_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def revisar_respaldo_diario():
    """Crea el respaldo automático si el último tiene más de 24 horas."""
    db = SessionLocal()
    try:
        ultimo = (db.query(models.Respaldo.creado_en).filter(models.Respaldo.automatico.is_(True))
                  .order_by(models.Respaldo.creado_en.desc()).first())
        if ultimo and ultimo[0] and datetime.now(timezone.utc) - _a_utc(ultimo[0]) < timedelta(hours=CADA_HORAS):
            return False
        crear(db, automatico=True)
        print("--> Respaldo automático creado")
        return True
    except Exception as e:
        db.rollback()
        print(f"Aviso: no se pudo crear el respaldo automático: {e}")
        return False
    finally:
        db.close()


def iniciar_programador():
    """Revisa cada hora (en segundo plano) si toca el respaldo del día."""
    if os.getenv("RESPALDOS_DESACTIVADOS") == "1":
        return

    def ciclo():
        time.sleep(90)  # se deja arrancar al servidor primero
        while True:
            revisar_respaldo_diario()
            time.sleep(3600)

    threading.Thread(target=ciclo, name="respaldos", daemon=True).start()


def _fila(r) -> Dict[str, Any]:
    return {"id": r.id, "creado_en": _a_utc(r.creado_en).isoformat() if r.creado_en else None,
            "automatico": bool(r.automatico), "creado_por": r.creado_por, "tamano": r.tamano}


@router.get("")
def listar(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    filas = (db.query(models.Respaldo.id, models.Respaldo.creado_en, models.Respaldo.automatico,
                      models.Respaldo.creado_por, models.Respaldo.tamano)
             .order_by(models.Respaldo.creado_en.desc()).all())
    return {"respaldos": [_fila(r) for r in filas], "cada_horas": CADA_HORAS}


@router.post("")
def crear_ahora(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    r = crear(db, automatico=False, usuario=admin["username"])
    return _fila(r)


@router.get("/{respaldo_id}")
def descargar(respaldo_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    r = db.query(models.Respaldo).filter(models.Respaldo.id == respaldo_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")
    fecha = _a_utc(r.creado_en).astimezone(ZONA).strftime("%Y-%m-%d_%H%M") if r.creado_en else "respaldo"
    return Response(content=bytes(r.contenido), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="Respaldo_Cancelaciones_{fecha}.zip"'})
