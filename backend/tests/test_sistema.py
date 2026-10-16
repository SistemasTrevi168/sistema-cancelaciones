"""
Pruebas automáticas del backend (las corre GitHub en cada push, y se pueden correr a mano).

    cd backend
    DATABASE_URL=postgresql+psycopg://usuario@localhost:5432/base python tests/test_sistema.py

No usan PDFs reales (tienen datos personales): trabajan con datos de ejemplo.
Regresan código 1 si alguna prueba falla.
"""
import io
import json
import os
import shutil
import sys
import uuid
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("RESPALDOS_DESACTIVADOS", "1")

import docx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

FALLAS = []


def chk(nombre, condicion, extra=""):
    print(("OK    " if condicion else "FALLA ") + nombre + (f"  -> {extra}" if (extra and not condicion) else ""))
    if not condicion:
        FALLAS.append(nombre)


def texto_word(contenido: bytes) -> str:
    return "\n".join(p.text for p in docx.Document(io.BytesIO(contenido)).paragraphs)


def cliente():
    return TestClient(main.app, base_url="https://testserver")


SUF = uuid.uuid4().hex[:6]
CREDITO = "15" + str(uuid.uuid4().int)[:8]
DATOS = {
    "nombre_acreditado": "MARIA PRUEBA EJEMPLO", "numero_credito": CREDITO, "monto_credito": "$150,000.00",
    "numero_carta": "0543910959", "entidad_financiera": "INFONAVIT", "fecha_liquidacion": "20/06/2024",
    "folio_real": "37509", "oficina_registral": "Toluca", "fecha_expedicion": "11/08/2026",
    "datos_inmueble": "Vivienda: DEPARTAMENTO 2, Lote: 2, Manzana: 10, Municipio: METEPEC, Estado: ESTADO DE MÉXICO",
    "credito_a_salario": "45.2095", "numero_escritura": "6411", "fecha_escritura": "10/09/2018",
    "notario_origen_completo": "del Licenciado Jorge Valdes Ramirez, Notario Público número veinticuatro del Estado de México",
}
PLANTILLA = "EDOMEX_AP_M_SOLTERA"

