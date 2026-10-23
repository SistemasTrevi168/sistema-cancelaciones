"""
PDF de los expedientes (carta, carta del trabajador dos y constancia) en un almacenamiento externo compatible
con S3 (Backblaze B2). En la base solo queda la referencia (tabla «documentos»); el archivo vive en el bucket.

Se activa con estas variables en Railway (si falta alguna, el sistema funciona como antes, sin guardar PDF):
  S3_ENDPOINT  https://s3.us-west-004.backblazeb2.com
  S3_BUCKET    nombre del bucket (privado)
  S3_KEY_ID    keyID de la Application Key
  S3_SECRET    applicationKey
Opcionales: S3_REGION (se toma del endpoint), PDF_DIAS_CONSERVAR (365).

Conservación: los PDF de un expediente «Entregado» se borran cuando cumplen PDF_DIAS_CONSERVAR días de entregado,
PERO solo si antes se incluyeron en un respaldo que descargó un administrador (Usuarios → Respaldos).
Los datos del expediente y su Word no se borran nunca: solo los PDF.
"""
import hashlib
import io
import os
import re
import threading
import time
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import compartir
import kpis
import models
from auth import require_admin, require_user
from database import SessionLocal, get_db

router = APIRouter(tags=["documentos"])

TIPOS = ("carta", "carta2", "constancia")
NOMBRE_TIPO = {"carta": "Carta de instrucción", "carta2": "Carta del trabajador dos", "constancia": "Constancia de folio"}
MAX_MB = 40
DIAS_CONSERVAR = int(os.getenv("PDF_DIAS_CONSERVAR", "365") or 365)
DIAS_AVISO = 30  # se avisan (y entran al respaldo) un mes antes de que les toque
ZONA = ZoneInfo("America/Mexico_City")


# ---------------- Conexión con el bucket ----------------

def _config() -> Optional[Dict[str, str]]:
    c = {k: (os.getenv(k) or "").strip() for k in ("S3_ENDPOINT", "S3_BUCKET", "S3_KEY_ID", "S3_SECRET")}
    if not all(c.values()):
        return None
    if not c["S3_ENDPOINT"].startswith("http"):
        c["S3_ENDPOINT"] = "https://" + c["S3_ENDPOINT"]
    m = re.search(r"s3\.([a-z0-9-]+)\.backblazeb2\.com", c["S3_ENDPOINT"])
    c["S3_REGION"] = (os.getenv("S3_REGION") or "").strip() or (m.group(1) if m else "us-east-1")
    return c


def configurado() -> bool:
    return _config() is not None


_cliente_cache: Dict[str, Any] = {}


def _cliente():
    c = _config()
    if not c:
        raise HTTPException(status_code=503, detail="El almacenamiento de PDF no está configurado.")
    clave = "|".join(c.values())
    if _cliente_cache.get("clave") != clave:
        import boto3
        from botocore.config import Config
        _cliente_cache["cliente"] = boto3.client(
            "s3", endpoint_url=c["S3_ENDPOINT"], region_name=c["S3_REGION"],
            aws_access_key_id=c["S3_KEY_ID"], aws_secret_access_key=c["S3_SECRET"],
            # B2 no acepta los encabezados de checksum que las versiones nuevas de boto3 mandan por defecto
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"},
                          request_checksum_calculation="when_required", response_checksum_validation="when_required",
                          connect_timeout=10, read_timeout=60),
        )
        _cliente_cache["clave"] = clave
        _cliente_cache["bucket"] = c["S3_BUCKET"]
    return _cliente_cache["cliente"], _cliente_cache["bucket"]


def _subir(clave: str, contenido: bytes):
    s3, bucket = _cliente()
    s3.put_object(Bucket=bucket, Key=clave, Body=contenido, ContentType="application/pdf")


def _bajar(clave: str) -> bytes:
    s3, bucket = _cliente()
    return s3.get_object(Bucket=bucket, Key=clave)["Body"].read()


def _borrar(clave: str):
    s3, bucket = _cliente()
    s3.delete_object(Bucket=bucket, Key=clave)


# ---------------- Utilidades ----------------

