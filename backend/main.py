import os
import shutil
import zipfile
import re
import pathlib
import uuid
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, UploadFile, BackgroundTasks, File, Form, Depends, HTTPException, Body, Query, Header
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import create_engine
import pandas as pd

import models, services
from database import get_db, SessionLocal, engine
import auth

# URL directa a PostgreSQL en Railway
DATABASE_URL = os.getenv("DATABASE_URL")

# Crear las tablas en PostgreSQL automáticamente al arrancar
models.Base.metadata.create_all(bind=engine)

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

def eliminar_archivo_temporal(ruta: str):
    """Elimina el archivo ZIP del servidor de manera segura después de la descarga."""
    if os.path.exists(ruta):
        try:
            os.remove(ruta)
        except Exception as e:
            print(f"Error al eliminar archivo temporal: {e}")

@app.post("/api/expedientes/descargar-zip")
def descargar_zip(
    expediente_ids: List[str] = Body(...), 
    background_tasks: BackgroundTasks = None, 
    db: Session = Depends(get_db)
):
    os.makedirs("uploads/zips", exist_ok=True)
    ruta_zip = "uploads/zips/Cancelaciones_Lote.zip"
    
    with zipfile.ZipFile(ruta_zip, 'w') as zipf:
        for exp_id in expediente_ids:
            try:
                uuid_val = uuid.UUID(str(exp_id))
            except ValueError:
                continue 
            
            exp = db.query(models.Expediente).filter(models.Expediente.id == uuid_val).first()
            if exp and exp.ruta_word_generado and os.path.exists(exp.ruta_word_generado):
                nombre_archivo = os.path.basename(exp.ruta_word_generado)
                zipf.write(exp.ruta_word_generado, arcname=nombre_archivo)

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


def numero_a_letras(monto: Any) -> str:
    """Convierte un valor numérico o texto a su representación formal en letras en MXN con centavos explícitos."""
    if not monto:
        return ""
    try:
        monto_str = re.sub(r"[^\d.]", "", str(monto))
        val = float(monto_str)
        
        enteros = int(val)
        centavos = int(round((val - enteros) * 100))
        
        unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
        decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
        dieces = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"]
        centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

        def _convertir_grupo(n: int) -> str:
            if n == 0:
                return ""
            if n == 100:
                return "CIEN"
            
            c = n // 100
            d = (n % 100) // 10
            u = n % 10
            
            res = []
            if c > 0:
                res.append(centenas[c])
            
            if d == 1:
                res.append(dieces[u])
            else:
                if d == 2 and u > 0:
                    res.append(f"VEINTI{unidades[u].lower()}".upper())
                else:
                    if d > 0:
                        res.append(decenas[d])
                    if u > 0:
                        if d > 0:
                            res.append("Y")
                        res.append(unidades[u])
            return " ".join(res)

        if enteros == 0:
            texto_enteros = "CERO PESOS"
        else:
            partes = []
            millones = enteros // 1_000_000
            miles = (enteros % 1_000_000) // 1_000
            unidades_restantes = enteros % 1_000

            if millones > 0:
                if millones == 1:
                    partes.append("UN MILLÓN")
                else:
                    partes.append(f"{_convertir_grupo(millones)} MILLONES")
            
            if miles > 0:
                if miles == 1:
                    partes.append("MIL")
                else:
                    partes.append(f"{_convertir_grupo(miles)} MIL")
            
            if unidades_restantes > 0:
                partes.append(_convertir_grupo(unidades_restantes))
            
            texto_enteros = " ".join(partes) + " PESOS"

        if centavos > 0:
            texto_centavos = f"CON {_convertir_grupo(centavos)} CENTAVOS"
        else:
            texto_centavos = "CON CERO CENTAVOS"

        return f"{texto_enteros} {texto_centavos}, MONEDA NACIONAL"
    except Exception:
        return str(monto)


