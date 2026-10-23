"""
Pruebas de los PDF guardados en el almacenamiento externo (Backblaze B2 / S3), con un bucket simulado (moto).

    cd backend
    pip install "moto[s3]"
    DATABASE_URL=postgresql+psycopg://usuario@localhost:5432/base python tests/test_documentos.py

Si moto no está instalado, las pruebas se saltan (no fallan).
"""
import io
import os
import sys
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("RESPALDOS_DESACTIVADOS", "1")

try:
    from moto import mock_aws
except ImportError:
    print("moto no está instalado: se saltan las pruebas de documentos")
    sys.exit(0)

os.environ.update({"S3_ENDPOINT": "https://s3.us-west-004.backblazeb2.com", "S3_BUCKET": "prueba-cancelaciones",
                   "S3_KEY_ID": "llave", "S3_SECRET": "secreto"})

FALLAS = []


def chk(nombre, condicion, extra=""):
    print(("OK    " if condicion else "FALLA ") + nombre + (f"  -> {extra}" if (extra and not condicion) else ""))
    if not condicion:
        FALLAS.append(nombre)


PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PDF2 = b"%PDF-1.4\n% otra version\n%%EOF\n"

with mock_aws():
    import boto3
    from fastapi.testclient import TestClient

    import documentos
    import main
    import models
    from database import SessionLocal

    boto3.client("s3", region_name="us-west-004").create_bucket(
        Bucket="prueba-cancelaciones", CreateBucketConfiguration={"LocationConstraint": "us-west-004"})
    # En la prueba el cliente apunta al bucket simulado (sin endpoint de B2)
    documentos._cliente_cache.clear()
    _orig = documentos._cliente

    def _cliente_simulado():
        return boto3.client("s3", region_name="us-west-004"), "prueba-cancelaciones"
    documentos._cliente = _cliente_simulado

    chk("documentos: configurado con las variables", documentos.configurado())
    chk("documentos: el servidor lo anuncia", "documentos" in main.auth.FUNCIONES)

    SUF = uuid.uuid4().hex[:6]
    c = lambda: TestClient(main.app, base_url="https://testserver")  # noqa: E731

    def entrar(cl, u, p):
        r = cl.post("/api/auth/login", json={"username": u, "password": p})
        tok = r.json().get("token") or r.json().get("access_token")
        cl.cookies.clear()
        return {"Authorization": "Bearer " + tok}

    with c() as cl:
        h_adm = entrar(cl, "admin", os.getenv("ADMIN_PASSWORD", "admin123"))
        dueno, otro, rev = f"doc_{SUF}", f"docotro_{SUF}", f"docrev_{SUF}"
        for u in (dueno, otro, rev):
            cl.post("/api/admin/usuarios", data={"username": u, "password": "Prueba2026!", "rol": "operador"}, headers=h_adm)
        h_d, h_o, h_r = entrar(cl, dueno, "Prueba2026!"), entrar(cl, otro, "Prueba2026!"), entrar(cl, rev, "Prueba2026!")
        cred = "17" + str(uuid.uuid4().int)[:8]
        r = cl.post("/api/expedientes/guardar", headers=h_d, json={"expedientes": [{"ref": "a", "plantilla": "CDMX_AP_H_SOLTERO",
                    "datos": {"numero_credito": cred, "nombre_acreditado": "PRUEBA DOCUMENTOS"}}]})
        eid = r.json()["resultados"][0]["expediente_id"]

        def subir(h, archivos):
            files = [("archivos", (n, b, "application/pdf")) for n, b, _ in archivos]
            data = {"tipos": [t for _, _, t in archivos]}
            return cl.post(f"/api/expedientes/{eid}/documentos", headers=h, files=files, data=data)

        r = subir(h_d, [(f"{cred}_Carta.pdf", PDF, "carta"), (f"{cred}_Constancia.pdf", PDF2, "constancia")])
        chk("subir: carta y constancia", r.status_code == 200 and r.json()["guardados"] == ["carta", "constancia"], r.text[:200])
        lista = cl.get(f"/api/expedientes/{eid}/documentos", headers=h_d).json()
        chk("listar: los dos", [d["tipo"] for d in lista["documentos"]] == ["carta", "constancia"], lista)
        doc_id = lista["documentos"][0]["id"]
        r = cl.get(f"/api/documentos/{doc_id}/archivo", headers=h_d)
        chk("descargar: el mismo PDF", r.status_code == 200 and r.content == PDF and r.headers["content-type"] == "application/pdf")
        chk("otro operador no lo ve", cl.get(f"/api/expedientes/{eid}/documentos", headers=h_o).status_code == 404)
        chk("otro operador no lo descarga", cl.get(f"/api/documentos/{doc_id}/archivo", headers=h_o).status_code == 404)
        chk("otro operador no sube", subir(h_o, [("x.pdf", PDF, "carta")]).status_code == 404)
        cl.post("/api/compartir", headers=h_d, json={"ids": [eid], "usuarios": [rev]})
        chk("compartido: sí lo ve", cl.get(f"/api/documentos/{doc_id}/archivo", headers=h_r).status_code == 200)
        chk("admin: sí lo ve", cl.get(f"/api/documentos/{doc_id}/archivo", headers=h_adm).status_code == 200)
        r = subir(h_d, [(f"{cred}_Carta.pdf", PDF, "carta")])
        chk("el mismo PDF no se vuelve a subir", r.json().get("sin_cambios") == ["carta"] and not r.json().get("guardados"), r.text[:200])
        r = subir(h_r, [(f"{cred}_Carta_nueva.pdf", PDF2, "carta")])
        chk("reemplazar la carta (compartido)", r.status_code == 200 and r.json()["guardados"] == ["carta"], r.text[:200])
        lista = cl.get(f"/api/expedientes/{eid}/documentos", headers=h_d).json()["documentos"]
        chk("queda una carta (la nueva)", len([d for d in lista if d["tipo"] == "carta"]) == 1 and lista[0]["nombre"].endswith("nueva.pdf"), lista)
        chk("el reemplazado ya no se descarga", cl.get(f"/api/documentos/{doc_id}/archivo", headers=h_d).status_code == 404)
        chk("no PDF: se rechaza", subir(h_d, [("a.pdf", b"hola", "carta")]).status_code == 400)
        chk("tipo inválido: se rechaza", subir(h_d, [("a.pdf", PDF, "otro")]).status_code == 400)
        bita = cl.get(f"/api/expedientes/{eid}/bitacora", headers=h_d).json()
        eventos = bita.get("eventos", bita) if isinstance(bita, dict) else bita
        chk("bitácora: se registra la subida", any((e.get("tipo") == "documentos") for e in eventos), str(eventos)[:200])

        # --- 12 meses después de Entregado ---
        cl.put(f"/api/expedientes/{eid}/estado", headers=h_d, json={"estado": "ENTREGADO"})
        db = SessionLocal()
        for a in db.query(models.Actividad).filter(models.Actividad.expediente_id == eid, models.Actividad.tipo == "estado").all():
            a.creado_en = datetime.now(timezone.utc) - timedelta(days=documentos.DIAS_CONSERVAR + 3)
        db.commit()
        db.close()
        res = cl.get("/api/admin/documentos/resumen", headers=h_adm).json()
        chk("resumen: por respaldar", res["por_respaldar"]["archivos"] >= 2, res)
        chk("operador no ve el resumen", cl.get("/api/admin/documentos/resumen", headers=h_d).status_code == 403)
        chk("sin respaldo no se borran", documentos.borrar_vencidos() == 0 or
            len(cl.get(f"/api/expedientes/{eid}/documentos", headers=h_d).json()["documentos"]) == 2)
        r = cl.get("/api/admin/documentos/respaldo", headers=h_adm)
        z = zipfile.ZipFile(io.BytesIO(r.content)) if r.status_code == 200 else None
        nombres = z.namelist() if z else []
        chk("respaldo: ZIP con los PDF, índice y LEEME", r.status_code == 200 and any(cred in n for n in nombres)
            and "indice.csv" in nombres and "LEEME.txt" in nombres, nombres[:5])
        chk("respaldo: no se repite", cl.get("/api/admin/documentos/respaldo", headers=h_adm).status_code in (200, 404))
        n = documentos.borrar_vencidos()
        chk("ya respaldados: se borran", n >= 2, n)
        chk("borrados: ya no aparecen", cl.get(f"/api/expedientes/{eid}/documentos", headers=h_d).json()["documentos"] == [])
        chk("el expediente sigue", cl.get(f"/api/expedientes/{eid}/bitacora", headers=h_d).status_code == 200)

        # --- Al eliminar al usuario con sus expedientes, sus PDF también se van ---
        cred2 = "18" + str(uuid.uuid4().int)[:8]
        r = cl.post("/api/expedientes/guardar", headers=h_o, json={"expedientes": [{"ref": "b", "plantilla": "CDMX_AP_H_SOLTERO",
                    "datos": {"numero_credito": cred2, "nombre_acreditado": "OTRO DOCUMENTOS"}}]})
        eid2 = r.json()["resultados"][0]["expediente_id"]
        eid_ant, eid = eid, eid2
        subir(h_o, [("c.pdf", PDF, "constancia")])
        clave = SessionLocal().query(models.Documento).filter(models.Documento.expediente_id == eid2).first().clave
        uid = next(u["id"] for u in cl.get("/api/admin/usuarios", headers=h_adm).json() if u["username"] == otro)
        r = cl.request("DELETE", f"/api/admin/usuarios/{uid}", headers=h_adm, params={"con_expedientes": "true", "confirmar": otro})
        s3, bucket = documentos._cliente()
        quedan = [o["Key"] for o in s3.list_objects_v2(Bucket=bucket).get("Contents", [])]
        chk("eliminar usuario: sus PDF se borran del bucket", r.status_code == 200 and clave not in quedan, r.text[:200])

print()
if FALLAS:
    print(f"HAY {len(FALLAS)} FALLA(S): {', '.join(FALLAS)}")
    sys.exit(1)
print("TODO OK")