with cliente() as admin, cliente() as ana, cliente() as beto:
    r = admin.post("/api/auth/login", json={"username": "admin", "password": os.getenv("ADMIN_PASSWORD", "admin123")})
    chk("login admin", r.status_code == 200, r.text[:200])
    for nombre in ("ana", "beto"):
        r = admin.post("/api/admin/usuarios", data={"username": f"{nombre}_{SUF}", "password": "Prueba2026!", "es_admin": "false"})
        chk(f"crear usuario {nombre}", r.status_code == 200, r.text[:200])
    chk("login ana", ana.post("/api/auth/login", json={"username": f"ana_{SUF}", "password": "Prueba2026!"}).status_code == 200)
    chk("login beto", beto.post("/api/auth/login", json={"username": f"beto_{SUF}", "password": "Prueba2026!"}).status_code == 200)

    # ---- Permisos básicos
    chk("sin sesión no entra", cliente().get("/api/expedientes").status_code == 401)
    chk("operador no ve usuarios", ana.get("/api/admin/usuarios").status_code == 403)
    chk("operador no ve respaldos", ana.get("/api/admin/respaldos").status_code == 403)

    # ---- Créditos repetidos (antes de guardar no hay)
    r = ana.get("/api/expedientes/repetidos", params={"creditos": CREDITO}).json()
    chk("crédito nuevo no aparece como repetido", CREDITO not in r["repetidos"])

    # ---- Guardar (lee -> corrige -> guarda): queda GENERADO, con versión de plantilla y bitácora
    metricas = {"origen": "individual", "corregidos": ["fecha_escritura"], "cambios": {"fecha_escritura": ["", "10/09/2018"]}}
    r = ana.post("/api/expedientes/guardar", json={"expedientes": [{"ref": "x", "datos": DATOS, "plantilla": PLANTILLA,
                                                                    "archivos": [f"{CREDITO}_Carta.pdf"], "metricas": metricas}]})
    res = r.json()["resultados"][0]
    chk("guardar expediente", r.status_code == 200 and res.get("expediente_id"), r.text[:300])
    exp_id = res.get("expediente_id")
    chk("guarda la versión de plantilla", bool(res["datos_extraidos"].get("_plantilla_version")))

    hist = {h["id"]: h for h in ana.get("/api/expedientes").json()}
    chk("aparece en Mi Historial como GENERADO", hist.get(exp_id, {}).get("estado") == "GENERADO")
    chk("la plantilla no ha cambiado", hist.get(exp_id, {}).get("plantilla_cambio") is False)
    chk("beto no ve el expediente de ana", exp_id not in {h["id"] for h in beto.get("/api/expedientes").json()})

    r = beto.get("/api/expedientes/repetidos", params={"creditos": f"{CREDITO},123"}).json()["repetidos"]
    chk("repetido: avisa quién y cuándo (aunque sea de otro usuario)",
        CREDITO in r and r[CREDITO][0]["usuario"] == f"ana_{SUF}" and r[CREDITO][0]["fecha"])

    # ---- Estados
    r = ana.put(f"/api/expedientes/{exp_id}/estado", json={"estado": "revisado"})
    chk("cambiar a REVISADO", r.status_code == 200 and r.json()["estado"] == "REVISADO", r.text[:200])
    chk("estado inválido -> 400", ana.put(f"/api/expedientes/{exp_id}/estado", json={"estado": "FIRMADO"}).status_code == 400)
    chk("beto no cambia el estado de ana", beto.put(f"/api/expedientes/{exp_id}/estado", json={"estado": "ENTREGADO"}).status_code == 404)
    r = ana.post("/api/expedientes/estado", json={"ids": [exp_id], "estado": "ENTREGADO"})
    chk("cambio de estado de varios", r.json().get("cambiados") == 1)

    # ---- Editar y volver a descargar: queda en la bitácora con antes -> después
    datos2 = dict(DATOS, nombre_acreditado="MARIA PRUEBA CORREGIDA")
    r = ana.post(f"/api/expedientes/{exp_id}/generar-word", json={"datos": datos2, "plantilla": PLANTILLA})
    chk("descargar Word con datos corregidos", r.status_code == 200 and "MARIA PRUEBA CORREGIDA" in texto_word(r.content))

    b = ana.get(f"/api/expedientes/{exp_id}/bitacora").json()
    tipos = [e["tipo"] for e in b["eventos"]]
    chk("bitácora: guardar, estados y word", tipos[:1] == ["guardar"] and tipos.count("estado") == 2 and "word" in tipos, tipos)
    guardar_ev = b["eventos"][0]
    chk("bitácora: corrección antes -> después al guardar", guardar_ev["detalle"].get("cambios", {}).get("fecha_escritura") == ["", "10/09/2018"])
    word_ev = [e for e in b["eventos"] if e["tipo"] == "word"][-1]
    chk("bitácora: cambio al editar", word_ev["detalle"].get("cambios", {}).get("nombre_acreditado") == ["MARIA PRUEBA EJEMPLO", "MARIA PRUEBA CORREGIDA"],
        word_ev["detalle"])
    estado_ev = [e for e in b["eventos"] if e["tipo"] == "estado"][0]
    chk("bitácora: estado de -> a", estado_ev["detalle"] == {"de": "GENERADO", "a": "REVISADO"})
    chk("bitácora: versión de plantilla", (b.get("version") or {}).get("huella") == res["datos_extraidos"]["_plantilla_version"])
    chk("beto no ve la bitácora de ana", beto.get(f"/api/expedientes/{exp_id}/bitacora").status_code == 404)

    # ---- Versiones: si la plantilla cambia, el Word del expediente se regenera con la versión original
    ruta = main.resolver_ruta_plantilla(PLANTILLA)
    respaldo_plantilla = ruta + ".respaldo_prueba"
    shutil.copy(ruta, respaldo_plantilla)
    try:
        d = docx.Document(ruta)
        d.add_paragraph("VERSION NUEVA DE LA PLANTILLA")
        d.save(ruta)
        hist = {h["id"]: h for h in ana.get("/api/expedientes").json()}
        chk("Mi Historial avisa que la plantilla cambió", hist[exp_id]["plantilla_cambio"] is True)
        r = ana.post(f"/api/expedientes/{exp_id}/generar-word", json={"datos": datos2, "plantilla": PLANTILLA})
        chk("se regenera con la versión original", r.status_code == 200 and "VERSION NUEVA" not in texto_word(r.content))
        r = ana.post(f"/api/expedientes/{exp_id}/generar-word", json={"datos": datos2, "plantilla": PLANTILLA, "plantilla_actual": True})
        chk("con 'usar la plantilla actual' sale la nueva", r.status_code == 200 and "VERSION NUEVA" in texto_word(r.content))
        hist = {h["id"]: h for h in ana.get("/api/expedientes").json()}
        chk("después ya queda con la versión nueva", hist[exp_id]["plantilla_cambio"] is False)
        # Un expediente nuevo usa la plantilla nueva
        r = ana.post("/api/expedientes/vista-previa", json={"datos": DATOS, "plantilla": PLANTILLA})
        chk("vista previa usa la plantilla actual", "VERSION NUEVA" in texto_word(r.content))
    finally:
        shutil.move(respaldo_plantilla, ruta)

    # ---- Captura manual y coacreditados
    r = ana.post("/api/expedientes/generar-manual", json=dict(DATOS, numero_credito="77" + CREDITO[2:], plantilla=PLANTILLA))
    chk("captura manual", r.status_code == 200 and r.json().get("datos_extraidos", {}).get("_plantilla_version"), r.text[:200])
    coac = dict(DATOS, nombre_acreditado_2="JUAN SEGUNDO EJEMPLO", numero_credito_2="0900203137", numero_carta_2="0524486193",
                fecha_expedicion_2="01/02/2025", fecha_liquidacion_2="03/04/2024", credito_a_salario_2="40.5", monto_credito_2="120000")
    r = ana.post("/api/expedientes/vista-previa", json={"datos": coac, "plantilla": "COAC_EDOMEX_AP"})
    t = texto_word(r.content) if r.status_code == 200 else ""
    chk("coacreditados: Word con los dos trabajadores", "MARIA PRUEBA EJEMPLO" in t and "JUAN SEGUNDO EJEMPLO" in t and "{{" not in t)
    chk("coacreditados: monto del trabajador dos con letra", "$120,000.00 M.N. (CIENTO VEINTE MIL PESOS" in t)
    r = ana.post("/api/expedientes/normalizar-campo", json={"campo": "monto_credito_2", "texto": "5000"}).json()
    chk("normalizar dato del trabajador dos", r["valor"] == "$5,000.00" and "monto_letras_2" in r["extra"])

    # ---- ZIP (usa la versión guardada si el Word ya no está en disco)
    r = ana.post("/api/expedientes/descargar-zip", json=[exp_id])
    chk("descargar ZIP", r.status_code == 200 and len(zipfile.ZipFile(io.BytesIO(r.content)).namelist()) == 1)

    # ---- Respaldos
    r = admin.post("/api/admin/respaldos")
    chk("crear respaldo", r.status_code == 200 and r.json().get("id"), r.text[:200])
    lista = admin.get("/api/admin/respaldos").json()["respaldos"]
    chk("lista de respaldos", any(x["id"] == r.json().get("id") for x in lista))
    z = admin.get(f"/api/admin/respaldos/{r.json().get('id')}")
    archivo = zipfile.ZipFile(io.BytesIO(z.content))
    expedientes = json.loads(archivo.read("base/expedientes.json"))
    chk("el respaldo trae los expedientes", any(e["numero_credito"] == CREDITO for e in expedientes))
    chk("el respaldo trae las plantillas", any(n.startswith("plantillas/") for n in archivo.namelist()))
    chk("el respaldo trae las versiones de plantilla", len(json.loads(archivo.read("base/plantilla_versiones.json"))) >= 1)

    # ---- Inactividad / sesión
    r = ana.get("/api/auth/ping", params={"activo": 1}).json()
    chk("ping de sesión", r.get("activa") is True)

print()
if FALLAS:
    print(f"HAY {len(FALLAS)} FALLA(S): {', '.join(FALLAS)}")
    sys.exit(1)
print("TODO OK")