def numero_folio_a_letras(monto: Any) -> str:
    """Convierte un número de folio a su representación en letras sin mención de moneda."""
    if not monto:
        return ""
    try:
        monto_str = re.sub(r"[^\d.]", "", str(monto))
        if not monto_str:
            return str(monto)
        val = float(monto_str)
        enteros = int(val)
        
        unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
        decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
        dieces = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"]
        centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

        def _convertir_grupo(n: int) -> str:
            if n == 0:
                return ""
            if n == 100:
                return "CIEN"
            
            c = n // 100
            d = (n % 100) // 10
            u = n % 10
            
            res = []
            if c > 0:
                res.append(centenas[c])
            
            if d == 1:
                res.append(dieces[u])
            else:
                if d == 2 and u > 0:
                    res.append(f"VEINTI{unidades[u].lower()}".upper())
                else:
                    if d > 0:
                        res.append(decenas[d])
                    if u > 0:
                        if d > 0:
                            res.append("Y")
                        res.append(unidades[u])
            return " ".join(res)

        if enteros == 0:
            return "CERO"
        
        partes = []
        millones = enteros // 1_000_000
        miles = (enteros % 1_000_000) // 1_000
        unidades_restantes = enteros % 1_000

        if millones > 0:
            if millones == 1:
                partes.append("UN MILLÓN")
            else:
                partes.append(f"{_convertir_grupo(millones)} MILLONES")
        
        if miles > 0:
            if miles == 1:
                partes.append("MIL")
            else:
                partes.append(f"{_convertir_grupo(miles)} MIL")
        
        if unidades_restantes > 0:
            partes.append(_convertir_grupo(unidades_restantes))
        
        return " ".join(partes)
    except Exception:
        return str(monto)


def palabras_a_numero(texto: str) -> Optional[int]:
    """Convierte un texto con números en palabras (ej. 'treinta y siete mil quinientos nueve') a un entero."""
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
    """Corrige de forma automática la separación de números del 21 al 29 en textos legales."""
    if not texto:
        return ""
    reemplazos = {
        r'\bveinte\s+y\s+uno\b': 'veintiuno',
        r'\bveinte\s+y\s+dos\b': 'veintidós',
        r'\bveinte\s+y\s+tres\b': 'veintitrés',
        r'\bveinte\s+y\s+cuatro\b': 'veinticuatro',
        r'\bveinte\s+y\s+cinco\b': 'veinticinco',
        r'\bveinte\s+y\s+seis\b': 'veintiséis',
        r'\bveinte\s+y\s+siete\b': 'veintisiete',
        r'\bveinte\s+y\s+ocho\b': 'veintiocho',
        r'\bveinte\s+y\s+nueve\b': 'veintinueve',
        r'\bVEINTE\s+Y\s+UNO\b': 'VEINTIUNO',
        r'\bVEINTE\s+Y\s+DOS\b': 'VEINTIDÓS',
        r'\bVEINTE\s+Y\s+TRES\b': 'VEINTITRÉS',
        r'\bVEINTE\s+Y\s+CUATRO\b': 'VEINTICUATRO',
        r'\bVEINTE\s+Y\s+CINCO\b': 'VEINTICINCO',
        r'\bVEINTE\s+Y\s+SEIS\b': 'VEINTISÉIS',
        r'\bVEINTE\s+Y\s+SIETE\b': 'VEINTISIETE',
        r'\bVEINTE\s+Y\s+OCHO\b': 'VEINTIOCHO',
        r'\bVEINTE\s+Y\s+NUEVE\b': 'VEINTINUEVE',
    }
    for patron, reemplazo in reemplazos.items():
        texto = re.sub(patron, reemplazo, str(texto), flags=re.IGNORECASE)
    return texto


