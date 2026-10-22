import os
import shutil
import zipfile
import re
import pathlib
import uuid
import time
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, UploadFile, BackgroundTasks, File, Form, Depends, HTTPException, Body, Query, Header, Request
from pydantic import BaseModel
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
import pandas as pd

import models, services
from database import get_db, SessionLocal, engine
import auth
import actos_ifrem
import nombres
import plantilla_sugerida
import kpis
import perfil
import versiones
import respaldos
import reparaciones
import compartir
from auth import require_user, require_admin

# URL directa a PostgreSQL en Railway
DATABASE_URL = os.getenv("DATABASE_URL")

# Crear las tablas en PostgreSQL automáticamente al arrancar
models.Base.metadata.create_all(bind=engine)

# create_all no agrega columnas nuevas a tablas que ya existen: se agregan aquí
# (es seguro correrlo en cada arranque gracias a IF NOT EXISTS)
try:
    with engine.begin() as _conn:
        _conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE"))
        for _col in ("nombre_mostrar VARCHAR", "foto TEXT", "color_acento VARCHAR", "tema VARCHAR", "rol VARCHAR"):
            _conn.execute(text(f"ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS {_col}"))
        _conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE"))
        for _col in ("user_agent VARCHAR", "ip VARCHAR", "ultimo_uso TIMESTAMP WITH TIME ZONE"):
            _conn.execute(text(f"ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS {_col}"))
except Exception as _e:
    print(f"Aviso al actualizar la tabla usuarios: {_e}")

app = FastAPI(title="Sistema de Cancelaciones de Hipotecas")

# --- CATÁLOGO DE LAS 20 PLANTILLAS NOTARIALES 2026 ---
TEMPLATES_DIR = "templates"

PLANTILLAS_CATALOGO = {
    # 1. MODELOS CDMX 2026
    "CDMX_AP_H_CASADO": "CDMX_AP_H_CASADO.docx",
    "CDMX_AP_H_SOLTERO": "CDMX_AP_H_SOLTERO.docx",
    "CDMX_AP_M_CASADA": "CDMX_AP_M_CASADA.docx",
    "CDMX_AP_M_SOLTERA": "CDMX_AP_M_SOLTERA.docx",
    "CDMX_MUTUO_H_CASADO": "CDMX_MUTUO_H_CASADO.docx",
    "CDMX_MUTUO_H_SOLTERO": "CDMX_MUTUO_H_SOLTERO.docx",
    "CDMX_MUTUO_M_CASADA": "CDMX_MUTUO_M_CASADA.docx",
    "CDMX_MUTUO_M_SOLTERA": "CDMX_MUTUO_M_SOLTERA.docx",

    # 2. MODELOS COACREDITADOS 2026
    "COAC_CDMX_AP": "COAC_CDMX_AP.docx",
    "COAC_CDMX_MUTUO": "COAC_CDMX_MUTUO.docx",
    "COAC_EDOMEX_AP": "COAC_EDOMEX_AP.docx",
    "COAC_EDOMEX_MUTUO": "COAC_EDOMEX_MUTUO.docx",

    # 3. MODELOS EDOMEX 2026
    "EDOMEX_AP_H_CASADO": "EDOMEX_AP_H_CASADO.docx",
    "EDOMEX_AP_H_SOLTERO": "EDOMEX_AP_H_SOLTERO.docx",
    "EDOMEX_AP_M_CASADA": "EDOMEX_AP_M_CASADA.docx",
    "EDOMEX_AP_M_SOLTERA": "EDOMEX_AP_M_SOLTERA.docx",
    "EDOMEX_MUTUO_H_CASADO": "EDOMEX_MUTUO_H_CASADO.docx",
    "EDOMEX_MUTUO_H_SOLTERO": "EDOMEX_MUTUO_H_SOLTERO.docx",
    "EDOMEX_MUTUO_M_CASADA": "EDOMEX_MUTUO_M_CASADA.docx",
    "EDOMEX_MUTUO_M_SOLTERA": "EDOMEX_MUTUO_M_SOLTERA.docx",
}

def es_admin(usuario: dict) -> bool:
    return bool(usuario and usuario.get("es_admin"))