def _expediente_autorizado(db: Session, expediente_id: str, usuario: dict):
    try:
        uid = uuid.UUID(str(expediente_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de expediente inválido")
    exp = db.query(models.Expediente).filter(models.Expediente.id == uid).first()
    if not exp or not compartir.tiene_acceso(db, exp, usuario):
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    return exp


def _nombre_seguro(nombre: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(nombre or "documento.pdf")).strip("._") or "documento"
    return base[:80] if base.lower().endswith(".pdf") else base[:76] + ".pdf"


def _fila(d: models.Documento) -> Dict[str, Any]:
    return {"id": d.id, "tipo": d.tipo, "nombre": d.nombre, "tamano": d.tamano, "subido_por": d.subido_por,
            "subido_en": d.subido_en.isoformat() if d.subido_en else None}


def _a_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def vigentes(db: Session, expediente_id: str) -> List[models.Documento]:
    D = models.Documento
    return (db.query(D).filter(D.expediente_id == str(expediente_id), D.borrado_en.is_(None))
            .order_by(D.subido_en.desc()).all())


# ---------------- Endpoints de los usuarios ----------------

@router.get("/api/expedientes/{expediente_id}/documentos")
def listar(expediente_id: str, db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    _expediente_autorizado(db, expediente_id, usuario)
    if not configurado():
        return {"configurado": False, "documentos": []}
    # Uno por tipo: el más reciente
    vistos, salida = set(), []
    for d in vigentes(db, expediente_id):
        if d.tipo not in vistos:
            vistos.add(d.tipo)
            salida.append(_fila(d))
    orden = {t: i for i, t in enumerate(TIPOS)}
    return {"configurado": True, "documentos": sorted(salida, key=lambda x: orden.get(x["tipo"], 9))}


@router.post("/api/expedientes/{expediente_id}/documentos")
async def subir(
    expediente_id: str,
    archivos: List[UploadFile] = File(...),
    tipos: List[str] = Form(...),
    db: Session = Depends(get_db),
    usuario: dict = Depends(require_user),
):
    """Guarda (o reemplaza) los PDF del expediente. Si un PDF es idéntico al que ya estaba, no se vuelve a subir."""
    exp = _expediente_autorizado(db, expediente_id, usuario)
    if not configurado():
        raise HTTPException(status_code=503, detail="El almacenamiento de PDF no está configurado.")
    if len(archivos) != len(tipos):
        raise HTTPException(status_code=400, detail="Cada archivo necesita su tipo (carta, carta2 o constancia).")
    D = models.Documento
    guardados, iguales = [], []
    for archivo, tipo in zip(archivos, tipos):
        tipo = str(tipo or "").strip().lower()
        if tipo not in TIPOS:
            raise HTTPException(status_code=400, detail=f"Tipo de documento no válido: {tipo}")
        contenido = await archivo.read()
        if len(contenido) > MAX_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"{archivo.filename} pesa más de {MAX_MB} MB.")
        if not contenido.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail=f"{archivo.filename} no es un PDF.")
        huella = hashlib.sha256(contenido).hexdigest()
        anteriores = [d for d in vigentes(db, expediente_id) if d.tipo == tipo]
        if anteriores and anteriores[0].huella == huella:
            iguales.append(tipo)
            continue
        clave = f"expedientes/{expediente_id}/{tipo}-{uuid.uuid4().hex[:10]}-{_nombre_seguro(archivo.filename)}"
        try:
            _subir(clave, contenido)
        except HTTPException:
            raise
        except Exception as e:
            print(f"Aviso: no se pudo subir {clave}: {e}")
            raise HTTPException(status_code=502, detail="No se pudo guardar el PDF en el almacenamiento. Intenta de nuevo.")
        db.add(D(expediente_id=str(expediente_id), tipo=tipo, nombre=os.path.basename(archivo.filename or "documento.pdf")[:200],
                 clave=clave, tamano=len(contenido), huella=huella, subido_por=usuario.get("username")))
        # El que estaba antes de ese tipo se reemplaza
        for viejo in anteriores:
            try:
                _borrar(viejo.clave)
            except Exception as e:
                print(f"Aviso: no se pudo borrar {viejo.clave}: {e}")
            viejo.borrado_en = datetime.now(timezone.utc)
            viejo.motivo_borrado = "reemplazado"
        guardados.append(tipo)
    db.commit()
    if guardados:
        kpis.registrar(usuario.get("username"), "documentos", exp.id, exp.numero_credito,
                       tipos=guardados, nombres=[NOMBRE_TIPO[t] for t in guardados])
    return {"status": "exito", "guardados": guardados, "sin_cambios": iguales}


@router.get("/api/documentos/{documento_id}/archivo")
def archivo(documento_id: str, db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    d = db.query(models.Documento).filter(models.Documento.id == str(documento_id), models.Documento.borrado_en.is_(None)).first()
    if not d:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    _expediente_autorizado(db, d.expediente_id, usuario)
    try:
        contenido = _bajar(d.clave)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Aviso: no se pudo leer {d.clave}: {e}")
        raise HTTPException(status_code=502, detail="No se pudo leer el PDF del almacenamiento.")
    nombre = re.sub(r'["\\\r\n]', "", d.nombre)
    return Response(content=contenido, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{nombre}"', "Cache-Control": "private, max-age=300"})


# ---------------- Conservación: 12 meses después de «Entregado» ----------------

def _fechas_de_entrega(db: Session) -> Dict[str, datetime]:
    """{expediente_id: cuándo se marcó Entregado (la última vez)} de los expedientes que HOY están entregados."""
    E, A = models.Expediente, models.Actividad
    entregados = {str(e.id): e for e in db.query(E).filter(E.estado == "ENTREGADO").all()}
    if not entregados:
        return {}
    fechas: Dict[str, datetime] = {}
    for a in db.query(A).filter(A.tipo == "estado", A.expediente_id.in_(list(entregados))).all():
        if str((a.detalle or {}).get("a") or "").upper() == "ENTREGADO":
            f = _a_utc(a.creado_en)
            if f and (a.expediente_id not in fechas or f > fechas[a.expediente_id]):
                fechas[a.expediente_id] = f
    for i, e in entregados.items():  # sin registro del cambio de estado: se toma la fecha del expediente
        fechas.setdefault(i, _a_utc(e.fecha_creacion) or datetime.now(timezone.utc))
    return fechas


def _por_vencer(db: Session, dias_aviso: int = DIAS_AVISO):
    """Documentos de expedientes entregados cuyo plazo vence en `dias_aviso` días o menos (o ya venció)."""
    ahora = datetime.now(timezone.utc)
    fechas = _fechas_de_entrega(db)
    if not fechas:
        return []
    D = models.Documento
    docs = db.query(D).filter(D.borrado_en.is_(None), D.expediente_id.in_(list(fechas))).all()
    salida = []
    for d in docs:
        vence = fechas[d.expediente_id] + timedelta(days=DIAS_CONSERVAR)
        if vence - ahora <= timedelta(days=dias_aviso):
            salida.append((d, vence))
    return salida


def borrar_vencidos() -> int:
    """Borra del bucket los PDF vencidos que YA están en un respaldo descargado. Regresa cuántos borró."""
    if not configurado():
        return 0
    db = SessionLocal()
    try:
        ahora = datetime.now(timezone.utc)
        n = 0
        for d, vence in _por_vencer(db, 0):
            if vence > ahora or not d.respaldado_en:
                continue
            try:
                _borrar(d.clave)
            except Exception as e:
                print(f"Aviso: no se pudo borrar {d.clave}: {e}")
                continue
            d.borrado_en = ahora
            d.motivo_borrado = f"{DIAS_CONSERVAR} días después de entregado"
            n += 1
        if n:
            db.add(models.Actividad(username="sistema", tipo="mantenimiento",
                                    detalle={"tarea": "borrar_pdfs_vencidos", "borrados": n}))
        db.commit()
        if n:
            print(f"--> Se borraron {n} PDF de expedientes entregados hace más de {DIAS_CONSERVAR} días (ya respaldados)")
        return n
    except Exception as e:
        db.rollback()
        print(f"Aviso: no se pudieron borrar los PDF vencidos: {e}")
        return 0
    finally:
        db.close()


def borrar_de_expedientes(db: Session, expediente_ids: List[str]):
    """Al eliminar expedientes se borran también sus PDF del bucket (sin hacer commit)."""
    if not expediente_ids:
        return
    D = models.Documento
    for d in db.query(D).filter(D.expediente_id.in_([str(i) for i in expediente_ids]), D.borrado_en.is_(None)).all():
        if configurado():
            try:
                _borrar(d.clave)
            except Exception as e:
                print(f"Aviso: no se pudo borrar {d.clave}: {e}")
        d.borrado_en = datetime.now(timezone.utc)
        d.motivo_borrado = "expediente eliminado"


def iniciar_programador():
    """Una vez al día revisa si hay PDF vencidos (ya respaldados) para borrar."""
    if os.getenv("RESPALDOS_DESACTIVADOS") == "1":
        return

    def ciclo():
        time.sleep(180)
        while True:
            borrar_vencidos()
            time.sleep(24 * 3600)

    threading.Thread(target=ciclo, name="pdfs-vencidos", daemon=True).start()


# ---------------- Endpoints del administrador ----------------

@router.get("/api/admin/documentos/resumen")
def resumen(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    D = models.Documento
    if not configurado():
        return {"configurado": False, "dias_conservar": DIAS_CONSERVAR}
    vivos = db.query(D).filter(D.borrado_en.is_(None)).all()
    ahora = datetime.now(timezone.utc)
    por_vencer = _por_vencer(db)
    sin_respaldo = [(d, v) for d, v in por_vencer if not d.respaldado_en]
    listos = [(d, v) for d, v in por_vencer if d.respaldado_en and v <= ahora]
    proxima = min((v for _, v in sin_respaldo), default=None)
    return {
        "configurado": True,
        "dias_conservar": DIAS_CONSERVAR,
        "dias_aviso": DIAS_AVISO,
        "archivos": len(vivos),
        "expedientes": len({d.expediente_id for d in vivos}),
        "bytes": sum(d.tamano or 0 for d in vivos),
        "por_respaldar": {
            "archivos": len(sin_respaldo),
            "expedientes": len({d.expediente_id for d, _ in sin_respaldo}),
            "bytes": sum(d.tamano or 0 for d, _ in sin_respaldo),
            "primera_fecha": proxima.astimezone(ZONA).date().isoformat() if proxima else None,
        },
        "por_borrar": {"archivos": len(listos), "expedientes": len({d.expediente_id for d, _ in listos})},
    }


@router.get("/api/admin/documentos/respaldo")
def respaldo_por_vencer(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    """ZIP con los PDF que se borrarán en los próximos días (o que ya vencieron). Al descargarlo se pueden borrar."""
    if not configurado():
        raise HTTPException(status_code=503, detail="El almacenamiento de PDF no está configurado.")
    pendientes = [(d, v) for d, v in _por_vencer(db) if not d.respaldado_en]
    if not pendientes:
        raise HTTPException(status_code=404, detail="No hay PDF por respaldar.")
    E = models.Expediente
    exps = {str(e.id): e for e in db.query(E).filter(E.id.in_([uuid.UUID(d.expediente_id) for d, _ in pendientes])).all()}
    buf = io.BytesIO()
    incluidos, fallas = [], []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        lineas = ["Crédito,Acreditado,Documento,Archivo,Entregado + plazo vence"]
        for d, vence in pendientes:
            e = exps.get(d.expediente_id)
            credito = (e.numero_credito if e else "sin_credito") or "sin_credito"
            acreditado = str(((e.datos_extraidos or {}).get("nombre_acreditado") if e else "") or "").strip()
            carpeta = re.sub(r'[\\/:*?"<>|]+', " ", f"{credito} - {acreditado}" if acreditado else credito).strip()[:90]
            try:
                contenido = _bajar(d.clave)
            except Exception as ex:
                print(f"Aviso: no se pudo leer {d.clave} para el respaldo: {ex}")
                fallas.append(d.nombre)
                continue
            nombre = f"{carpeta}/{NOMBRE_TIPO.get(d.tipo, d.tipo)} - {d.nombre}"
            z.writestr(nombre, contenido)
            incluidos.append(d)
            lineas.append(f'{credito},"{acreditado}",{NOMBRE_TIPO.get(d.tipo, d.tipo)},"{d.nombre}",{vence.astimezone(ZONA).date().isoformat()}')
        z.writestr("indice.csv", "﻿" + "\n".join(lineas))
        z.writestr("LEEME.txt", (
            "Respaldo de los PDF de expedientes entregados\n"
            f"Creado: {datetime.now(ZONA).strftime('%Y-%m-%d %H:%M')} por {admin.get('username')}\n\n"
            f"Estos PDF se borran del almacenamiento {DIAS_CONSERVAR} días después de que su expediente se marcó «Entregado».\n"
            "Los datos de cada expediente y su Word siguen en el sistema.\n"
            "Guarda este ZIP en un lugar seguro (por ejemplo, la unidad compartida del área).\n"
        ))
    if not incluidos:
        raise HTTPException(status_code=502, detail="No se pudieron leer los PDF del almacenamiento.")
    ahora = datetime.now(timezone.utc)
    for d in incluidos:
        d.respaldado_en = ahora
    db.add(models.Actividad(username=admin.get("username") or "admin", tipo="mantenimiento",
                            detalle={"tarea": "respaldo_pdfs", "archivos": len(incluidos), "fallas": len(fallas)}))
    db.commit()
    nombre_zip = f"respaldo_pdfs_{datetime.now(ZONA).strftime('%Y-%m-%d_%H%M')}.zip"
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{nombre_zip}"'})