def procesar_19_puntos_inmueble(texto_inmueble_raw: str, texto_completo: str = "") -> Dict[str, str]:
    """
    Extrae y organiza los datos del inmueble en el orden estricto de 19 puntos.
    """
    texto_base = f"{str(texto_completo)} {str(texto_inmueble_raw)}"
    
    def buscar(patrones, default="NO_ENCONTRADO"):
        for p in patrones:
            match = re.search(p, texto_base, re.IGNORECASE)
            if match:
                val = match.group(1).strip()
                if val:
                    return corregir_numeros_compuestos(val)
        return default

    return {
        "1_vivienda": buscar([r'vivienda[:\s]*([^,;\n]+)', r'inmueble[:\s]*([^,;\n]+)', r'departamento|casa|lote']),
        "2_uso_de_suelo": buscar([r'uso\s+de\s+suelo[:\s]*([^,;\n]+)', r'uso\s+suelo[:\s]*([^,;\n]+)']),
        "3_no_interior": buscar([r'no\.?\s*int\.?[:\s]*([0-9a-zA-Z\-]+)', r'interior[:\s]*([0-9a-zA-Z\-]+)']),
        "4_lote": buscar([r'\blote[:\s]*([0-9a-zA-Z\-]+)']),
        "5_manzana": buscar([r'manzana[:\s]*([0-9a-zA-Z\-]+)', r'\bmza\.?[:\s]*([0-9a-zA-Z\-]+)']),
        "6_supermanzana": buscar([r'supermanzana[:\s]*([0-9a-zA-Z\-]+)', r'\bsm\.?[:\s]*([0-9a-zA-Z\-]+)']),
        "7_etapa": buscar([r'etapa[:\s]*([0-9a-zA-Z\-]+)']),
        "8_condominio": buscar([r'condominio[:\s]*([0-9a-zA-Z\-]+)', r'conjunto\s+habitacional[:\s]*([^,;\n]+)']),
        "9_calle": buscar([r'calle[:\s]*([^,;\n]+)', r'avenida[:\s]*([^,;\n]+)', r'blvd\.?[:\s]*([^,;\n]+)']),
        "10_no_exterior": buscar([r'no\.?\s*ext\.?[:\s]*([0-9a-zA-Z\-]+)', r'exterior[:\s]*([0-9a-zA-Z\-]+)', r'número[:\s]*([0-9a-zA-Z\-]+)']),
        "11_denominacion_del_inmueble": buscar([r'denominaci[oó]n\s+(?:del\s+inmueble)?[:\s]*([^,;\n]+)', r'edificio[:\s]*([^,;\n]+)']),
        "12_seccion": buscar([r'secci[oó]n[:\s]*([0-9a-zA-Z\-]+)']),
        "13_colonia": buscar([r'colonia[:\s]*([^,;\n]+)', r'fraccionamiento[:\s]*([^,;\n]+)', r'pueblo[:\s]*([^,;\n]+)']),
        "14_sector": buscar([r'sector[:\s]*([^,;\n]+)', r'edf\.?[:\s]*([0-9a-zA-Z\-]+)']),
        "15_municipio": buscar([r'municipio[:\s]*([^,;\n]+)', r'alcalad[ií]a[:\s]*([^,;\n]+)', r'delegaci[oó]n[:\s]*([^,;\n]+)']),
        "16_distrito": buscar([r'distrito[:\s]*([^,;\n]+)']),
        "17_estado": buscar([r'estado[:\s]*([^,;\n]+)', r'entidad[:\s]*([^,;\n]+)']),
        "18_observaciones": buscar([r'observaciones[:\s]*([^.\n]+)', r'tr[aá]mite[:\s]*([^.\n]+)']),
        "19_codigo_postal": buscar([r'c\.?p\.?[:\s]*(\d{5})', r'c[oó]digo\s+postal[:\s]*(\d{5})'])
    }