def obtener_expediente_autorizado(db: Session, expediente_id: str, usuario: dict):
    """Busca el expediente y verifica que pertenezca al usuario (o que sea admin)."""
    try:
        uuid_val = uuid.UUID(str(expediente_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de expediente inválido")

    expediente = db.query(models.Expediente).filter(models.Expediente.id == uuid_val).first()
    if not expediente:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")

    if not compartir.tiene_acceso(db, expediente, usuario):
        # Se responde 404 para no revelar que el expediente existe
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    return expediente


# --- MANEJO DE ARCHIVOS: nombres únicos para que nunca se pisen entre usuarios ---
UPLOADS_DIR = "uploads"
GENERADOS_DIR = os.path.join("uploads", "generados")
ZIPS_DIR = os.path.join("uploads", "zips")


def nombre_seguro(texto: str, defecto: str = "archivo") -> str:
    """Deja solo caracteres válidos para un nombre de archivo."""
    limpio = re.sub(r'[^\w\-. ()]', '_', str(texto or "")).strip(" .")
    return limpio or defecto


def guardar_upload(file: UploadFile) -> tuple:
    """Guarda el archivo subido con un prefijo único. Regresa (ruta_en_disco, nombre_original)."""
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    nombre_original = os.path.basename((file.filename or "archivo").replace("\\", "/"))
    ruta = os.path.join(UPLOADS_DIR, f"{uuid.uuid4().hex[:12]}_{nombre_seguro(nombre_original)}")
    with open(ruta, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return ruta, nombre_original


def ruta_word_unica(num_credito: str) -> str:
    """Ruta única para un Word generado (el nombre de descarga sigue siendo Cancelacion_<credito>.docx)."""
    os.makedirs(GENERADOS_DIR, exist_ok=True)
    return os.path.join(GENERADOS_DIR, f"Cancelacion_{nombre_seguro(num_credito, 'SIN_CREDITO')}_{uuid.uuid4().hex[:8]}.docx")


def borrar_archivos(rutas):
    """Borra archivos temporales sin interrumpir el proceso si alguno falla."""
    for ruta in rutas or []:
        try:
            if ruta and os.path.isfile(ruta):
                os.remove(ruta)
        except Exception as e:
            print(f"No se pudo borrar {ruta}: {e}")


def reemplazar_word_anterior(ruta_anterior: Optional[str], ruta_nueva: str):
    """Al regenerar un Word, borra la versión anterior de ese mismo expediente."""
    if ruta_anterior and ruta_anterior != ruta_nueva and os.path.abspath(ruta_anterior).startswith(os.path.abspath(GENERADOS_DIR)):
        borrar_archivos([ruta_anterior])


def asegurar_word(expediente, db: Session) -> Optional[str]:
    """
    Regresa la ruta del Word del expediente. Si el archivo ya no existe
    (por ejemplo, Railway borró el disco al redesplegar), lo vuelve a generar
    a partir de los datos guardados en la base de datos.
    """
    if expediente.ruta_word_generado and os.path.exists(expediente.ruta_word_generado):
        return expediente.ruta_word_generado

    datos = dict(expediente.datos_extraidos or {})
    if not datos:
        return None
    num_credito = datos.get("numero_credito") or expediente.numero_credito
    nombre_plantilla = datos.get("plantilla_seleccionada") or datos.get("plantilla") or "plantilla_manera2.docx"
    ruta_salida = ruta_word_unica(num_credito)
    try:
        # Se usa la misma versión de plantilla con la que se generó la primera vez
        exito = generar_word_versionado(db, nombre_plantilla, datos, ruta_salida, version=datos.get("_plantilla_version"))
    except Exception as e:
        print(f"No se pudo regenerar el Word de {expediente.id}: {e}")
        return None
    if not exito or not os.path.exists(ruta_salida):
        return None
    expediente.ruta_word_generado = ruta_salida
    db.commit()
    return ruta_salida


# --- ACTOS DE LA CONSTANCIA (IFREM) ---
CAMPOS_DE_ACTO = ["numero_escritura", "fecha_escritura", "notario_origen_completo", "monto_credito"]


def reunir_actos(lista_datos: List[Dict[str, Any]], nombres: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Saca los actos de cada documento (y los quita de los datos para no mezclarlos al combinar)."""
    actos = []
    for i, datos in enumerate(lista_datos):
        for acto in datos.pop("_actos", None) or []:
            acto = dict(acto)
            acto["documento"] = (nombres[i] if nombres and i < len(nombres) else f"Documento {i + 1}")
            acto["id"] = f"{i + 1}-{acto['id']}"
            acto["datos"] = actos_ifrem.datos_de_acto(acto, services)
            actos.append(acto)
    return actos


def sugerir_plantilla_seguro(datos, actos, lista_datos):
    """La sugerencia nunca debe impedir procesar el expediente."""
    try:
        return plantilla_sugerida.sugerir_plantilla(datos, actos, lista_datos)
    except Exception as e:
        print(f"No se pudo sugerir plantilla: {e}")
        return None


def _fecha_acto(acto):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(acto.get("fecha") or ""))
    return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else (0, 0, 0)


def aplicar_acto_elegido(datos: Dict[str, Any], actos: List[Dict[str, Any]]) -> Optional[str]:
    """
    En constancias largas hay varios actos: se toma la escritura, fecha, notario y monto
    del acto de hipoteca que corresponde a este crédito (no del primero que aparezca).
    El acreditado y su cónyuge salen de ese mismo acto; si no los trae, del acto de propiedad
    más reciente y, al final, de la tabla de propietarios de la primera hoja.
    """
    nombre_carta = datos.pop("_nombre_carta", "") or ""
    propietarios = datos.pop("_propietarios", None) or []
    referencia = nombre_carta or datos.get("nombre_acreditado", "")

    # Acreditado y cónyuge de cada acto (se usa el nombre de la carta para saber quién es quién)
    for acto in actos:
        personas = acto["datos"].get("personas") or []
        if personas:
            acreditado, conyuge = actos_ifrem.acreditado_y_conyuge(personas, referencia)
            acto["datos"]["nombre_acreditado"] = acreditado
            acto["datos"]["nombre_conyuge"] = conyuge

    elegido = actos_ifrem.elegir_acto(actos, referencia, datos.get("entidad_financiera", ""))
    for acto in actos:
        acto["elegido"] = bool(elegido and acto["id"] == elegido["id"])
    if elegido:
        # Veces salario: solo si los documentos no lo trajeron (la carta es la fuente principal)
        vsm = elegido["datos"].get("credito_a_salario")
        if vsm and str(datos.get("credito_a_salario") or "").strip() in ("", "NO_ENCONTRADO"):
            datos["credito_a_salario"] = vsm
        for campo in CAMPOS_DE_ACTO:
            valor = elegido["datos"].get(campo)
            if valor:
                datos[campo] = valor
                if campo == "monto_credito":
                    try:
                        datos["monto_credito_letras"] = services.numero_a_letras(float(valor.replace("$", "").replace(",", "")))
                    except Exception:
                        pass

    # Nombre del acreditado y del cónyuge
    fuente = elegido["datos"] if elegido and elegido["datos"].get("nombre_acreditado") else None
    if not fuente:
        de_propiedad = [a for a in actos if a.get("seccion") == "propiedad" and a["datos"].get("nombre_acreditado")]
        if de_propiedad:
            fuente = max(enumerate(de_propiedad), key=lambda x: (_fecha_acto(x[1]), x[0]))[1]["datos"]
    if fuente:
        acreditado, conyuge = fuente["nombre_acreditado"], fuente.get("nombre_conyuge", "")
    else:
        acreditado, conyuge = actos_ifrem.acreditado_y_conyuge(propietarios, referencia)
    if acreditado:
        datos["nombre_acreditado"] = acreditado
    if conyuge:
        datos["nombre_conyuge"] = conyuge
        datos["tiene_conyuge"] = "Sí"
    # La constancia escribe a las personas con los apellidos primero: se dejan con el nombre primero
    # (con el orden de la carta cuando es la misma persona) y el género sale del nombre de pila
    if datos.get("nombre_acreditado") and datos["nombre_acreditado"] != "NO_ENCONTRADO":
        datos["nombre_acreditado"] = nombres.ordenar_nombre(datos["nombre_acreditado"], nombre_carta)
        genero = services.genero_por_nombre(datos["nombre_acreditado"])
        if genero:
            datos["genero"] = genero
    if datos.get("nombre_conyuge") and datos["nombre_conyuge"] != "NO_ENCONTRADO":
        datos["nombre_conyuge"] = nombres.ordenar_nombre(datos["nombre_conyuge"])
    return elegido["id"] if elegido else None


def eliminar_archivo_temporal(ruta: str):
    """Elimina el archivo ZIP del servidor de manera segura después de la descarga."""
    if os.path.exists(ruta):
        try:
            os.remove(ruta)
        except Exception as e:
            print(f"Error al eliminar archivo temporal: {e}")

@app.post("/api/expedientes/descargar-zip")
def descargar_zip(
    expediente_ids: List[Any] = Body(...), 
    background_tasks: BackgroundTasks = None, 
    db: Session = Depends(get_db),
    usuario: dict = Depends(require_user)
):
    os.makedirs(ZIPS_DIR, exist_ok=True)
    # Nombre único por descarga: dos personas descargando a la vez ya no se mezclan
    ruta_zip = os.path.join(ZIPS_DIR, f"Cancelaciones_Lote_{uuid.uuid4().hex}.zip")
    nombres_usados = set()
    
    with zipfile.ZipFile(ruta_zip, 'w') as zipf:
        for entrada in expediente_ids:
            # Cada entrada puede ser solo el id, o {id, datos, plantilla} con los cambios
            # hechos en pantalla (plantilla elegida o datos editados) que aún no se guardaban
            cambios = entrada if isinstance(entrada, dict) else None
            exp_id = (cambios or {}).get("id") if cambios else entrada
            try:
                uuid_val = uuid.UUID(str(exp_id))
            except ValueError:
                continue 
            
            exp = db.query(models.Expediente).filter(models.Expediente.id == uuid_val).first()
            if exp and not compartir.tiene_acceso(db, exp, usuario):
                continue
            if not exp:
                continue
            ruta_word = None
            if cambios and (cambios.get("datos") or cambios.get("plantilla")):
                try:
                    ruta_word, _ = regenerar_word_expediente(exp, {"datos": cambios.get("datos") or {}, "plantilla": cambios.get("plantilla")}, db)
                except Exception as e:
                    db.rollback()
                    print(f"No se pudo regenerar {exp.id} para el ZIP: {e}")
            if not ruta_word:
                ruta_word = asegurar_word(exp, db)
            if ruta_word:
                base = f"Cancelacion_{nombre_seguro(exp.numero_credito, 'SIN_CREDITO')}"
                nombre_archivo = f"{base}.docx"
                contador = 2
                while nombre_archivo in nombres_usados:
                    nombre_archivo = f"{base} ({contador}).docx"
                    contador += 1
                nombres_usados.add(nombre_archivo)
                zipf.write(ruta_word, arcname=nombre_archivo)

    kpis.registrar(usuario["username"], "zip", expedientes=len(nombres_usados))
    if background_tasks:
        background_tasks.add_task(eliminar_archivo_temporal, ruta_zip)

    return FileResponse(
        path=ruta_zip,
        filename="Cancelaciones_Lote.zip",
        media_type="application/zip"
    )

def resolver_ruta_plantilla(nombre_o_clave: Optional[str]) -> str:
    """Resuelve la ruta física del archivo .docx admitiendo clave o nombre directo."""
    if not os.path.exists(TEMPLATES_DIR):
        os.makedirs(TEMPLATES_DIR, exist_ok=True)
        
    if not nombre_o_clave:
        return os.path.join(TEMPLATES_DIR, "plantilla_manera2.docx")
        
    if nombre_o_clave in PLANTILLAS_CATALOGO:
        ruta = os.path.join(TEMPLATES_DIR, PLANTILLAS_CATALOGO[nombre_o_clave])
        if os.path.exists(ruta):
            return ruta

    nombre_archivo = nombre_o_clave if nombre_o_clave.endswith(".docx") else f"{nombre_o_clave}.docx"
    ruta_directa = os.path.join(TEMPLATES_DIR, nombre_archivo)
    if os.path.exists(ruta_directa):
        return ruta_directa

    return os.path.join(TEMPLATES_DIR, "plantilla_manera2.docx")


def generar_word_versionado(db: Session, nombre_plantilla: Optional[str], datos_finales: Dict[str, Any],
                            ruta_salida: str, version: Optional[str] = None) -> bool:
    """
    Genera el Word y anota en los datos la versión de plantilla usada ("_plantilla_version").
    Si se pide una versión guardada (la del Word original), se usa esa aunque la plantilla haya cambiado.
    """
    ruta = versiones.ruta_de(db, version) if version else None
    if ruta:
        usada = version
    else:
        ruta = resolver_ruta_plantilla(nombre_plantilla)
        usada = versiones.registrar(nombre_plantilla or ruta, ruta)
    exito = services.generar_word_cancelacion(ruta, datos_finales, ruta_salida)
    if exito and usada:
        datos_finales["_plantilla_version"] = usada
    return exito


# --- ESTADOS DEL EXPEDIENTE ---
ESTADOS = ["GENERADO", "REVISADO", "ENTREGADO"]


def estado_de(expediente) -> str:
    """Los expedientes de antes (PENDIENTE, etc.) cuentan como GENERADO."""
    e = str(getattr(expediente, "estado", "") or "").upper()
    return e if e in ESTADOS else "GENERADO"


def diferencias(antes: Dict[str, Any], despues: Dict[str, Any]) -> Dict[str, List[str]]:
    """Datos que cambiaron (para el historial de cambios del expediente)."""
    cambios = {}
    for k in sorted(CAMPOS_EDITABLES | {"plantilla_seleccionada"}):
        a, d = str(antes.get(k) or "").strip(), str(despues.get(k) or "").strip()
        if a.upper() == "NO_ENCONTRADO":
            a = ""
        if a != d:
            cambios[k] = [a[:300], d[:300]]
    return cambios


# --- FUNCIONES DE CONVERSIÓN Y EXTRACCIÓN ---

def convertir_romanos_a_texto(texto: str) -> str:
    """Convierte números romanos (ej. IV) a su representación descriptiva (ej. cuatro romano)."""
    if not texto:
        return ""
    romanos = {
        'I': 'uno romano', 'II': 'dos romano', 'III': 'tres romano',
        'IV': 'cuatro romano', 'V': 'cinco romano', 'VI': 'seis romano',
        'VII': 'siete romano', 'VIII': 'ocho romano', 'IX': 'nueve romano',
        'X': 'diez romano', 'XI': 'once romano', 'XII': 'doce romano',
        'XIII': 'trece romano', 'XIV': 'catorce romano', 'XV': 'quince romano'
    }
    def replace_romano(match):
        r = match.group(0).upper()
        return romanos.get(r, r)
    
    patron_romanos = r'\b(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})\b'
    resultado = re.sub(patron_romanos, replace_romano, str(texto))
    return resultado


def ajustar_digitos_segun_longitud(texto: str) -> str:
    """Si hay números de más de dos dígitos, los extrae en formato de cantidad o letra."""
    if not texto:
        return ""
    def procesar_num(match):
        num_str = match.group(0)
        if len(num_str) > 2:
            return f"{num_str} (cantidad extendida)"
        return num_str
    return re.sub(r'\d+', procesar_num, str(texto))


def numero_a_letras(monto: Any) -> str:
    """Monto con letra en pesos (misma regla que services.numero_a_letras)."""
    if not monto:
        return ""
    monto_str = re.sub(r"[^\d.]", "", str(monto))
    try:
        return services.numero_a_letras(float(monto_str))
    except Exception:
        return str(monto)


def numero_folio_a_letras(monto: Any) -> str:
    """Número de folio con letra, sin moneda: 21 -> VEINTIUNO."""
    if not monto:
        return ""
    monto_str = re.sub(r"[^\d.]", "", str(monto))
    try:
        return services.entero_en_letras(int(float(monto_str)))
    except Exception:
        return str(monto)


def palabras_a_numero(texto: str) -> Optional[int]:
    """Convierte un texto con números en palabras a un entero."""
    if not texto:
        return None
    texto_str = str(texto).lower().strip()
    digitos = re.sub(r"[^\d]", "", texto_str)
    if digitos:
        try:
            return int(digitos)
        except ValueError:
            pass
            
    unidades = {"cero":0, "un":1, "uno":1, "una":1, "dos":2, "tres":3, "cuatro":4, "cinco":5, "seis":6, "siete":7, "ocho":8, "nueve":9}
    decenas = {"diez":10, "once":11, "doce":12, "trece":13, "catorce":14, "quince":15, "dieciséis":16, "dieciseis":16, "diecisiete":17, "dieciocho":18, "diecinueve":19,
               "veinte":20, "veintiuno":21, "veintidós":22, "veintidos":22, "veintitrés":23, "veintitres":23, "veinticuatro":24, "veinticinco":25,
               "veintiséis":26, "veintiseis":26, "veintisiete":27, "veintiocho":28, "veintinueve":29,
               "treinta":30, "cuarenta":40, "cincuenta":50, "sesenta":60, "setenta":70, "ochenta":80, "noventa":90}
    centenas = {"cien":100, "ciento":100, "doscientos":200, "trescientos":300, "cuatrocientos":400, "quinientos":500, "seiscientos":600, "setecientos":700, "ochocientos":800, "novecientos":900}
    
    palabras = re.findall(r'[a-záéíóúñ]+', texto_str)
    total = 0
    actual = 0
    
    for p in palabras:
        if p in unidades:
            actual += unidades[p]
        elif p in decenas:
            actual += decenas[p]
        elif p in centenas:
            actual += centenas[p]
        elif p == "mil":
            if actual == 0:
                actual = 1
            total += actual * 1000
            actual = 0
        elif p == "millón" or p == "millones":
            if actual == 0:
                actual = 1
            total += actual * 1000000
            actual = 0
        elif p == "y" or p == "de":
            continue
            
    total += actual
    return total if total > 0 else None


def corregir_numeros_compuestos(texto: str) -> str:
    """Corrige de forma automática la separación de números compuestos."""
    if not texto:
        return ""
    reemplazos = {
        r'\bdiez\s+y\s+seis\b': 'dieciséis',
        r'\bdiez\s+y\s+siete\b': 'diecisiete',
        r'\bdiez\s+y\s+ocho\b': 'dieciocho',
        r'\bdiez\s+y\s+nueve\b': 'diecinueve',
        r'\bveinte\s+y\s+uno\b': 'veintiuno',
        r'\bveinte\s+y\s+un\s+(mil|mill[oó]n(?:es)?|pesos|centavos)\b': r'veintiún \1',
        r'\bveinte\s+y\s+un\b': 'veintiuno',
        r'\bveintiun\b(?!\s+(?:mil|mill))': 'veintiuno',
        r'\bveinte\s+y\s+dos\b': 'veintidós',
        r'\bveinte\s+y\s+tres\b': 'veintitrés',
        r'\bveinte\s+y\s+cuatro\b': 'veinticuatro',
        r'\bveinte\s+y\s+cinco\b': 'veinticinco',
        r'\bveinte\s+y\s+seis\b': 'veintiséis',
        r'\bveinte\s+y\s+siete\b': 'veintisiete',
        r'\bveinte\s+y\s+ocho\b': 'veintiocho',
        r'\bveinte\s+y\s+nueve\b': 'veintinueve',
    }
    for patron, reemplazo in reemplazos.items():
        texto = re.sub(patron, reemplazo, str(texto), flags=re.IGNORECASE)
    return texto


# Etiquetas de la tabla "DATOS DE IDENTIFICACIÓN" de la constancia del IFREM -> punto del inmueble
_ETIQUETAS_INMUEBLE = [
    ("11_denominacion_del_inmueble", r"DENOMINACI[OÓ]N\s+DEL\s+INMUEBLE"),
    ("2_uso_de_suelo", r"USO\s+DE\s+SUELO"),
    ("6_supermanzana", r"SUPER\s*(?:MZA|MANZANA)\.?"),
    ("10_no_exterior", r"N(?:O|[UÚ]M)\.?\s*EXT(?:ERIOR)?\.?"),
    ("3_no_interior", r"N(?:O|[UÚ]M)\.?\s*INT(?:ERIOR)?\.?"),
    ("9_calle", r"CALLE"),
    ("14_sector", r"SECTOR"),
    ("12_seccion", r"SECCI[OÓ]N"),
    ("7_etapa", r"ETAPA"),
    ("5_manzana", r"MANZANA|MZA\.?"),
    ("4_lote", r"LOTE"),
    ("1_vivienda", r"VIVIENDA"),
    ("8_condominio", r"CONDOMINIO"),
    ("13_colonia", r"COLONIA|FRACCIONAMIENTO|LOCALIDAD|PUEBLO"),
    ("19_codigo_postal", r"C\.\s?P\.|C[OÓ]DIGO\s+POSTAL"),
    ("15_municipio", r"MUNICIPIO|ALCALD[IÍ]A|DELEGACI[OÓ]N"),
    ("16_distrito", r"DISTRITO"),
    ("17_estado", r"ESTADO"),
    ("18_observaciones", r"OBSERVACIONES"),
]
_PUNTOS_INMUEBLE = ["1_vivienda", "2_uso_de_suelo", "3_no_interior", "4_lote", "5_manzana", "6_supermanzana", "7_etapa",
                    "8_condominio", "9_calle", "10_no_exterior", "11_denominacion_del_inmueble", "12_seccion", "13_colonia",
                    "14_sector", "15_municipio", "16_distrito", "17_estado", "18_observaciones", "19_codigo_postal"]
_SIN_DATO = {"", "NO CONSTA", "NO_ENCONTRADO", "N/A", "NA", "-", "--", "---", "NINGUNO", "NINGUNA", "SIN DATO", "NULL", "NONE"}


def _valor_inmueble(valor: str) -> str:
    """Limpia un dato del inmueble: vacío si no viene, abreviaturas a texto completo, romanos a texto."""
    v = " ".join(str(valor or "").split()).strip(" :,.;-")
    if v.upper() in _SIN_DATO or re.fullmatch(r"(?:TR[AÁ]MITE|VOLANTE|FECHA|CLAVE).*", v, re.I):
        return ""
    v = services.expandir_abreviaturas(v)
    return corregir_numeros_compuestos(convertir_romanos_a_texto(v))


def procesar_19_puntos_inmueble(texto_inmueble_raw: str, texto_completo: str = "") -> Dict[str, str]:
    """
    Datos del inmueble por punto. Lo que no viene en el PDF queda VACÍO ("") para que no se imprima.
    Con constancia del IFREM se lee la tabla "DATOS DE IDENTIFICACIÓN" (etiqueta: valor).
    """
    puntos = {k: "" for k in _PUNTOS_INMUEBLE}
    texto_base = " ".join(str(texto_completo or texto_inmueble_raw or "").split())

    seccion = re.search(r"DATOS\s+DE\s+IDENTIFICACI[OÓ]N\s*:?(.*?)(?=SUPERFICIE\s*:|RUMBOS|MEDIDAS\s+Y\s+COLINDANCIAS|DATOS\s+DE\s+REGISTRO|INFORMACI[OÓ]N\s+COMPLEMENTARIA|TR[AÁ]MITE\s+VOLANTE|GRAV[AÁ]MENES|INSCRIPCIONES\s+DE\s+PROPIEDAD|ANOTACIONES\s+PREVENTIVAS|$)", texto_base, re.I)
    if seccion:
        texto = seccion.group(1)
        patron = "|".join(f"(?P<g{n}>{pat})" for n, (_, pat) in enumerate(_ETIQUETAS_INMUEBLE))
        marcas = list(re.finditer(rf"(?<![A-ZÁÉÍÓÚÑ])(?:{patron})\s*:", texto, re.I))
        for n, m in enumerate(marcas):
            clave = _ETIQUETAS_INMUEBLE[int(next(g for g, v in m.groupdict().items() if v)[1:])][0]
            fin = marcas[n + 1].start() if n + 1 < len(marcas) else len(texto)
            valor = _valor_inmueble(texto[m.end():fin])
            # "Lote: LOTE 21" -> "Lote: 21"
            palabra = clave.split("_", 1)[1].split("_")[0].upper()
            if palabra in ("LOTE", "MANZANA", "SUPERMANZANA", "ETAPA", "SECTOR", "CONDOMINIO", "CALLE"):
                valor = re.sub(rf"^{palabra}\s+", "", valor, flags=re.I)
            if valor and not puntos[clave]:
                puntos[clave] = valor
        return puntos

    # Sin tabla del IFREM: se buscan las etiquetas en el texto
    def buscar(patrones):
        for p in patrones:
            match = re.search(p, texto_base, re.IGNORECASE)
            if match:
                valor = _valor_inmueble(match.group(1))
                if valor and valor.lower() not in {"no", "sector", "lote", "manzana", "calle", "colonia", "municipio", "estado"}:
                    return valor
        return ""

    puntos.update({
        "1_vivienda": buscar([r'vivienda\s*:\s*([^,;:]+?)(?=\s+[A-ZÁÉÍÓÚÑ\.\s]{3,25}:|,|;|$)']),
        "2_uso_de_suelo": buscar([r'uso\s+(?:de\s+)?suelo\s*:\s*([^,;:]+?)(?=\s+[A-ZÁÉÍÓÚÑ\.\s]{3,25}:|,|;|$)']),
        "4_lote": buscar([r'\blote\s*:?\s*([0-9A-Z\-]+)\b']),
        "5_manzana": buscar([r'\b(?:manzana|mza\.?)\s*:?\s*([0-9A-Z\-]+)\b']),
        "9_calle": buscar([r'\bcalle\s*:\s*([^,;:]+?)(?=\s+[A-ZÁÉÍÓÚÑ\.\s]{3,25}:|,|;|$)']),
        "13_colonia": buscar([r'\b(?:colonia|fraccionamiento)\s*:\s*([^,;:]+?)(?=\s+[A-ZÁÉÍÓÚÑ\.\s]{3,25}:|,|;|$)']),
        "15_municipio": buscar([r'\b(?:municipio|alcald[ií]a|delegaci[oó]n)\s*:\s*([^,;:]+?)(?=\s+[A-ZÁÉÍÓÚÑ\.\s]{3,25}:|,|;|$)']),
        "17_estado": buscar([r'\bestado\s*:\s*([^,;:]+?)(?=\s+[A-ZÁÉÍÓÚÑ\.\s]{3,25}:|,|;|$)']),
        "19_codigo_postal": buscar([r'(?:c\.\s?p\.|c[oó]digo\s+postal)\s*:?\s*(\d{5})']),
    })
    return puntos


def _texto_inmueble(puntos: Dict[str, str]) -> str:
    """'Vivienda: DEPARTAMENTO 2, Uso De Suelo: HABITACIONAL, ...' solo con los datos que sí vienen."""
    return ", ".join(f"{k.split('_', 1)[1].replace('_', ' ').title()}: {v}" for k, v in puntos.items() if v)


_INMUEBLE_YA_ARMADO = re.compile(r"\b(?:Vivienda|Uso De Suelo|Lote|Manzana|Calle|Colonia|Municipio|Estado|Denominacion Del Inmueble|Sector|Condominio)\s*:", re.I)


def _fecha_con_letra(valor: str) -> str:
    """Cualquier fecha (10/09/2018, 15/IX/2008, XV DE MARZO DE 2005...) -> 'diez de septiembre de dos mil dieciocho'."""
    valor = str(valor or "").strip()
    if not valor or valor.upper() in _SIN_DATO:
        return valor
    convertida = services.fecha_estructurada_a_texto(valor)
    return convertida if convertida else corregir_numeros_compuestos(valor)


def _numero_con_letra(valor: str) -> str:
    """Número de escritura con dígitos o romano -> con letra ('6411' -> 'seis mil cuatrocientos once')."""
    v = str(valor or "").strip()
    limpio = v.replace(",", "").replace(".", "").strip()
    if re.fullmatch(r"\d{1,7}", limpio):
        return services.numero_a_palabras_generico(int(limpio)).lower()
    if re.fullmatch(r"[MDCLXVI]{1,8}", limpio.upper()):
        n = services.romano_a_entero(limpio)
        if n:
            return services.numero_a_palabras_generico(n).lower()
    return corregir_numeros_compuestos(v)


CAMPOS_TRABAJADOR_DOS = ["nombre_acreditado_2", "numero_credito_2", "numero_carta_2", "fecha_expedicion_2",
                         "fecha_liquidacion_2", "credito_a_salario_2", "monto_credito_2"]


def _datos_trabajador_dos(datos: Dict[str, Any]) -> Dict[str, Any]:
    """Coacreditados: datos del "TRABAJADOR DOS" con el mismo formato que los del uno."""
    if not any(str(datos.get(c) or "").strip() for c in CAMPOS_TRABAJADOR_DOS):
        return {}
    v = lambda c: str(datos.get(c) or "").strip()
    carta = v("numero_carta_2")
    if re.fullmatch(r"\d{3,}", carta):
        carta = services.credito_a_letras(carta)
    salario = v("credito_a_salario_2")
    if re.fullmatch(r"[\d,]+(?:\.\d+)?", salario):
        salario = services.convertir_vsm_a_letras(salario.replace(",", ""))
    monto = v("monto_credito_2")
    m = re.search(r"\d[\d,]*(?:\.\d+)?", monto)
    if m and not monto.startswith("$"):
        try:
            monto = f"${float(m.group(0).replace(',', '')):,.2f}"
        except ValueError:
            pass
    return {
        "nombre_acreditado_2": corregir_numeros_compuestos(v("nombre_acreditado_2")).upper(),
        "numero_credito_2": re.sub(r"[^\d]", "", v("numero_credito_2")) or v("numero_credito_2"),
        "numero_carta_2": corregir_numeros_compuestos(carta),
        "fecha_expedicion_2": _fecha_con_letra(v("fecha_expedicion_2")),
        "fecha_liquidacion_2": _fecha_con_letra(v("fecha_liquidacion_2")),
        "credito_a_salario_2": corregir_numeros_compuestos(salario),
        "monto_credito_2": monto,
        "monto_letras_2": numero_a_letras(monto) if monto else "",
    }


def limpiar_datos_para_plantilla(datos_origen: Dict[str, Any], num_credito_fallback: str = "") -> Dict[str, Any]:
    """Filtra y devuelve los campos requeridos aplicando conversiones de romanos y dígitos."""
    acreditado = corregir_numeros_compuestos(str(datos_origen.get("nombre_acreditado") or datos_origen.get("acreditado") or datos_origen.get("cliente") or ""))
    monto = datos_origen.get("monto_credito") or datos_origen.get("monto") or ""
    num_credito = datos_origen.get("numero_credito") or num_credito_fallback or ""
    oficina = corregir_numeros_compuestos(str(datos_origen.get("oficina_registral") or datos_origen.get("oficina") or ""))
    carta = corregir_numeros_compuestos(str(datos_origen.get("numero_carta") or datos_origen.get("carta") or ""))
    # Número de carta: "0543910959" (cero cinco cuatro tres nueve uno cero nueve cinco nueve)
    if re.fullmatch(r"\d{3,}", carta.strip()):
        carta = services.credito_a_letras(carta.strip())
    entidad = corregir_numeros_compuestos(str(datos_origen.get("entidad_financiera") or datos_origen.get("banco") or ""))

    fecha = _fecha_con_letra(str(datos_origen.get("fecha_liquidacion") or datos_origen.get("fecha") or ""))
    
    folio_raw = str(datos_origen.get("folio_real") or datos_origen.get("antecedente") or "").strip()
    folio_con_romanos = convertir_romanos_a_texto(folio_raw)
    num_folio = palabras_a_numero(folio_con_romanos)
    
    if num_folio is not None:
        folio_letras = corregir_numeros_compuestos(numero_folio_a_letras(num_folio))
        folio = f'"{num_folio}" ({folio_letras})'
    else:
        folio_ajustado = ajustar_digitos_segun_longitud(folio_con_romanos)
        folio = corregir_numeros_compuestos(folio_ajustado) if folio_ajustado and folio_ajustado.lower() not in ["none", "null", "n/a", ""] else "NO_ENCONTRADO"
    
    inmueble_raw = datos_origen.get("datos_inmueble") or datos_origen.get("inmueble") or ""
    texto_raw = datos_origen.get("texto_raw") or ""
    
    # Si el inmueble ya viene armado ("Lote: 2, Manzana: 10..."), se respeta (puede estar corregido a mano)
    if inmueble_raw and _INMUEBLE_YA_ARMADO.search(str(inmueble_raw)):
        inmueble_str = services.expandir_abreviaturas(str(inmueble_raw))
        puntos_inmueble = {}
    else:
        puntos_inmueble = procesar_19_puntos_inmueble(str(inmueble_raw), str(texto_raw))
        inmueble_str = _texto_inmueble(puntos_inmueble)
        if not inmueble_str:
            texto_libre = str(inmueble_raw or "").strip()
            inmueble_str = "" if texto_libre.upper() in _SIN_DATO else corregir_numeros_compuestos(
                services.expandir_abreviaturas(convertir_romanos_a_texto(texto_libre)))

    fecha_exp = _fecha_con_letra(str(datos_origen.get("fecha_expedicion") or ""))
    
    credito_salario = datos_origen.get("credito_a_salario") or datos_origen.get("crédito_a_salario") or ""
    credito_salario_str = str(credito_salario).strip()
    if not credito_salario_str or credito_salario_str.lower() in ["none", "null", "n/a", "", "no_encontrado"]:
        credito_salario = "NO_ENCONTRADO"
    else:
        credito_salario = corregir_numeros_compuestos(credito_salario_str)
    
    num_escritura = _numero_con_letra(str(datos_origen.get("numero_escritura") or ""))
    fecha_esc = _fecha_con_letra(str(datos_origen.get("fecha_escritura") or ""))
    notario_completo = str(datos_origen.get("notario_origen_completo") or "")
    if re.match(r"^\s*(del\s+licenciad|de\s+la\s+licenciad)", notario_completo, re.I):
        # Ya tiene formato: solo se pasa a letra un número que venga con dígitos o romano
        notario_completo = re.sub(r"(n[uú]mero)\s+([0-9]+|[MDCLXVI]{1,8})(?=[\s,\.]|$)",
                                  lambda m: f"{m.group(1)} {services.numero_a_palabras_generico(services.cualquier_numero_a_entero(m.group(2))).lower()}"
                                  if services.cualquier_numero_a_entero(m.group(2)) else m.group(0), notario_completo, flags=re.I)
    else:
        notario_completo = services.numeros_de_notaria_a_digitos(notario_completo)
    notario_completo = corregir_numeros_compuestos(notario_completo)
    # "del Licenciado Juan Perez, Notario Público número ..." (o "de la Licenciada ..., Notaria Pública ...")
    if notario_completo and not re.match(r"^(del\s+licenciad|de\s+la\s+licenciad)", notario_completo, re.I) and re.search(r"NOTI?AR", notario_completo, re.I):
        if re.search(r"\d", notario_completo):
            notario_completo = services.extraer_notario_robusto(notario_completo, notario_completo)
            if notario_completo == "NO_ENCONTRADO":
                notario_completo = corregir_numeros_compuestos(str(datos_origen.get("notario_origen_completo") or ""))
        notario_completo = services.formatear_notario(notario_completo)
    conyuge = datos_origen.get("tiene_conyuge") or "No"
    nombre_conyuge = corregir_numeros_compuestos(str(datos_origen.get("nombre_conyuge") or datos_origen.get("nombre_conyugue") or ""))
    if nombre_conyuge.strip().upper() == "NO_ENCONTRADO":
        nombre_conyuge = ""  # Si es soltero(a) no debe marcarse como dato faltante

    monto_letras = numero_a_letras(monto)

    resultado = {
        "nombre_acreditado": acreditado,
        "monto_credito": monto,
        "monto_letras": monto_letras,
        "numero_credito": num_credito,
        "oficina_registral": oficina,
        "numero_carta": carta,
        "entidad_financiera": entidad,
        "fecha_liquidacion": fecha,
        "folio_real": folio,
        "datos_inmueble": inmueble_str,
        "fecha_expedicion": fecha_exp,
        "credito_a_salario": credito_salario,
        "numero_escritura": num_escritura,
        "fecha_escritura": fecha_esc,
        "notario_origen_completo": notario_completo,
        "tiene_conyuge": conyuge,
        "nombre_conyuge": nombre_conyuge,
    }
    resultado.update(puntos_inmueble)
    resultado.update(_datos_trabajador_dos(datos_origen))
    # Lo que no se encontró se deja vacío (en pantalla se marca en rojo para llenarlo)
    for clave, valor in resultado.items():
        if isinstance(valor, str) and valor.strip().upper() in ("NO_ENCONTRADO", "NONE", "NULL", "N/A"):
            resultado[clave] = ""
    return resultado

@app.on_event("startup")
def restaurar_plantillas_subidas():
    """Vuelve a escribir en disco las plantillas que el admin subió (Railway borra el disco al redesplegar)."""
    db = SessionLocal()
    try:
        os.makedirs(TEMPLATES_DIR, exist_ok=True)
        for p in db.query(models.PlantillaSubida).all():
            nombre = os.path.basename(p.nombre)
            with open(os.path.join(TEMPLATES_DIR, nombre), "wb") as f:
                f.write(p.contenido)
            print(f"--> Plantilla restaurada: {nombre}")
    except Exception as e:
        print(f"Error al restaurar plantillas: {e}")
    finally:
        db.close()


@app.on_event("startup")
def crear_usuario_admin_defecto():
    db = SessionLocal()
    try:
        admin_existente = db.query(models.Usuario).filter(models.Usuario.username == "admin").first()
        # Opcional: definir ADMIN_PASSWORD en las variables de Railway para fijar la contraseña del admin
        password_env = os.getenv("ADMIN_PASSWORD")

        if not admin_existente:
            # Solo se crea si no existe; ya NO se reinicia la contraseña en cada arranque
            nuevo_admin = models.Usuario(
                username="admin",
                password_hash=auth.hash_password(password_env or "admin123"),
                es_admin=True
            )
            db.add(nuevo_admin)
        elif password_env:
            admin_existente.password_hash = auth.hash_password(password_env)

        db.commit()
        print("--> USUARIO ADMIN CONFIGURADO CORRECTAMENTE")
    except Exception as e:
        db.rollback()
        print(f"Error en startup: {e}")
    finally:
        db.close()


origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.0.53:5173",
    "https://sistema-cancelaciones.netlify.app",
    "https://sistema-cancelaciones-production.up.railway.app",
    "https://sistema-cancelaciones.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://sistema-cancelaciones.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(kpis.router)
app.include_router(perfil.router)
app.include_router(respaldos.router)
app.include_router(compartir.router)


@app.on_event("startup")
def programar_respaldos():
    respaldos.iniciar_programador()


@app.on_event("startup")
def correcciones_de_datos():
    # Correcciones que se hacen una sola vez (por ejemplo, regresar cada expediente a la plantilla
    # con la que se guardó). Si ya se hicieron, no hace nada.
    reparaciones.ejecutar_pendientes(SessionLocal)


@app.get("/")
def home():
    return {"status": "OK", "mensaje": "Servidor backend conectado"}


@app.get("/api/plantillas")
def obtener_lista_plantillas(usuario: dict = Depends(require_user)):
    if not os.path.exists(TEMPLATES_DIR):
        os.makedirs(TEMPLATES_DIR, exist_ok=True)
        return {"plantillas": []}
    
    archivos = [
        f for f in os.listdir(TEMPLATES_DIR) 
        if f.endswith(".docx") and not f.startswith("~$")
    ]
    return {"plantillas": sorted(archivos)}


# --- CAMPOS QUE USA CADA PLANTILLA (para avisar qué datos faltan antes de generar) ---
# Variables de las plantillas que corresponden a datos que el usuario puede capturar/editar
CAMPOS_EDITABLES = {
    "nombre_acreditado", "monto_credito", "numero_credito", "oficina_registral", "numero_carta",
    "entidad_financiera", "fecha_liquidacion", "folio_real", "datos_inmueble", "fecha_expedicion",
    "credito_a_salario", "numero_escritura", "fecha_escritura", "notario_origen_completo", "nombre_conyuge",
    # Coacreditados (trabajador dos)
    "nombre_acreditado_2", "numero_credito_2", "numero_carta_2", "fecha_expedicion_2", "fecha_liquidacion_2",
    "credito_a_salario_2", "monto_credito_2",
}
ALIAS_VARIABLES = {"crédito_a_salario": "credito_a_salario", "nombre_conyugue": "nombre_conyuge"}
_cache_campos: Dict[str, Any] = {}


def campos_de_plantilla(ruta: str) -> Optional[List[str]]:
    """Regresa los datos que usa una plantilla .docx (None si no se puede leer)."""
    try:
        clave = (ruta, os.path.getmtime(ruta))
        if clave not in _cache_campos:
            from docxtpl import DocxTemplate
            variables = DocxTemplate(ruta).get_undeclared_template_variables()
            campos = {ALIAS_VARIABLES.get(v, v) for v in variables}
            _cache_campos[clave] = sorted(c for c in campos if c in CAMPOS_EDITABLES)
        return _cache_campos[clave]
    except Exception as e:
        print(f"No se pudieron leer los campos de {ruta}: {e}")
        return None


@app.get("/api/plantillas/campos")
def obtener_campos_plantillas(usuario: dict = Depends(require_user)):
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    resultado = {}
    for f in sorted(os.listdir(TEMPLATES_DIR)):
        if f.endswith(".docx") and not f.startswith("~$"):
            campos = campos_de_plantilla(os.path.join(TEMPLATES_DIR, f))
            if campos is not None:
                resultado[f[:-5]] = campos
    return {"campos": resultado}


def renglon_historial(exp) -> Dict[str, Any]:
    """Un expediente como lo muestra Mi Historial."""
    datos_raw = exp.datos_extraidos or {}
    datos = limpiar_datos_para_plantilla(datos_raw, exp.numero_credito)
    # La plantilla con la que se guardó (para descargar, editar y la vista previa con la misma)
    plantilla_guardada = datos_raw.get("plantilla_seleccionada") or datos_raw.get("plantilla")
    if plantilla_guardada:
        datos["plantilla_seleccionada"] = plantilla_guardada
    if datos_raw.get("_coacreditados"):
        datos["_coacreditados"] = True
    
    fecha_solo = exp.fecha_creacion.strftime("%d-%m-%Y") if exp.fecha_creacion else "N/A"
    hora_sola = exp.fecha_creacion.strftime("%H:%M") if exp.fecha_creacion else "N/A"
    
    acreditado = datos.get("nombre_acreditado") or "N/A"
    monto = datos.get("monto_credito") or ""

    return {
        "id": str(exp.id),
        "expediente_id": str(exp.id),
        "_id": str(exp.id),
        "usuario_propietario": exp.usuario_propietario,
        "numero_credito": exp.numero_credito,
        "acreditado": acreditado,
        "monto": monto,
        "hora": hora_sola,
        "manera": exp.manera,
        "estado": estado_de(exp),
        # Versión de plantilla con la que se generó, y si la plantilla cambió desde entonces
        "plantilla_version": datos_raw.get("_plantilla_version"),
        "plantilla_cambio": plantilla_cambio(datos_raw),
        "datos_extraidos": datos,
        "ruta_pdf_constancia": exp.ruta_pdf_constancia,
        "ruta_pdf_carta": exp.ruta_pdf_carta,
        "ruta_word_generado": exp.ruta_word_generado,
        "fecha": fecha_solo,
        "fecha_creacion": exp.fecha_creacion.isoformat() if exp.fecha_creacion else None
    }


@app.get("/api/expedientes")
def obtener_historial(
    usuario: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    # Un usuario normal SOLO ve sus expedientes; el admin puede filtrar por cualquier usuario
    if es_admin(sesion):
        usuario_activo = usuario or x_user_id
    else:
        usuario_activo = sesion["username"]
    query = db.query(models.Expediente)

    if usuario_activo:
        query = query.filter(models.Expediente.usuario_propietario == usuario_activo)

    expedientes = query.order_by(models.Expediente.fecha_creacion.desc()).all()
    accesos = compartir.resumen_por_expediente(db, expedientes)
    nombres = {u.username: (u.nombre_mostrar or u.username) for u in db.query(models.Usuario).all()} if accesos else {}
    resultado = []
    for exp in expedientes:
        fila = renglon_historial(exp)
        gente = accesos.get(str(exp.id)) or []
        fila["compartido_con"] = [{"usuario": u, "nombre": nombres.get(u, u)} for u in gente]
        resultado.append(fila)
    return resultado


@app.get("/api/compartidos")
def expedientes_compartidos_conmigo(db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    """Expedientes de otras personas que me compartieron (para revisar, editar, cambiar estado y descargar)."""
    condicion = compartir.filtro_compartidos_con(db, sesion["username"])
    if condicion is None:
        return []
    expedientes = (db.query(models.Expediente).filter(condicion, models.Expediente.usuario_propietario != sesion["username"])
                   .order_by(models.Expediente.fecha_creacion.desc()).all())
    nombres = {u.username: (u.nombre_mostrar or u.username) for u in db.query(models.Usuario).all()}
    resultado = []
    for exp in expedientes:
        fila = renglon_historial(exp)
        fila["compartido_por"] = nombres.get(exp.usuario_propietario, exp.usuario_propietario)
        resultado.append(fila)
    return resultado


def solo_operadores(sesion: dict):
    """Los usuarios de revisión no crean expedientes: solo revisan los que les comparten."""
    if compartir.es_revisor(sesion):
        raise HTTPException(status_code=403, detail="Tu usuario es de revisión: solo puedes revisar, editar y descargar los expedientes que te comparten.")


@app.post("/api/expedientes/procesar")
def procesar_documento(
    files: List[UploadFile] = File(...),
    usuario_propietario: Optional[str] = Form(None),
    plantilla: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    solo_operadores(sesion)
    try:
        # El propietario siempre es el usuario de la sesión
        propietario_final = sesion["username"]

        datos_extraidos_lista = []
        rutas_guardadas = []
        nombres_originales = []

        for file in files:
            ruta_guardado, nombre_original = guardar_upload(file)
            rutas_guardadas.append(ruta_guardado)
            nombres_originales.append(nombre_original)

            datos = services.extraer_datos_pdf(ruta_guardado)
            datos_extraidos_lista.append(datos)

        actos = reunir_actos(datos_extraidos_lista, nombres_originales)
        datos_combinados = services.combinar_datos_pareja(datos_extraidos_lista)
        aplicar_acto_elegido(datos_combinados, actos)
        sugerencia = sugerir_plantilla_seguro(datos_combinados, actos, datos_extraidos_lista)
        num_credito = datos_combinados.get("numero_credito", "SIN_CREDITO")
        
        datos_limpios = limpiar_datos_para_plantilla(datos_combinados, num_credito)

        if plantilla:
            datos_limpios["plantilla_seleccionada"] = plantilla

        nuevo_expediente = models.Expediente(
            usuario_propietario=propietario_final,
            numero_credito=num_credito,
            datos_extraidos=datos_limpios,
            # Se guarda el nombre original como referencia; el PDF se borra tras extraer los datos
            ruta_pdf_constancia=";".join(nombres_originales)
        )
        db.add(nuevo_expediente)
        db.commit()
        db.refresh(nuevo_expediente)
        
        return {
            "status": "exito",
            "id": str(nuevo_expediente.id),
            "expediente_id": str(nuevo_expediente.id),
            "datos_extraidos": datos_limpios,
            # Actos encontrados en la constancia, para elegir otro desde la pantalla
            "actos": actos,
            # Plantilla que parece corresponder según los documentos (el usuario decide)
            "plantilla_sugerida": sugerencia,
        }
    except Exception as e:
        print(f"ERROR EN /procesar: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Los PDFs solo se necesitan para extraer los datos (que ya quedaron en la BD)
        borrar_archivos(locals().get("rutas_guardadas"))


@app.post("/api/expedientes/procesar-masivo")
def procesar_masivo(
    files: List[UploadFile] = File(...),
    usuario_propietario: Optional[str] = Form(None),
    plantilla: Optional[str] = Form("plantilla_manera2.docx"),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    solo_operadores(sesion)
    try:
        propietario_final = sesion["username"]

        ruta_plantilla = resolver_ruta_plantilla(plantilla)
        archivos_procesados = []

        for file in files:
            nombre_limpio_archivo = (file.filename or "").replace('\\', '/').split('/')[-1]

            if not nombre_limpio_archivo.lower().endswith('.pdf'):
                continue
                
            ruta_guardado, nombre_limpio_archivo = guardar_upload(file)

            try:
                datos = services.extraer_datos_pdf(ruta_guardado)
                if not datos or (datos.get("numero_credito") == "NO_ENCONTRADO" and not datos.get("texto_raw")):
                    raise ValueError("El archivo PDF está vacío, corrupto o no contiene datos legibles.")
            except Exception as e_file:
                datos = {"error_extraccion": str(e_file), "numero_credito": "NO_ENCONTRADO"}

            archivos_procesados.append({
                "ruta": ruta_guardado,
                "nombre": nombre_limpio_archivo,
                "datos": datos
            })

        agrupados_por_credito = {}
        for item in archivos_procesados:
            ruta = item["ruta"]
            nombre = item["nombre"]
            datos = item["datos"]

            credito_extraido = datos.get("numero_credito")
            credito_key = None

            if credito_extraido and credito_extraido != "NO_ENCONTRADO":
                credito_key = re.sub(r'\D', '', str(credito_extraido))

            if not credito_key or len(credito_key) < 8:
                match_nombre = re.search(r'\d{8,12}', nombre)
                if match_nombre:
                    credito_key = re.sub(r'\D', '', match_nombre.group(0))

            if not credito_key:
                credito_key = re.sub(r'\D', '', nombre)
                if not credito_key:
                    credito_key = pathlib.Path(nombre).stem

            if credito_key not in agrupados_por_credito:
                agrupados_por_credito[credito_key] = []
            
            agrupados_por_credito[credito_key].append((ruta, datos, nombre))

        resultados = []
        for prefijo, grupo in agrupados_por_credito.items():
            try:
                lista_datos = [item[1] for item in grupo]
                
                if all("error_extraccion" in d for d in lista_datos):
                    raise ValueError("Los archivos PDF de este crédito están corruptos o vacíos.")

                lista_datos_validos = [d for d in lista_datos if "error_extraccion" not in d]
                if not lista_datos_validos:
                    lista_datos_validos = lista_datos

                nombres_grupo = [item[2] for item in grupo if "error_extraccion" not in item[1]] or [item[2] for item in grupo]
                actos = reunir_actos(lista_datos_validos, nombres_grupo)
                datos_raw = services.combinar_datos_pareja(lista_datos_validos)
                aplicar_acto_elegido(datos_raw, actos)
                sugerencia = sugerir_plantilla_seguro(datos_raw, actos, lista_datos_validos)
                
                num_credito = datos_raw.get("numero_credito")
                if not num_credito or num_credito == "NO_ENCONTRADO":
                    num_credito = prefijo
                else:
                    num_credito = re.sub(r'\D', '', str(num_credito))
                    if not num_credito:
                        num_credito = prefijo
                
                datos_finales = limpiar_datos_para_plantilla(datos_raw, num_credito)
                # Se recuerda la plantilla usada, para poder regenerar el Word igual después
                datos_finales["plantilla_seleccionada"] = plantilla

                ruta_salida = ruta_word_unica(num_credito)
                generar_word_versionado(db, plantilla, datos_finales, ruta_salida)

                rutas_pdf = ";".join([item[2] for item in grupo])
                nuevo_expediente = models.Expediente(
                    usuario_propietario=propietario_final,
                    numero_credito=num_credito,
                    datos_extraidos=datos_finales,
                    ruta_pdf_constancia=rutas_pdf,
                    ruta_word_generado=ruta_salida
                )
                db.add(nuevo_expediente)
                db.commit()
                db.refresh(nuevo_expediente)

                resultados.append({
                    "id": str(nuevo_expediente.id),
                    "expediente_id": str(nuevo_expediente.id),
                    "archivos_asociados": len(grupo),
                    "datos": datos_finales,
                    "datos_extraidos": datos_finales,
                    "ruta_word": ruta_salida,
                    "plantilla_seleccionada": plantilla,
                    "archivos": [item[2] for item in grupo],
                    "actos": actos,
                    "plantilla_sugerida": sugerencia,
                })
            except Exception as e_grupo:
                db.rollback()
                resultados.append({
                    "expediente_id": prefijo,
                    "archivos_asociados": len(grupo),
                    "error": str(e_grupo)
                })

        return {"status": "exito", "procesados": len([r for r in resultados if "error" not in r]), "detalles": resultados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        borrar_archivos([item["ruta"] for item in locals().get("archivos_procesados", [])])


# =====================================================================
# LEER (sin guardar) y GUARDAR: primero se revisan los datos, después se guardan
# =====================================================================
def clave_de_credito(datos: Dict[str, Any], nombre: str) -> str:
    """
    Número de crédito con el que se agrupan la carta y la constancia del mismo expediente.
    Primero el número del nombre del archivo (deben ser idénticos); si no trae, el que viene dentro del PDF.
    """
    clave = numero_en_nombre(nombre)
    if clave:
        return clave
    credito = datos.get("numero_credito")
    if credito and credito != "NO_ENCONTRADO":
        clave = re.sub(r'\D', '', str(credito))
    if not clave or len(clave) < 8:
        m = re.search(r'\d{8,12}', nombre)
        if m:
            clave = m.group(0)
    if not clave:
        clave = re.sub(r'\D', '', nombre) or pathlib.Path(nombre).stem
    return clave


def leer_grupo(lista_datos: List[Dict[str, Any]], nombres: List[str], respaldo_credito: str = ""):
    """Junta los datos de los documentos de un expediente (sin guardar nada)."""
    if all("error_extraccion" in d for d in lista_datos):
        raise ValueError("Los archivos PDF de este expediente están corruptos o vacíos.")
    validos = [d for d in lista_datos if "error_extraccion" not in d]
    nombres_validos = [n for n, d in zip(nombres, lista_datos) if "error_extraccion" not in d]
    # Coacreditados: con dos cartas, la del "TRABAJADOR DOS" se aparta y sus datos van en los campos *_2
    carta_dos, nombre_dos = separar_carta_trabajador_dos(validos, nombres_validos, respaldo_credito)
    if carta_dos is not None:
        i = next(k for k, d in enumerate(validos) if d is carta_dos)
        validos = validos[:i] + validos[i + 1:]
        nombres_validos = nombres_validos[:i] + nombres_validos[i + 1:]
    actos = reunir_actos(validos, nombres_validos)
    datos_raw = services.combinar_datos_pareja(validos)
    aplicar_acto_elegido(datos_raw, actos)
    sugerencia = sugerir_plantilla_seguro(datos_raw, actos, validos)
    num_credito = re.sub(r'\D', '', str(datos_raw.get("numero_credito") or ""))
    if not num_credito or datos_raw.get("numero_credito") == "NO_ENCONTRADO":
        num_credito = respaldo_credito if re.fullmatch(r"\d{6,}", respaldo_credito or "") else ""
    if carta_dos is not None:
        datos_raw.update(datos_de_trabajador_dos(carta_dos, datos_raw))
        sugerencia = sugerencia_coacreditados(datos_raw, sugerencia)
    datos_finales = limpiar_datos_para_plantilla(datos_raw, num_credito)
    if carta_dos is not None:
        datos_finales["_coacreditados"] = True
    return datos_finales, actos, sugerencia


def separar_carta_trabajador_dos(validos, nombres, clave=""):
    """Si hay dos cartas (dos créditos distintos), regresa la del "TRABAJADOR DOS"."""
    cartas = [d for d in validos if d.get("_tipo_documento") == "carta"]
    if len(cartas) < 2:
        return None, None
    marcada = next((d for d in cartas if d.get("_trabajador") == 2), None)
    if marcada is None:
        creditos = [re.sub(r"\D", "", str(d.get("numero_credito") or "")) for d in cartas]
        if len(set(c for c in creditos if c)) < 2:
            return None, None  # las dos cartas son del mismo crédito: no es coacreditado
        # El "TRABAJADOR UNO" es el del número de crédito del expediente; el otro es el dos
        uno = next((d for d, c in zip(cartas, creditos) if c and c == clave), cartas[0])
        marcada = next(d for d in cartas if d is not uno)
    return marcada, nombres[validos.index(marcada)] if marcada in validos else None


def datos_de_trabajador_dos(carta: Dict[str, Any], datos: Dict[str, Any]) -> Dict[str, Any]:
    """Datos de la carta del "TRABAJADOR DOS"."""
    v = lambda c: "" if str(carta.get(c) or "").upper() in ("", "NO_ENCONTRADO") else str(carta.get(c)).strip()
    nombre = v("nombre_acreditado")
    if not nombre:
        # Si la carta no trae el nombre, se usa la otra persona que aparece en la constancia
        otro = str(datos.get("nombre_conyuge") or "")
        nombre = "" if otro.upper() == "NO_ENCONTRADO" else otro
    resultado = {
        "nombre_acreditado_2": nombres.ordenar_nombre(nombre) if nombre else nombre,
        "numero_credito_2": v("numero_credito"),
        "numero_carta_2": v("numero_carta"),
        "fecha_expedicion_2": v("fecha_expedicion"),
        "fecha_liquidacion_2": v("fecha_liquidacion"),
    }
    # En coacreditados la otra persona de la constancia es el trabajador dos, no un cónyuge
    if nombre and actos_ifrem._sin_acentos(nombre).upper() == actos_ifrem._sin_acentos(str(datos.get("nombre_conyuge") or "")).upper():
        datos["nombre_conyuge"] = ""
        datos["tiene_conyuge"] = "No"
    return resultado


def sugerencia_coacreditados(datos: Dict[str, Any], sugerencia):
    """Con dos cartas la plantilla es de coacreditados (misma entidad y tipo de crédito)."""
    try:
        sug = dict(sugerencia or {})
        anterior = sug.get("plantilla") or ""
        region = sug.get("region") or ("CDMX" if "CDMX" in anterior else "EDOMEX")
        tipo = sug.get("tipo") or ("MUTUO" if "MUTUO" in anterior else "AP")
        sug.update({
            "plantilla": f"COAC_{region}_{tipo}", "region": region, "tipo": tipo, "coacreditados": True,
            "razones": ["Se cargaron dos cartas de instrucción (dos créditos): son coacreditados"] + list(sug.get("razones") or []),
        })
        return sug
    except Exception:
        return sugerencia


def aplicar_tipo_indicado(datos: Dict[str, Any], tipo: str, nombre: str) -> str:
    """
    El usuario subió el archivo en el recuadro de "carta" o de "constancia": se usa ese tipo.
    Si el contenido claramente dice lo contrario, se respeta el contenido y se avisa.
    """
    tipo = (tipo or "").strip().lower()
    if tipo in ("carta2", "carta_2"):
        # Coacreditados: carta del "TRABAJADOR DOS"
        datos["_trabajador"] = 2
        tipo = "carta"
    elif tipo in ("carta1", "carta_1"):
        datos["_trabajador"] = 1
        tipo = "carta"
    if tipo not in ("carta", "constancia"):
        return ""
    detectado = datos.get("_tipo_documento")
    texto = str(datos.get("texto_raw") or "").upper()
    seguro = (detectado == "constancia" and actos_ifrem.parece_constancia_ifrem(texto)) or \
             (detectado == "carta" and "CARTA DE INSTRUCCI" in texto)
    if detectado != tipo and seguro:
        nombre_tipo = {"carta": "una carta de instrucción", "constancia": "una constancia de folio"}
        return f"\"{nombre}\" se subió como {tipo}, pero parece {nombre_tipo[detectado]}; se tomó como {detectado}."
    datos["_tipo_documento"] = tipo
    if tipo == "carta":
        datos.pop("_actos", None)
        datos.pop("_propietarios", None)
    return ""


def aviso_de_constancia(datos: Dict[str, Any], nombre: str) -> str:
    """Avisa cuando de una constancia no se pudieron sacar los actos (para que se revise a mano)."""
    if datos.get("_tipo_documento") != "constancia" or datos.get("_actos"):
        return ""
    texto = str(datos.get("texto_raw") or "")
    if len(texto.strip()) < 300:
        return (f"\"{nombre}\" parece escaneada (es una imagen): no se pudieron leer sus actos. "
                "Puedes seleccionar el texto con «Leer área (OCR)» y usarlo en cada dato.")
    if actos_ifrem.parece_constancia_ifrem(texto):
        return f"No se encontraron actos en \"{nombre}\". Revisa el PDF: puedes seleccionar el texto y usarlo en cada dato."
    return ""


def aviso_de_grupo(grupo: List[Dict[str, Any]]) -> List[str]:
    """Avisos del expediente: le falta la carta o la constancia."""
    tipos_grupo = [g["datos"].get("_tipo_documento") for g in grupo if "error_extraccion" not in g["datos"]]
    if not tipos_grupo:
        return []
    if "carta" not in tipos_grupo:
        return ["No se encontró la carta de instrucción de este expediente (puedes moverla aquí)."]
    if "constancia" not in tipos_grupo:
        return ["No se encontró la constancia de folio de este expediente (puedes moverla aquí)."]
    return []


def emparejar_por_nombre(grupos: Dict[str, List[Dict[str, Any]]]):
    """
    Si una constancia quedó sola (su archivo no trae el número de crédito), se junta con la carta
    cuyo acreditado aparece en la constancia.
    """
    def tipos_de(grupo):
        return {g["datos"].get("_tipo_documento") for g in grupo}

    def sin_numero(grupo):
        return all(not numero_en_nombre(g["nombre"]) for g in grupo)

    # Solo se emparejan por nombre las constancias cuyo archivo NO trae número de crédito
    # (si trae número, debe ser idéntico al de la carta)
    solo_constancias = [k for k, g in grupos.items() if tipos_de(g) == {"constancia"} and sin_numero(g)]
    solo_cartas = [k for k, g in grupos.items() if tipos_de(g) == {"carta"}]
    for kc in solo_constancias:
        texto = " ".join(str(g["datos"].get("texto_raw") or "") for g in grupos[kc]).upper()
        texto = actos_ifrem._sin_acentos(texto)
        mejor, puntos_mejor = None, 0
        for ka in solo_cartas:
            nombre = actos_ifrem._sin_acentos(str(next((g["datos"].get("nombre_acreditado") for g in grupos[ka]), "") or "").upper())
            palabras = [p for p in nombre.split() if len(p) > 2 and p != "NO_ENCONTRADO"]
            puntos = sum(1 for p in palabras if re.search(rf"\b{re.escape(p)}\b", texto))
            if len(palabras) >= 2 and puntos >= max(2, len(palabras) - 1) and puntos > puntos_mejor:
                mejor, puntos_mejor = ka, puntos
        if mejor:
            grupos[mejor].extend(grupos.pop(kc))
            solo_cartas.remove(mejor)


def numero_en_nombre(nombre: str) -> Optional[str]:
    """Número de crédito del nombre del archivo (8 a 12 dígitos seguidos)."""
    base = (nombre or "").replace("\\", "/").split("/")[-1]
    m = re.search(r"(?<!\d)\d{8,12}(?!\d)", base)
    return m.group(0) if m else None


def verificar_mismo_credito_por_nombre(archivos: List[tuple]):
    """
    Caso individual: la carta y la constancia (y en coacreditados las dos cartas) deben ser del mismo expediente.
    Si los nombres de archivo traen número y no son idénticos, no se leen.
    """
    # También en coacreditados: las dos cartas y la constancia llevan el mismo número en el nombre
    numeros: Dict[str, List[str]] = {}
    for nombre, _tipo in archivos:
        num = numero_en_nombre(nombre)
        if num:
            numeros.setdefault(num, []).append((nombre or "").replace("\\", "/").split("/")[-1])
    if len(numeros) > 1:
        detalle = " y ".join(f'"{v[0]}"' for v in numeros.values())
        raise HTTPException(status_code=409, detail=f"Los archivos no son del mismo crédito: {detalle}. "
                                                    "Los números deben ser idénticos; cambia el archivo que no corresponde.")


def verificar_mismo_credito_por_contenido(archivos: List[Dict[str, Any]]):
    """Si el nombre no trae número, se compara el número de crédito que viene dentro de cada PDF."""
    por_tipo: Dict[str, set] = {}
    for a in archivos:
        d = a["datos"]
        if "error_extraccion" in d:
            continue
        num = numero_en_nombre(a["nombre"])
        if not num:
            c = re.sub(r"\D", "", str(d.get("numero_credito") or ""))
            num = c if 8 <= len(c) <= 12 else None
        if num:
            por_tipo.setdefault(d.get("_tipo_documento") or "", set()).add(num)
    cartas, constancias = por_tipo.get("carta", set()), por_tipo.get("constancia", set())
    n_cartas = sum(1 for a in archivos if a["datos"].get("_tipo_documento") == "carta" and "error_extraccion" not in a["datos"])
    if n_cartas >= 2:
        return  # coacreditados: ya se revisó por nombre de archivo
    if cartas and constancias and not (cartas & constancias):
        raise HTTPException(status_code=409, detail=f"La carta es del crédito {', '.join(sorted(cartas))} y la constancia "
                                                    f"del crédito {', '.join(sorted(constancias))}. Los números deben ser idénticos.")


@app.post("/api/expedientes/leer")
def leer_documentos(
    files: List[UploadFile] = File(...),
    agrupar: bool = Form(True),
    tipos: Optional[List[str]] = Form(None),
    sesion: dict = Depends(require_user)
):
    """
    Lee los PDF y regresa los datos para revisarlos en pantalla. NO guarda nada en la base:
    eso se hace después con /api/expedientes/guardar.
    agrupar=True: separa los archivos en expedientes por número de crédito (carga masiva).
    agrupar=False: todos los archivos son un solo expediente (caso individual).
    """
    archivos = []
    tipos = tipos or []
    t_inicio = time.time()
    try:
        if not agrupar:
            verificar_mismo_credito_por_nombre([(f.filename or "", tipos[n] if n < len(tipos) else "") for n, f in enumerate(files)])
        for n, file in enumerate(files):
            nombre = (file.filename or "").replace('\\', '/').split('/')[-1]
            if not nombre.lower().endswith('.pdf'):
                continue
            ruta, nombre = guardar_upload(file)
            aviso = ""
            try:
                datos = services.extraer_datos_pdf(ruta)
                if not datos or (datos.get("numero_credito") == "NO_ENCONTRADO" and not datos.get("texto_raw")):
                    raise ValueError("El archivo PDF está vacío, corrupto o no contiene datos legibles.")
                aviso = aplicar_tipo_indicado(datos, tipos[n] if n < len(tipos) else "", nombre)
                if not aviso:
                    aviso = aviso_de_constancia(datos, nombre)
            except Exception as e_file:
                datos = {"error_extraccion": str(e_file), "numero_credito": "NO_ENCONTRADO"}
            archivos.append({"ruta": ruta, "nombre": nombre, "datos": datos, "aviso": aviso})

        if not agrupar:
            verificar_mismo_credito_por_contenido(archivos)

        grupos: Dict[str, List[Dict[str, Any]]] = {}
        for item in archivos:
            clave = clave_de_credito(item["datos"], item["nombre"]) if agrupar else "expediente"
            grupos.setdefault(clave, []).append(item)
        if agrupar:
            emparejar_por_nombre(grupos)

        borradores = []
        for clave, grupo in grupos.items():
            nombres = [g["nombre"] for g in grupo]
            try:
                datos_finales, actos, sugerencia = leer_grupo([g["datos"] for g in grupo], nombres, clave)
                borradores.append({
                    "id": uuid.uuid4().hex,
                    "clave": clave,
                    "archivos": nombres,
                    "tipos": {g["nombre"]: g["datos"].get("_tipo_documento", "") for g in grupo},
                    "avisos": [g["aviso"] for g in grupo if g.get("aviso")] + aviso_de_grupo(grupo),
                    "datos_extraidos": datos_finales,
                    "actos": actos,
                    "plantilla_sugerida": sugerencia,
                    "leido_en": int(time.time() * 1000),
                })
            except Exception as e_grupo:
                borradores.append({"id": uuid.uuid4().hex, "clave": clave, "archivos": nombres, "error": str(e_grupo)})
        kpis.registrar(sesion["username"], "leer", modo="masivo" if agrupar else "individual",
                       archivos=len(archivos), expedientes=len([b for b in borradores if not b.get("error")]),
                       errores=len([b for b in borradores if b.get("error")]), segundos=round(time.time() - t_inicio, 1))
        return {"status": "exito", "borradores": borradores}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR EN /leer: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        borrar_archivos([a["ruta"] for a in archivos])


@app.post("/api/expedientes/guardar")
def guardar_expedientes(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    """
    Guarda en la base los expedientes ya revisados y genera su Word.
    payload: {"expedientes": [{"ref", "datos", "plantilla", "archivos"}]}
    """
    if compartir.es_revisor(sesion) and any(not it.get("actualizar") for it in (payload.get("expedientes") or [])):
        solo_operadores(sesion)
    resultados = []
    for item in payload.get("expedientes") or []:
        ref = item.get("ref")
        try:
            if item.get("actualizar"):
                # Se volvió a subir un expediente que ya existía: se actualiza en lugar de crear otro
                existente = obtener_expediente_autorizado(db, item["actualizar"], sesion)
                plantilla = item.get("plantilla") or (item.get("datos") or {}).get("plantilla_seleccionada")
                archivos = ";".join(item.get("archivos") or [])
                if archivos:
                    existente.ruta_pdf_constancia = archivos
                metricas = kpis.metricas_de_guardado(item.get("metricas"))
                metricas.pop("cambios", None)
                # "editar": se cambió desde Mi Historial sin volver a subir documentos; "actualizar": con documentos
                tipo_ed = item.get("tipo_edicion") if item.get("tipo_edicion") in ("editar", "actualizar") else "actualizar"
                aplicar_edicion(existente, dict(item.get("datos") or {}), plantilla, sesion["username"], db, tipo=tipo_ed,
                                detalle_extra={k: v for k, v in metricas.items() if k in ("origen", "leido_en", "segundos_revision", "avisos")})
                db.refresh(existente)
                resultados.append({
                    "ref": ref,
                    "expediente_id": str(existente.id),
                    "datos_extraidos": existente.datos_extraidos,
                    "plantilla_seleccionada": existente.datos_extraidos.get("plantilla_seleccionada"),
                    "actualizado": True,
                })
                continue
            datos = dict(item.get("datos") or {})
            plantilla = item.get("plantilla") or datos.get("plantilla_seleccionada") or "plantilla_manera2.docx"
            num_credito = str(datos.get("numero_credito") or "").strip()
            if not num_credito or num_credito == "NO_ENCONTRADO":
                num_credito = "SIN_CREDITO"
            datos["plantilla_seleccionada"] = plantilla
            expediente = models.Expediente(
                usuario_propietario=sesion["username"],
                numero_credito=num_credito,
                datos_extraidos=datos,
                ruta_pdf_constancia=";".join(item.get("archivos") or []) or "Sin PDF",
            )
            db.add(expediente)
            db.flush()
            regenerar_word_expediente(expediente, {"datos": datos, "plantilla": plantilla}, db)
            kpis.registrar(sesion["username"], "guardar", expediente.id, num_credito, plantilla=plantilla,
                           **kpis.metricas_de_guardado(item.get("metricas")))
            resultados.append({
                "ref": ref,
                "expediente_id": str(expediente.id),
                "datos_extraidos": expediente.datos_extraidos,
                "plantilla_seleccionada": plantilla,
            })
        except Exception as e:
            db.rollback()
            print(f"ERROR AL GUARDAR {ref}: {e}")
            resultados.append({"ref": ref, "error": getattr(e, "detail", None) or str(e)})
    return {"status": "exito", "guardados": len([r for r in resultados if "error" not in r and not r.get("actualizado")]),
            "actualizados": len([r for r in resultados if r.get("actualizado")]), "resultados": resultados}


@app.put("/api/expedientes/{expediente_id}/actualizar")
def actualizar_datos_expediente(
    expediente_id: str,
    datos_actualizados: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    expediente = obtener_expediente_autorizado(db, expediente_id, sesion)

    datos_existentes = dict(expediente.datos_extraidos or {})
    datos_existentes.update(datos_actualizados)

    num_credito = datos_actualizados.get("numero_credito") or expediente.numero_credito
    datos_limpios = limpiar_datos_para_plantilla(datos_existentes, num_credito)

    expediente.numero_credito = num_credito
    expediente.datos_extraidos = datos_limpios
    flag_modified(expediente, "datos_extraidos")

    db.commit()
    db.refresh(expediente)

    return {
        "status": "exito",
        "mensaje": "Datos actualizados correctamente en BD",
        "datos_extraidos": expediente.datos_extraidos
    }


def regenerar_word_expediente(expediente, datos_payload: Optional[Dict[str, Any]], db: Session):
    """
    Aplica los datos/plantilla recibidos al expediente, lo guarda y genera su Word.
    Regresa (ruta_del_word, numero_de_credito).
    """
    datos_payload = datos_payload or {}
    datos_modificados = datos_payload.get("datos", datos_payload)

    datos_anteriores = dict(expediente.datos_extraidos or {})
    datos_actuales = dict(datos_anteriores)
    if isinstance(datos_modificados, dict):
        datos_actuales.update(datos_modificados)
    plantilla_anterior = datos_anteriores.get("plantilla_seleccionada") or datos_anteriores.get("plantilla")

    nombre_plantilla = (
        datos_payload.get("plantilla")
        or datos_actuales.get("plantilla_seleccionada")
        or datos_actuales.get("plantilla")
        or "plantilla_manera2.docx"
    )

    num_credito = datos_actuales.get("numero_credito") or expediente.numero_credito
    datos_finales = limpiar_datos_para_plantilla(datos_actuales, num_credito)
    datos_finales["plantilla_seleccionada"] = nombre_plantilla
    if datos_actuales.get("_coacreditados"):
        datos_finales["_coacreditados"] = True

    # Versión de plantilla: la misma del Word original (si es la misma plantilla), salvo que se pida la actual
    version_previa = datos_anteriores.get("_plantilla_version")
    usar_version = version_previa if (version_previa and plantilla_anterior == nombre_plantilla
                                      and not datos_payload.get("plantilla_actual")) else None
    # Lo que cambió (para el historial de cambios); al guardar por primera vez no aplica
    expediente._cambios = diferencias(datos_anteriores, datos_finales) if version_previa else {}

    ruta_salida = ruta_word_unica(num_credito)
    exito = generar_word_versionado(db, nombre_plantilla, datos_finales, ruta_salida, version=usar_version)

    if not exito or not os.path.exists(ruta_salida):
        raise HTTPException(status_code=500, detail="Error al reescribir la plantilla Word")

    expediente.datos_extraidos = datos_finales
    expediente.numero_credito = num_credito
    flag_modified(expediente, "datos_extraidos")

    reemplazar_word_anterior(expediente.ruta_word_generado, ruta_salida)
    expediente.ruta_word_generado = ruta_salida
    db.commit()
    db.refresh(expediente)
    return ruta_salida, num_credito



def aplicar_edicion(expediente, datos: Dict[str, Any], plantilla: Optional[str], usuario: str, db: Session,
                    tipo: str = "editar", detalle_extra: Optional[Dict[str, Any]] = None) -> Dict[str, List[str]]:
    """
    Cambia los datos (y la plantilla) de un expediente ya guardado y vuelve a generar su Word con la plantilla actual.
    Queda en el historial de cambios lo que cambió. Si ya estaba Revisado o Entregado y algo cambió, regresa a Generado.
    Regresa los cambios {campo: [antes, después]}.
    """
    anteriores = dict(expediente.datos_extraidos or {})
    estado_antes = estado_de(expediente)
    plantilla = plantilla or anteriores.get("plantilla_seleccionada") or anteriores.get("plantilla") or "plantilla_manera2.docx"
    regenerar_word_expediente(expediente, {"datos": dict(datos or {}), "plantilla": plantilla, "plantilla_actual": True}, db)
    cambios = diferencias(anteriores, expediente.datos_extraidos or {})
    detalle = {"plantilla": plantilla, "version": (expediente.datos_extraidos or {}).get("_plantilla_version"), "cambios": cambios}
    detalle.update(detalle_extra or {})
    kpis.registrar(usuario, tipo, expediente.id, expediente.numero_credito, **detalle)
    if cambios and estado_antes != "GENERADO":
        expediente.estado = "GENERADO"
        kpis.registrar(usuario, "estado", expediente.id, expediente.numero_credito, de=estado_antes, a="GENERADO", motivo="Se editó el expediente")
        db.commit()
    return cambios


@app.put("/api/expedientes/{expediente_id}/editar")
def editar_expediente(
    expediente_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    """Edita un expediente ya guardado (desde Mi Historial). Solo su dueño o el administrador."""
    expediente = obtener_expediente_autorizado(db, expediente_id, sesion)
    datos = payload.get("datos")
    if not isinstance(datos, dict):
        raise HTTPException(status_code=400, detail="Faltan los datos del expediente.")
    try:
        cambios = aplicar_edicion(expediente, datos, payload.get("plantilla"), sesion["username"], db)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"ERROR AL EDITAR {expediente_id}: {e}")
        raise HTTPException(status_code=500, detail=f"No se pudo editar el expediente: {e}")
    db.refresh(expediente)
    return {"status": "exito", "cambios": cambios, "expediente": renglon_historial(expediente)}


@app.post("/api/expedientes/normalizar-campo")
def normalizar_campo(
    payload: Dict[str, Any] = Body(...),
    sesion: dict = Depends(require_user)
):
    """
    Da al texto seleccionado en el PDF el mismo formato que usa la extracción automática
    (números y fechas con letra, monto con formato de pesos, etc.).
    """
    campo_pedido = str(payload.get("campo") or "")
    # Coacreditados: los datos del trabajador dos (*_2) llevan el mismo formato que los del uno
    sufijo = "_2" if campo_pedido.endswith("_2") else ""
    campo = campo_pedido[:-2] if sufijo else campo_pedido
    texto = " ".join(str(payload.get("texto") or "").split())
    valor = texto
    extra: Dict[str, Any] = {}
    try:
        solo_digitos = re.sub(r"[^\d]", "", texto)
        if campo in ("numero_escritura",) and re.fullmatch(r"[\d,\.\s]+|[MDCLXVImdclxvi]{1,8}", texto):
            valor = _numero_con_letra(texto)
        elif campo == "folio_real" and solo_digitos and re.fullmatch(r"[\d,\.\s\-]+", texto):
            limpio = services.limpiar_ceros_izquierda(solo_digitos)
            valor = services.numero_a_palabras_generico(limpio).lower() if limpio.isdigit() else limpio
        elif campo in ("fecha_escritura", "fecha_liquidacion", "fecha_expedicion"):
            convertida = services.fecha_estructurada_a_texto(texto)
            if convertida:
                valor = convertida
        elif campo == "monto_credito":
            m = re.search(r"[\d][\d,]*(?:\.\d+)?", texto)
            if m:
                valor = f"${float(m.group(0).replace(',', '')):,.2f}"
                extra["monto_letras" + sufijo] = numero_a_letras(valor)
        elif campo == "credito_a_salario" and re.fullmatch(r"[\d,\.\s]+", texto):
            valor = services.convertir_vsm_a_letras(texto.replace(",", "").strip())
        elif campo == "notario_origen_completo" and re.search(r"NOTI?AR", texto, re.I):
            notario = services.extraer_notario_robusto(texto, texto)
            if notario and notario != "NO_ENCONTRADO":
                valor = services.formatear_notario(notario)
        elif campo == "numero_carta" and re.fullmatch(r"[\d\s\-]{3,}", texto):
            valor = services.credito_a_letras(solo_digitos)
        elif campo in ("nombre_acreditado", "nombre_conyuge"):
            valor = texto.upper()
    except Exception as e:
        print(f"No se pudo normalizar {campo}: {e}")
        valor = texto
    return {"campo": campo_pedido, "original": texto, "valor": valor, "extra": extra}

@app.post("/api/expedientes/vista-previa")
def vista_previa(
    payload: Dict[str, Any] = Body(...),
    sesion: dict = Depends(require_user)
):
    """
    Genera el Word con los datos y la plantilla recibidos SIN guardar nada.
    Lo usa la ventana de vista previa mientras el usuario edita.
    """
    datos = dict(payload.get("datos") or {})
    nombre_plantilla = payload.get("plantilla") or datos.get("plantilla_seleccionada") or "plantilla_manera2.docx"
    num_credito = datos.get("numero_credito") or ""
    datos_finales = limpiar_datos_para_plantilla(datos, num_credito)

    os.makedirs(GENERADOS_DIR, exist_ok=True)
    ruta_temp = os.path.join(GENERADOS_DIR, f"previa_{uuid.uuid4().hex}.docx")
    try:
        exito = services.generar_word_cancelacion(resolver_ruta_plantilla(nombre_plantilla), datos_finales, ruta_temp)
        if not exito or not os.path.exists(ruta_temp):
            raise HTTPException(status_code=500, detail="No se pudo generar la vista previa con esa plantilla.")
        with open(ruta_temp, "rb") as f:
            contenido = f.read()
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR EN /vista-previa: {e}")
        raise HTTPException(status_code=500, detail=f"No se pudo generar la vista previa: {e}")
    finally:
        borrar_archivos([ruta_temp])

    return Response(
        content=contenido,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.post("/api/expedientes/{expediente_id}/generar-word")
def generar_word(
    expediente_id: str, 
    datos_payload: Optional[Dict[str, Any]] = Body(None), 
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    try:
        expediente = obtener_expediente_autorizado(db, expediente_id, sesion)
        ruta_salida, num_credito = regenerar_word_expediente(expediente, datos_payload, db)
        detalle = {"plantilla": (expediente.datos_extraidos or {}).get("plantilla_seleccionada"),
                   "version": (expediente.datos_extraidos or {}).get("_plantilla_version")}
        if getattr(expediente, "_cambios", None):
            detalle["cambios"] = expediente._cambios
        kpis.registrar(sesion["username"], "word", expediente.id, num_credito, **detalle)
        
        return FileResponse(
            path=ruta_salida,
            filename=f"Cancelacion_{num_credito}.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        print(f"ERROR EN /generar-word: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def plantilla_cambio(datos: Dict[str, Any]) -> bool:
    """True si la plantilla del expediente cambió desde que se generó su Word."""
    version = datos.get("_plantilla_version")
    if not version:
        return False
    nombre = datos.get("plantilla_seleccionada") or datos.get("plantilla")
    actual = versiones.huella(resolver_ruta_plantilla(nombre))
    return bool(actual and actual != version)


# --- CRÉDITOS REPETIDOS: avisar antes de guardar si ese crédito ya se procesó ---
@app.get("/api/expedientes/repetidos")
def creditos_repetidos(
    creditos: str = Query(""),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    numeros = {re.sub(r"\D", "", c) for c in (creditos or "").split(",")}
    numeros = {n for n in numeros if len(n) >= 6}
    if not numeros:
        return {"repetidos": {}}
    numeros = set(sorted(numeros)[:300])
    filas = (db.query(models.Expediente).filter(models.Expediente.numero_credito.in_(numeros))
             .order_by(models.Expediente.fecha_creacion.desc()).all())
    nombres = {u.username: (u.nombre_mostrar or u.username) for u in db.query(models.Usuario).all()}
    repetidos: Dict[str, List[Dict[str, Any]]] = {}
    for exp in filas:
        d = exp.datos_extraidos or {}
        repetidos.setdefault(exp.numero_credito, []).append({
            "expediente_id": str(exp.id),
            "usuario": exp.usuario_propietario,
            "nombre_usuario": nombres.get(exp.usuario_propietario, exp.usuario_propietario),
            "fecha": exp.fecha_creacion.isoformat() if exp.fecha_creacion else None,
            "acreditado": str(d.get("nombre_acreditado") or ""),
            "estado": estado_de(exp),
        })
    return {"repetidos": repetidos}


# --- ESTADOS: Generado -> Revisado -> Entregado ---
def _cambiar_estado(db: Session, expediente, estado: str, usuario: str):
    anterior = estado_de(expediente)
    if anterior == estado:
        return False
    expediente.estado = estado
    kpis.registrar(usuario, "estado", expediente.id, expediente.numero_credito, de=anterior, a=estado)
    return True


def _estado_valido(estado: Any) -> str:
    estado = str(estado or "").strip().upper()
    if estado not in ESTADOS:
        raise HTTPException(status_code=400, detail="Estado no válido (Generado, Revisado o Entregado).")
    return estado


@app.put("/api/expedientes/{expediente_id}/estado")
def cambiar_estado_expediente(
    expediente_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    estado = _estado_valido(payload.get("estado"))
    expediente = obtener_expediente_autorizado(db, expediente_id, sesion)
    _cambiar_estado(db, expediente, estado, sesion["username"])
    db.commit()
    return {"expediente_id": str(expediente.id), "estado": estado_de(expediente)}


@app.post("/api/expedientes/estado")
def cambiar_estado_varios(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    estado = _estado_valido(payload.get("estado"))
    cambiados = 0
    for exp_id in (payload.get("ids") or [])[:500]:
        try:
            expediente = obtener_expediente_autorizado(db, exp_id, sesion)
        except HTTPException:
            continue
        cambiados += 1 if _cambiar_estado(db, expediente, estado, sesion["username"]) else 0
    db.commit()
    return {"estado": estado, "cambiados": cambiados}


# --- HISTORIAL DE CAMBIOS DE UN EXPEDIENTE ---
@app.get("/api/expedientes/{expediente_id}/bitacora")
def bitacora_expediente(
    expediente_id: str,
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user),
):
    expediente = obtener_expediente_autorizado(db, expediente_id, sesion)
    filas = (db.query(models.Actividad).filter(models.Actividad.expediente_id == str(expediente.id))
             .order_by(models.Actividad.creado_en.asc(), models.Actividad.id.asc()).all())
    nombres = {u.username: (u.nombre_mostrar or u.username) for u in db.query(models.Usuario).all()}
    eventos = [{
        "tipo": a.tipo,
        "usuario": a.username,
        "nombre_usuario": nombres.get(a.username, a.username),
        "fecha": a.creado_en.isoformat() if a.creado_en else None,
        "detalle": ({**a.detalle, "con_nombres": [nombres.get(u, u) for u in (a.detalle.get("con") or [])]}
                    if a.tipo in ("compartir", "quitar_acceso") and isinstance(a.detalle, dict) else (a.detalle or {})),
    } for a in filas]
    if not any(e["tipo"] in ("guardar", "manual", "excel") for e in eventos):
        # Expedientes de antes de la bitácora: al menos se muestra cuándo y quién lo creó
        eventos.insert(0, {
            "tipo": "creado", "usuario": expediente.usuario_propietario,
            "nombre_usuario": nombres.get(expediente.usuario_propietario, expediente.usuario_propietario),
            "fecha": expediente.fecha_creacion.isoformat() if expediente.fecha_creacion else None, "detalle": {},
        })
    d = expediente.datos_extraidos or {}
    return {
        "expediente_id": str(expediente.id),
        "numero_credito": expediente.numero_credito,
        "estado": estado_de(expediente),
        "plantilla": d.get("plantilla_seleccionada") or d.get("plantilla"),
        "version": versiones.info(db, d.get("_plantilla_version")),
        "plantilla_cambio": plantilla_cambio(d),
        "eventos": eventos,
    }


@app.get("/api/admin/usuarios")
def obtener_usuarios(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    usuarios = db.query(models.Usuario).all()
    from sqlalchemy import func as _func
    conteo = dict(db.query(models.Expediente.usuario_propietario, _func.count(models.Expediente.id))
                  .group_by(models.Expediente.usuario_propietario).all())
    return [
        {
            "id": str(u.id),
            "expedientes": int(conteo.get(u.username, 0)),
            "rol": compartir.rol_de(u),
            "username": u.username,
            "es_admin": u.es_admin,
            "creado_en": u.creado_en.isoformat() if hasattr(u, "creado_en") and u.creado_en else None,
            "activo": bool(getattr(u, "activo", True)),
            "debe_cambiar_password": bool(getattr(u, "debe_cambiar_password", False)),
            "nombre_mostrar": getattr(u, "nombre_mostrar", None) or "",
            "foto": getattr(u, "foto", None) or "",
        }
        for u in usuarios
    ]


@app.post("/api/admin/usuarios")
def crear_usuario_admin(
    username: str = Form(...),
    password: str = Form(...),
    es_admin: bool = Form(False),
    rol: str = Form(""),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    rol = (rol or "").strip().lower()
    if rol == "admin":
        es_admin = True
    usuario_existente = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if usuario_existente:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")

    auth.validar_password_nueva(password)
    pass_hash = auth.hash_password(password)
    
    nuevo_usuario = models.Usuario(
        username=username,
        password_hash=pass_hash,
        es_admin=es_admin,
        rol=None if es_admin else (rol if rol in compartir.ROLES else "operador"),
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    
    return {"status": "exito", "mensaje": "Usuario creado correctamente", "id": str(nuevo_usuario.id)}


@app.delete("/api/admin/usuarios/{usuario_id}")
def eliminar_usuario(
    usuario_id: str,
    con_expedientes: bool = Query(False),
    confirmar: str = Query(""),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Elimina un usuario. Si tiene expedientes, solo se elimina si se pide con_expedientes=true y se confirma
    con su nombre de usuario: entonces se borran también sus expedientes y su actividad (después de hacer
    un respaldo automático, por si hay que recuperar algo).
    """
    try:
        uuid_usuario = uuid.UUID(str(usuario_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de usuario inválido")

    usuario = db.query(models.Usuario).filter(models.Usuario.id == uuid_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if usuario.es_admin or usuario.username.lower() == "admin":
        raise HTTPException(status_code=400, detail="No se puede eliminar a un administrador")

    nombre_usuario = usuario.username
    expedientes = db.query(models.Expediente).filter(models.Expediente.usuario_propietario == nombre_usuario).all()
    if expedientes and not con_expedientes:
        raise HTTPException(
            status_code=409,
            detail=f"{nombre_usuario} tiene {len(expedientes)} expediente(s). Puedes desactivarlo para quitarle el acceso, "
                   f"o eliminarlo junto con sus expedientes.",
        )
    if expedientes and (confirmar or "").strip().lower() != nombre_usuario.lower():
        raise HTTPException(status_code=400, detail="Para eliminar también sus expedientes hay que confirmar con su nombre de usuario.")

    respaldo_id = None
    try:
        if expedientes:
            # Copia de todo ANTES de borrar, por si se necesita recuperar algo
            respaldo_id = respaldos.crear(db, automatico=False, usuario=admin.get("username") or "admin").id
        auth.cerrar_sesiones_de(db, nombre_usuario, motivo="cerrada")
        ids = [str(e.id) for e in expedientes]
        if ids:
            db.query(models.Actividad).filter(models.Actividad.expediente_id.in_(ids)).delete(synchronize_session=False)
            for e in expedientes:
                for ruta in (e.ruta_word_generado,):
                    try:
                        if ruta and os.path.isfile(ruta):
                            os.remove(ruta)
                    except Exception:
                        pass
                db.delete(e)
        # Su actividad (inicios de sesión, lecturas…) también se va, para que no cuente en los reportes
        db.query(models.Actividad).filter(models.Actividad.username == nombre_usuario).delete(synchronize_session=False)
        db.query(models.Sesion).filter(models.Sesion.username == nombre_usuario).delete(synchronize_session=False)
        db.query(models.Compartido).filter((models.Compartido.propietario == nombre_usuario) | (models.Compartido.con_usuario == nombre_usuario)).delete(synchronize_session=False)
        db.delete(usuario)
        db.commit()
        print(f"--> {admin.get('username')} eliminó al usuario {nombre_usuario} con {len(ids)} expediente(s); respaldo previo #{respaldo_id}")
        return {"status": "exito", "mensaje": f"Usuario {nombre_usuario} eliminado correctamente",
                "expedientes_eliminados": len(ids), "respaldo_id": respaldo_id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar a {nombre_usuario} porque tiene información relacionada. Puedes desactivarlo para quitarle el acceso."
        )
    except Exception as e:
        db.rollback()
        print(f"ERROR al eliminar usuario: {e}")
        raise HTTPException(status_code=500, detail="Error al eliminar usuario.")


class RestablecerPasswordRequest(BaseModel):
    password_admin: str      # contraseña del administrador que hace el cambio (confirma que es él)
    password_nueva: str      # contraseña temporal para el usuario


@app.post("/api/admin/usuarios/{usuario_id}/restablecer-password")
def restablecer_password_olvidada(
    usuario_id: str,
    data: RestablecerPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Para cuando alguien olvidó su contraseña: el administrador confirma con SU propia contraseña y le asigna
    una temporal. Al entrar con ella, el sistema le pide cambiarla por una propia. Se cierran sus sesiones.
    """
    usuario = _buscar_usuario(db, usuario_id)
    if usuario.username == admin["username"]:
        raise HTTPException(status_code=400, detail="Para tu propia contraseña usa Mi perfil → Cambiar contraseña.")
    yo = db.query(models.Usuario).filter(models.Usuario.username == admin["username"]).first()
    if not yo or not auth.comprobar_password(yo, data.password_admin, db):
        raise HTTPException(status_code=400, detail="Tu contraseña de administrador no es correcta.")
    auth.validar_password_nueva(data.password_nueva)
    usuario.password_hash = auth.hash_password(data.password_nueva)
    usuario.debe_cambiar_password = True
    auth.cerrar_sesiones_de(db, usuario.username, motivo="contrasena")
    db.commit()
    kpis.registrar(admin["username"], "restablecer_password", usuario=usuario.username)
    print(f"--> {admin['username']} restableció la contraseña de {usuario.username}")
    return {"status": "exito", "mensaje": f"Contraseña de {usuario.username} restablecida. Al entrar deberá cambiarla."}


class ResetPasswordRequest(BaseModel):
    password_nueva: str
    password_actual: Optional[str] = None  # la contraseña actual del usuario al que se le cambia


class CambiarActivoRequest(BaseModel):
    activo: bool


def _buscar_usuario(db: Session, usuario_id: str) -> models.Usuario:
    try:
        uuid_usuario = uuid.UUID(str(usuario_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de usuario inválido")
    usuario = db.query(models.Usuario).filter(models.Usuario.id == uuid_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return usuario


@app.post("/api/admin/usuarios/{usuario_id}/password")
def restablecer_password(
    usuario_id: str,
    data: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """El admin cambia la contraseña de un usuario (debe escribir la contraseña actual de ese usuario)."""
    usuario = _buscar_usuario(db, usuario_id)
    if not data.password_actual or not auth.comprobar_password(usuario, data.password_actual, db):
        raise HTTPException(status_code=400, detail=f"La contraseña actual de {usuario.username} no es correcta.")
    if data.password_nueva == data.password_actual:
        raise HTTPException(status_code=400, detail="La contraseña nueva debe ser diferente a la actual.")
    auth.validar_password_nueva(data.password_nueva)
    usuario.password_hash = auth.hash_password(data.password_nueva)
    # Se cierran las sesiones abiertas de ese usuario (menos la del admin que hace el cambio)
    auth.cerrar_sesiones_de(db, usuario.username, excepto=auth.session_id_de(request), motivo="contrasena")
    db.commit()
    return {"status": "exito", "mensaje": f"Contraseña de {usuario.username} actualizada."}


@app.put("/api/admin/usuarios/{usuario_id}/activo")
def cambiar_estado_usuario(
    usuario_id: str,
    data: CambiarActivoRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Activa o desactiva a un usuario. Uno desactivado no puede entrar, pero se conserva su historial."""
    usuario = _buscar_usuario(db, usuario_id)
    if usuario.username == admin["username"]:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propio usuario.")
    if not data.activo and (usuario.es_admin or usuario.username.lower() == "admin"):
        raise HTTPException(status_code=400, detail="No se puede desactivar a un administrador.")

    usuario.activo = data.activo
    if not data.activo:
        auth.cerrar_sesiones_de(db, usuario.username)
    db.commit()
    estado = "activado" if data.activo else "desactivado"
    return {"status": "exito", "mensaje": f"Usuario {usuario.username} {estado}.", "activo": usuario.activo}


class CambiarRolRequest(BaseModel):
    es_admin: Optional[bool] = None
    rol: Optional[str] = None   # admin / operador / revisor


@app.put("/api/admin/usuarios/{usuario_id}/rol")
def cambiar_rol_usuario(
    usuario_id: str,
    data: CambiarRolRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Cambia el tipo de usuario: administrador, operador o revisor. La cuenta «admin» y la propia no se cambian."""
    usuario = _buscar_usuario(db, usuario_id)
    if usuario.username == admin["username"]:
        raise HTTPException(status_code=400, detail="No puedes cambiar tus propios permisos.")
    if usuario.username.lower() == "admin":
        raise HTTPException(status_code=400, detail="La cuenta principal «admin» siempre es administrador.")
    nuevo = (data.rol or "").strip().lower()
    if not nuevo:
        nuevo = "admin" if data.es_admin else "operador"
    if nuevo not in ("admin",) + compartir.ROLES:
        raise HTTPException(status_code=400, detail="Tipo de usuario no válido.")
    antes = compartir.rol_de(usuario)
    if antes == nuevo:
        return {"status": "exito", "mensaje": "Sin cambios.", "es_admin": bool(usuario.es_admin), "rol": antes}
    usuario.es_admin = nuevo == "admin"
    usuario.rol = None if nuevo == "admin" else nuevo
    # Sus sesiones abiertas tienen los permisos anteriores: se cierran para que entre con los nuevos
    auth.cerrar_sesiones_de(db, usuario.username)
    db.commit()
    nombres_rol = {"admin": "administrador", "operador": "operador", "revisor": "revisor"}
    print(f"--> {admin['username']} cambió a {usuario.username} de {antes} a {nuevo}")
    return {"status": "exito", "mensaje": f"{usuario.username} ahora es {nombres_rol[nuevo]}.", "es_admin": bool(usuario.es_admin), "rol": nuevo}


@app.post("/api/admin/plantilla")
async def actualizar_plantilla(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    nombre_archivo = os.path.basename(file.filename.replace("\\", "/"))
    if not nombre_archivo.endswith(".docx"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un documento .docx")
    
    os.makedirs("templates", exist_ok=True)
    ruta_plantilla = os.path.join("templates", nombre_archivo)
    
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    with open(ruta_plantilla, "wb") as buffer:
        buffer.write(contenido)

    # Copia en la base de datos para que la plantilla no se pierda al redesplegar en Railway
    existente = db.query(models.PlantillaSubida).filter(models.PlantillaSubida.nombre == nombre_archivo).first()
    if existente:
        existente.contenido = contenido
        existente.subida_por = admin["username"]
    else:
        db.add(models.PlantillaSubida(nombre=nombre_archivo, contenido=contenido, subida_por=admin["username"]))
    db.commit()
        
    return {"status": "exito", "mensaje": f"Plantilla '{nombre_archivo}' subida correctamente"}


@app.get("/api/admin/plantilla")
def obtener_plantillas_admin(admin: dict = Depends(require_admin)):
    if not os.path.exists("templates"):
        os.makedirs("templates", exist_ok=True)
        return {"plantillas": []}
    
    archivos = [
        f for f in os.listdir("templates") 
        if f.endswith(".docx") and not f.startswith("~$")
    ]
    return {"plantillas": sorted(archivos)}


@app.post("/api/expedientes/generar-manual")
def generar_expediente_manual(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    solo_operadores(sesion)
    try:
        usuario = sesion["username"]
        plantilla = payload.get("plantilla") or payload.get("plantilla_seleccionada") or "plantilla_manera2.docx"
        
        num_credito = payload.get("numero_credito")
        if not num_credito:
            raise HTTPException(status_code=400, detail="El número de crédito es obligatorio")

        datos_limpios = limpiar_datos_para_plantilla(payload, num_credito)
        datos_limpios["plantilla_seleccionada"] = plantilla

        ruta_salida = ruta_word_unica(num_credito)

        exito = generar_word_versionado(db, plantilla, datos_limpios, ruta_salida)
        if not exito:
            raise HTTPException(status_code=500, detail="Error al generar el documento Word")

        nuevo_expediente = models.Expediente(
            usuario_propietario=usuario,
            numero_credito=num_credito,
            datos_extraidos=datos_limpios,
            ruta_pdf_constancia="Generado manualmente (Sin PDF)",
            ruta_word_generado=ruta_salida
        )
        db.add(nuevo_expediente)
        db.commit()
        db.refresh(nuevo_expediente)
        kpis.registrar(usuario, "manual", nuevo_expediente.id, num_credito, origen="manual", plantilla=plantilla)

        return {
            "status": "exito",
            "mensaje": "¡Expediente manual generado correctamente!",
            "id": str(nuevo_expediente.id),
            "expediente_id": str(nuevo_expediente.id),
            "datos_extraidos": datos_limpios,
            "ruta_word": ruta_salida,
            "plantilla_seleccionada": plantilla
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expedientes/procesar-excel")
def procesar_excel(
    file: UploadFile = File(...),
    usuario_propietario: Optional[str] = Form("admin"),
    plantilla: Optional[str] = Form("plantilla_manera2.docx"),
    indices_bloque: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    sesion: dict = Depends(require_user)
):
    solo_operadores(sesion)
    try:
        import json
        usuario_propietario = sesion["username"]

        if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="El archivo debe ser un Excel o CSV válido.")

        ruta_temp, _ = guardar_upload(file)
        try:
            if file.filename.lower().endswith('.csv'):
                df = pd.read_csv(ruta_temp)
            else:
                df = pd.read_excel(ruta_temp)
        finally:
            borrar_archivos([ruta_temp])

        ruta_plantilla = resolver_ruta_plantilla(plantilla)
        indices_a_procesar = json.loads(indices_bloque) if indices_bloque else list(df.index)
        
        resultados = []
        conteo_exitosos = 0

        for index in indices_a_procesar:
            if index >= len(df):
                continue
            row = df.iloc[index]
            try:
                fila_dict = row.to_dict()
                fila_normalizada = {str(k).strip().lower(): v for k, v in fila_dict.items() if pd.notna(v)}

                num_credito = str(
                    fila_normalizada.get('numero_credito') or 
                    fila_normalizada.get('credito') or 
                    fila_normalizada.get('número de crédito') or 
                    f"EXCEL_{index+1}"
                ).strip()

                if not num_credito or num_credito.lower() == "nan":
                    continue

                acreditado = str(fila_normalizada.get('nombre_acreditado') or fila_normalizada.get('acreditado') or fila_normalizada.get('nombre') or '').strip()
                monto = str(fila_normalizada.get('monto_credito') or fila_normalizada.get('monto') or '').strip()
                oficina = str(fila_normalizada.get('oficina_registral') or fila_normalizada.get('oficina') or '').strip()
                carta = str(fila_normalizada.get('numero_carta') or fila_normalizada.get('carta') or '').strip()
                entidad = str(fila_normalizada.get('entidad_financiera') or fila_normalizada.get('banco') or '').strip()
                fecha = str(fila_normalizada.get('fecha_liquidacion') or fila_normalizada.get('fecha') or '').strip()
                folio = str(fila_normalizada.get('folio_real') or fila_normalizada.get('folio') or '').strip()
                inmueble = str(fila_normalizada.get('datos_inmueble') or fila_normalizada.get('inmueble') or '').strip()
                fecha_exp = str(fila_normalizada.get('fecha_expedicion') or '').strip()
                credito_salario = str(fila_normalizada.get('credito_a_salario') or fila_normalizada.get('vsm') or '').strip()
                escritura = str(fila_normalizada.get('numero_escritura') or fila_normalizada.get('escritura') or '').strip()
                fecha_esc = str(fila_normalizada.get('fecha_escritura') or '').strip()
                notario = str(fila_normalizada.get('notario_origen_completo') or fila_normalizada.get('notario') or '').strip()
                conyuge = str(fila_normalizada.get('nombre_conyuge') or fila_normalizada.get('nombre_conyugue') or fila_normalizada.get('conyuge') or fila_normalizada.get('cónyuge') or '').strip()

                datos_brutos = {
                    "nombre_acreditado": acreditado,
                    "monto_credito": monto,
                    "numero_credito": num_credito,
                    "oficina_registral": oficina,
                    "numero_carta": carta,
                    "entidad_financiera": entidad,
                    "fecha_liquidacion": fecha,
                    "folio_real": folio,
                    "datos_inmueble": inmueble,
                    "fecha_expedicion": fecha_exp,
                    "credito_a_salario": credito_salario,
                    "numero_escritura": escritura,
                    "fecha_escritura": fecha_esc,
                    "notario_origen_completo": notario,
                    "nombre_conyuge": conyuge,
                    "tiene_conyuge": "Sí" if conyuge else "No",
                }

                datos_finales = limpiar_datos_para_plantilla(datos_brutos, num_credito)
                datos_finales["plantilla_seleccionada"] = plantilla

                ruta_salida = ruta_word_unica(num_credito)
                exito = generar_word_versionado(db, plantilla, datos_finales, ruta_salida)

                if not exito:
                    raise ValueError(f"No se pudo generar el documento Word para el crédito {num_credito}")

                nuevo_expediente = models.Expediente(
                    usuario_propietario=usuario_propietario,
                    numero_credito=num_credito,
                    datos_extraidos=datos_finales,
                    ruta_pdf_constancia=f"Generado por Excel: {file.filename}",
                    ruta_word_generado=ruta_salida
                )
                db.add(nuevo_expediente)
                db.commit()
                db.refresh(nuevo_expediente)
                kpis.registrar(usuario_propietario, "excel", nuevo_expediente.id, num_credito, origen="excel", plantilla=plantilla)

                resultados.append({
                    "id": str(nuevo_expediente.id),
                    "expediente_id": str(nuevo_expediente.id),
                    "archivos_asociados": 1,
                    "datos": datos_finales,
                    "datos_extraidos": datos_finales,
                    "ruta_word": ruta_salida,
                    "plantilla_seleccionada": plantilla
                })
                conteo_exitosos += 1

            except Exception as e_row:
                db.rollback()
                resultados.append({
                    "expediente_id": f"Fila_{index+1}",
                    "error": str(e_row)
                })

        return {
            "status": "exito",
            "procesados": conteo_exitosos,
            "detalles": resultados
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expedientes/previsualizar-excel")
def previsualizar_excel(file: UploadFile = File(...), sesion: dict = Depends(require_user)):
    solo_operadores(sesion)
    try:
        if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="El archivo debe ser un Excel o CSV válido.")

        ruta_temp, _ = guardar_upload(file)
        try:
            if file.filename.lower().endswith('.csv'):
                df = pd.read_csv(ruta_temp)
            else:
                df = pd.read_excel(ruta_temp)
        finally:
            borrar_archivos([ruta_temp])

        filas_preview = []
        for index, row in df.iterrows():
            fila_dict = row.to_dict()
            fila_normalizada = {str(k).strip().lower(): v for k, v in fila_dict.items() if pd.notna(v)}

            num_credito = str(
                fila_normalizada.get('numero_credito') or 
                fila_normalizada.get('credito') or 
                fila_normalizada.get('número de crédito') or 
                f"EXCEL_{index+1}"
            ).strip()

            if not num_credito or num_credito.lower() == "nan":
                continue

            acreditado = str(fila_normalizada.get('nombre_acreditado') or fila_normalizada.get('acreditado') or fila_normalizada.get('nombre') or '').strip()
            monto = str(fila_normalizada.get('monto_credito') or fila_normalizada.get('monto') or '').strip()

            filas_preview.append({
                "index": index,
                "numero_credito": num_credito,
                "nombre_acreditado": acreditado or "N/A",
                "monto_credito": monto or "N/A",
                "datos_completos": {str(k): str(v) for k, v in fila_dict.items() if pd.notna(v)}
            })

        return {
            "status": "exito",
            "total": len(filas_preview),
            "filas": filas_preview
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