def limpiar_datos_para_plantilla(datos_origen: Dict[str, Any], num_credito_fallback: str = "") -> Dict[str, Any]:
    """
    Filtra y devuelve los campos requeridos para la plantilla de Word,
    aplicando conversión de folio real a número y letras, y manteniendo salario sin conversiones automáticas.
    """
    acreditado = corregir_numeros_compuestos(str(datos_origen.get("nombre_acreditado") or datos_origen.get("acreditado") or datos_origen.get("cliente") or ""))
    monto = datos_origen.get("monto_credito") or datos_origen.get("monto") or ""
    num_credito = datos_origen.get("numero_credito") or num_credito_fallback or ""
    oficina = corregir_numeros_compuestos(str(datos_origen.get("oficina_registral") or datos_origen.get("oficina") or ""))
    carta = corregir_numeros_compuestos(str(datos_origen.get("numero_carta") or datos_origen.get("carta") or ""))
    entidad = corregir_numeros_compuestos(str(datos_origen.get("entidad_financiera") or datos_origen.get("banco") or ""))
    
    fecha = corregir_numeros_compuestos(str(datos_origen.get("fecha_liquidacion") or datos_origen.get("fecha") or ""))
    
    # Folio Real: Extraer número (ya sea de dígitos o palabras) y formatear como "[número]" (CONVERSIÓN)
    folio_raw = str(datos_origen.get("folio_real") or datos_origen.get("antecedente") or "").strip()
    num_folio = palabras_a_numero(folio_raw)
    if num_folio is not None:
        folio_letras = corregir_numeros_compuestos(numero_folio_a_letras(num_folio))
        folio = f'"{num_folio}" ({folio_letras})'
    else:
        folio = corregir_numeros_compuestos(folio_raw) if folio_raw and folio_raw.lower() not in ["none", "null", "n/a", ""] else "NO_ENCONTRADO"
    
    inmueble_raw = datos_origen.get("datos_inmueble") or datos_origen.get("inmueble") or ""
    texto_raw = datos_origen.get("texto_raw") or ""
    puntos_inmueble = procesar_19_puntos_inmueble(str(inmueble_raw), str(texto_raw))
    
    inmueble_str = ", ".join([f"{k.split('_', 1)[1].replace('_', ' ').title()}: {v}" for k, v in puntos_inmueble.items() if v != "NO_ENCONTRADO"])
    if not inmueble_str:
        inmueble_str = corregir_numeros_compuestos(str(inmueble_raw))

    fecha_exp = corregir_numeros_compuestos(str(datos_origen.get("fecha_expedicion") or ""))
    
    # Crédito a Salario: Mantener valor original tal cual viene en documento sin conversiones automáticas a letras
    credito_salario = datos_origen.get("credito_a_salario") or datos_origen.get("crédito_a_salario") or ""
    credito_salario_str = str(credito_salario).strip()
    if not credito_salario_str or credito_salario_str.lower() in ["none", "null", "n/a", "", "no_encontrado"]:
        credito_salario = "NO_ENCONTRADO"
    else:
        credito_salario = corregir_numeros_compuestos(credito_salario_str)
    
    num_escritura = corregir_numeros_compuestos(str(datos_origen.get("numero_escritura") or ""))
    fecha_esc = corregir_numeros_compuestos(str(datos_origen.get("fecha_escritura") or ""))
    notario_completo = corregir_numeros_compuestos(str(datos_origen.get("notario_origen_completo") or ""))
    conyuge = datos_origen.get("tiene_conyuge") or "No"

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
    }
    resultado.update(puntos_inmueble)
    return resultado


@app.on_event("startup")
def crear_usuario_admin_defecto():
    db = SessionLocal()
    try:
        admin_existente = db.query(models.Usuario).filter(models.Usuario.username == "admin").first()
        pass_hash = auth.hash_password("admin123")
        
        if not admin_existente:
            nuevo_admin = models.Usuario(
                username="admin",
                password_hash=pass_hash,
                es_admin=True
            )
            db.add(nuevo_admin)
        else:
            admin_existente.password_hash = pass_hash
        
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


@app.get("/")
def home():
    return {"status": "OK", "mensaje": "Servidor backend conectado"}


# --- GESTIÓN DE PLANTILLAS ---
@app.get("/api/plantillas")
def obtener_lista_plantillas():
    if not os.path.exists(TEMPLATES_DIR):
        os.makedirs(TEMPLATES_DIR, exist_ok=True)
        return {"plantillas": []}
    
    archivos = [
        f for f in os.listdir(TEMPLATES_DIR) 
        if f.endswith(".docx") and not f.startswith("~$")
    ]
    return {"plantillas": sorted(archivos)}


# --- HISTORIAL ADAPTADO ---
@app.get("/api/expedientes")
def obtener_historial(
    usuario: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    usuario_activo = usuario or x_user_id
    query = db.query(models.Expediente)

    if usuario_activo:
        query = query.filter(models.Expediente.usuario_propietario == usuario_activo)

    expedientes = query.order_by(models.Expediente.fecha_creacion.desc()).all()
        
    resultado = []
    for exp in expedientes:
        datos_raw = exp.datos_extraidos or {}
        datos = limpiar_datos_para_plantilla(datos_raw, exp.numero_credito)
        
        fecha_solo = exp.fecha_creacion.strftime("%d-%m-%Y") if exp.fecha_creacion else "N/A"
        hora_sola = exp.fecha_creacion.strftime("%H:%M") if exp.fecha_creacion else "N/A"
        
        acreditado = datos.get("nombre_acreditado") or "N/A"
        monto = datos.get("monto_credito") or ""

        resultado.append({
            "id": str(exp.id),
            "expediente_id": str(exp.id),
            "_id": str(exp.id),
            "usuario_propietario": exp.usuario_propietario,
            "numero_credito": exp.numero_credito,
            "acreditado": acreditado,
            "monto": monto,
            "hora": hora_sola,
            "manera": exp.manera,
            "estado": exp.estado,
            "datos_extraidos": datos,
            "ruta_pdf_constancia": exp.ruta_pdf_constancia,
            "ruta_pdf_carta": exp.ruta_pdf_carta,
            "ruta_word_generado": exp.ruta_word_generado,
            "fecha": fecha_solo,
            "fecha_creacion": exp.fecha_creacion.isoformat() if exp.fecha_creacion else None
        })
    return resultado


# --- PROCESAMIENTO INDIVIDUAL ---
@app.post("/api/expedientes/procesar")
async def procesar_documento(
    files: List[UploadFile] = File(...),
    usuario_propietario: Optional[str] = Form(None),
    plantilla: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    try:
        propietario_final = usuario_propietario if usuario_propietario else "admin"

        os.makedirs("uploads", exist_ok=True)
        datos_extraidos_lista = []
        rutas_guardadas = []

        for file in files:
            ruta_guardado = os.path.join("uploads", file.filename)
            with open(ruta_guardado, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            datos = services.extraer_datos_pdf(ruta_guardado)
            datos_extraidos_lista.append(datos)
            rutas_guardadas.append(ruta_guardado)

        datos_combinados = services.combinar_datos_pareja(datos_extraidos_lista)
        num_credito = datos_combinados.get("numero_credito", "SIN_CREDITO")
        
        datos_limpios = limpiar_datos_para_plantilla(datos_combinados, num_credito)

        if plantilla:
            datos_limpios["plantilla_seleccionada"] = plantilla

        nuevo_expediente = models.Expediente(
            usuario_propietario=propietario_final,
            numero_credito=num_credito,
            datos_extraidos=datos_limpios,
            ruta_pdf_constancia=";".join(rutas_guardadas)
        )
        db.add(nuevo_expediente)
        db.commit()
        db.refresh(nuevo_expediente)
        
        return {
            "status": "exito",
            "id": str(nuevo_expediente.id),
            "expediente_id": str(nuevo_expediente.id),
            "datos_extraidos": datos_limpios
        }
    except Exception as e:
        print(f"ERROR EN /procesar: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expedientes/procesar-masivo")
async def procesar_masivo(
    files: List[UploadFile] = File(...),
    usuario_propietario: Optional[str] = Form(None),
    plantilla: Optional[str] = Form("plantilla_manera2.docx"),
    db: Session = Depends(get_db)
):
    try:
        propietario_final = usuario_propietario if usuario_propietario else "admin"

        os.makedirs("uploads", exist_ok=True)
        os.makedirs("uploads/generados", exist_ok=True)
        
        ruta_plantilla = resolver_ruta_plantilla(plantilla)
        archivos_procesados = []

        for file in files:
            nombre_limpio_archivo = file.filename.replace('\\', '/').split('/')[-1]

            if not nombre_limpio_archivo.lower().endswith('.pdf'):
                continue
                
            ruta_guardado = os.path.join("uploads", nombre_limpio_archivo)
            with open(ruta_guardado, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

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
            
            agrupados_por_credito[credito_key].append((ruta, datos))

        resultados = []
        for prefijo, grupo in agrupados_por_credito.items():
            try:
                lista_datos = [item[1] for item in grupo]
                
                if all("error_extraccion" in d for d in lista_datos):
                    raise ValueError("Los archivos PDF de este crédito están corruptos o vacíos.")

                lista_datos_validos = [d for d in lista_datos if "error_extraccion" not in d]
                if not lista_datos_validos:
                    lista_datos_validos = lista_datos

                datos_raw = services.combinar_datos_pareja(lista_datos_validos)
                
                num_credito = datos_raw.get("numero_credito")
                if not num_credito or num_credito == "NO_ENCONTRADO":
                    num_credito = prefijo
                else:
                    num_credito = re.sub(r'\D', '', str(num_credito))
                    if not num_credito:
                        num_credito = prefijo
                
                datos_finales = limpiar_datos_para_plantilla(datos_raw, num_credito)

                ruta_salida = f"uploads/generados/Cancelacion_{num_credito}.docx"
                services.generar_word_cancelacion(ruta_plantilla, datos_finales, ruta_salida)

                rutas_pdf = ";".join([item[0] for item in grupo])
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
                    "plantilla_seleccionada": plantilla
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


@app.put("/api/expedientes/{expediente_id}/actualizar")
def actualizar_datos_expediente(
    expediente_id: str,
    datos_actualizados: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    expediente = db.query(models.Expediente).filter(models.Expediente.id == expediente_id).first()
    if not expediente:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")

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


@app.post("/api/expedientes/{expediente_id}/generar-word")
def generar_word(
    expediente_id: str, 
    datos_payload: Optional[Dict[str, Any]] = Body(None), 
    db: Session = Depends(get_db)
):
    expediente = db.query(models.Expediente).filter(models.Expediente.id == expediente_id).first()
    
    if not expediente:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    
    datos_payload = datos_payload or {}
    datos_modificados = datos_payload.get("datos", datos_payload)
    
    datos_actuales = dict(expediente.datos_extraidos or {})
    if isinstance(datos_modificados, dict):
        datos_actuales.update(datos_modificados)

    nombre_plantilla = (
        datos_payload.get("plantilla") 
        or datos_actuales.get("plantilla_seleccionada") 
        or datos_actuales.get("plantilla")
        or "plantilla_manera2.docx"
    )
    
    ruta_plantilla = resolver_ruta_plantilla(nombre_plantilla)
    os.makedirs("uploads/generados", exist_ok=True)
    
    num_credito = datos_actuales.get("numero_credito") or expediente.numero_credito
    datos_finales = limpiar_datos_para_plantilla(datos_actuales, num_credito)
    datos_finales["plantilla_seleccionada"] = nombre_plantilla

    expediente.datos_extraidos = datos_finales
    expediente.numero_credito = num_credito
    flag_modified(expediente, "datos_extraidos")

    ruta_salida = f"uploads/generados/Cancelacion_{num_credito}.docx"
    exito = services.generar_word_cancelacion(ruta_plantilla, datos_finales, ruta_salida)
    
    if not exito:
        raise HTTPException(status_code=500, detail="Error al reescribir la plantilla Word")
    
    expediente.ruta_word_generado = ruta_salida
    db.commit()
    db.refresh(expediente)
    
    return FileResponse(
        path=ruta_salida,
        filename=f"Cancelacion_{num_credito}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


# --- ENDPOINTS DE ADMINISTRACIÓN ---

@app.get("/api/admin/usuarios")
def obtener_usuarios(db: Session = Depends(get_db)):
    usuarios = db.query(models.Usuario).all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "es_admin": u.es_admin,
            "creado_en": u.creado_en.isoformat() if hasattr(u, "creado_en") and u.creado_en else None
        }
        for u in usuarios
    ]


@app.post("/api/admin/usuarios")
def crear_usuario_admin(
    username: str = Form(...),
    password: str = Form(...),
    es_admin: bool = Form(False),
    db: Session = Depends(get_db)
):
    usuario_existente = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if usuario_existente:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
    
    pass_hash = auth.pwd_context.hash(password) if hasattr(auth, 'pwd_context') else password
    
    nuevo_usuario = models.Usuario(
        username=username,
        password_hash=pass_hash,
        es_admin=es_admin
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    
    return {"status": "exito", "mensaje": "Usuario creado correctamente", "id": str(nuevo_usuario.id)}


@app.delete("/api/admin/usuarios/{usuario_id}")
def eliminar_usuario(
    usuario_id: str, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(auth.get_current_user)
):
    if not usuario_actual.es_admin:
        raise HTTPException(status_code=403, detail="No tienes permisos de administrador")

    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if usuario.es_admin or usuario.username.lower() == "admin":
        raise HTTPException(status_code=400, detail="No se puede eliminar a un administrador")
    
    try:
        db.delete(usuario)
        db.commit()
        return {"status": "exito", "mensaje": f"Usuario {usuario.username} eliminado correctamente"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Error al eliminar usuario.")


@app.post("/api/admin/plantilla")
async def actualizar_plantilla(file: UploadFile = File(...)):
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un documento .docx")
    
    os.makedirs("templates", exist_ok=True)
    ruta_plantilla = os.path.join("templates", file.filename)
    
    with open(ruta_plantilla, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"status": "exito", "mensaje": f"Plantilla '{file.filename}' subida correctamente"}


@app.get("/api/admin/plantilla")
def obtener_plantillas_admin():
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
    db: Session = Depends(get_db)
):
    try:
        usuario = payload.get("usuario_propietario", "admin")
        plantilla = payload.get("plantilla") or payload.get("plantilla_seleccionada") or "plantilla_manera2.docx"
        
        num_credito = payload.get("numero_credito")
        if not num_credito:
            raise HTTPException(status_code=400, detail="El número de crédito es obligatorio")

        datos_limpios = limpiar_datos_para_plantilla(payload, num_credito)
        datos_limpios["plantilla_seleccionada"] = plantilla

        ruta_plantilla = resolver_ruta_plantilla(plantilla)
        os.makedirs("uploads/generados", exist_ok=True)
        ruta_salida = f"uploads/generados/Cancelacion_{num_credito}.docx"
        
        exito = services.generar_word_cancelacion(ruta_plantilla, datos_limpios, ruta_salida)
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
async def procesar_excel(
    file: UploadFile = File(...),
    usuario_propietario: Optional[str] = Form("admin"),
    plantilla: Optional[str] = Form("plantilla_manera2.docx"),
    indices_bloque: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    try:
        import json

        if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="El archivo debe ser un Excel o CSV válido.")

        os.makedirs("uploads", exist_ok=True)
        os.makedirs("uploads/generados", exist_ok=True)
        
        ruta_temp = os.path.join("uploads", file.filename)
        with open(ruta_temp, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if file.filename.lower().endswith('.csv'):
            df = pd.read_csv(ruta_temp)
        else:
            df = pd.read_excel(ruta_temp)

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
                credito_salario = str(fila_normalizada.get('credito_a_salario') or '').strip()

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
                }

                datos_finales = limpiar_datos_para_plantilla(datos_brutos, num_credito)
                datos_finales["plantilla_seleccionada"] = plantilla

                ruta_salida = f"uploads/generados/Cancelacion_{num_credito}.docx"
                exito = services.generar_word_cancelacion(ruta_plantilla, datos_finales, ruta_salida)
                
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
async def previsualizar_excel(file: UploadFile = File(...)):
    try:
        if not file.filename.lower().endswith(('.xlsx', '.xls', '.csv')):
            raise HTTPException(status_code=400, detail="El archivo debe ser un Excel o CSV válido.")

        os.makedirs("uploads", exist_ok=True)
        ruta_temp = os.path.join("uploads", file.filename)
        with open(ruta_temp, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if file.filename.lower().endswith('.csv'):
            df = pd.read_csv(ruta_temp)
        else:
            df = pd.read_excel(ruta_temp)

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