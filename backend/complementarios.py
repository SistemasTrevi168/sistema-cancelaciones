"""
Datos complementarios: el Excel que llega después de generar los expedientes, con el número de expediente,
la escritura (instrumento), el volumen y la fecha de cada acreditado.

Flujo:
  1. Se sube el Excel (POST /api/complementarios/analizar). Se lee la hoja «254» (o la primera que tenga
     los encabezados), y cada renglón se coteja con los expedientes guardados: primero por NÚMERO DE CRÉDITO
     y se comprueba con el NOMBRE DEL ACREDITADO (sin importar acentos ni el orden de nombre y apellidos).
  2. Se revisa la lista y se llenan (POST /api/complementarios/{id}/llenar): a cada expediente se le guardan
     sus datos y se vuelve a generar su Word con su plantilla. No cambia su estado.
  3. El Excel queda registrado (por su huella): si se vuelve a subir, se avisa que ya se usó y se sigue
     solo con lo pendiente. Lo que no tenía expediente queda pendiente y se llena solo cuando ese
     expediente se guarde.
"""
import difflib
import hashlib
import io
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

import compartir
import kpis
import models
import services
from auth import require_user
from database import get_db

router = APIRouter(prefix="/api/complementarios", tags=["complementarios"])

# Encabezados que se reconocen (sin acentos, en mayúsculas, sin signos)
_COLUMNAS = {
    "expediente": ("EXP", "NUM EXP", "NUMERO DE EXPEDIENTE", "NO EXP", "EXPEDIENTE"),
    "escritura": ("ESC", "ESCRITURA", "INSTRUMENTO", "NUM ESCRITURA"),
    "volumen": ("VOL", "VOLUMEN"),
    "fecha": ("FECHA",),
    "credito": ("NUMERO DE CREDITO", "CREDITO", "NUM CREDITO", "DR BCS CANC HIP CV CREDITO", "NO DE CREDITO"),
    "nombre": ("NOMBRE DEL ACREDITADO", "NOMBRE", "ACREDITADO", "DR BCS CANC HIPO TX NOMBRE ACREDITADO"),
}
_MAX_FILAS = 5000


def _plano(texto: Any) -> str:
    t = unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", t.upper()).split())


def _credito(valor: Any) -> str:
    """1507125100 / '1507125100.0' / ' 0909138175' -> '1507125100' / '909138175' (sin ceros a la izquierda)."""
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    d = re.sub(r"\D", "", str(valor).split(".")[0] if re.fullmatch(r"\s*\d+\.0+\s*", str(valor)) else str(valor))
    return d.lstrip("0")


def _palabras(nombre: Any) -> List[str]:
    return sorted(_plano(nombre).split())


def comparar_nombres(a: Any, b: Any) -> str:
    """'igual' (mismas palabras, en cualquier orden y sin acentos), 'parecido' o 'distinto'."""
    pa, pb = _palabras(a), _palabras(b)
    if not pa or not pb:
        return "distinto"
    if pa == pb:
        return "igual"
    sa, sb = set(pa), set(pb)
    # Mismo nombre con una palabra de más o de menos (un segundo nombre, por ejemplo)
    if len(sa & sb) >= 2 and (sa <= sb or sb <= sa):
        return "parecido"
    # Una letra cambiada aquí o allá (ESEIZA / ESEISA)
    if difflib.SequenceMatcher(None, " ".join(pa), " ".join(pb)).ratio() >= 0.88:
        return "parecido"
    return "distinto"


def _detectar(ws) -> Optional[Dict[str, Any]]:
    """Busca, en los primeros renglones, el de los encabezados. Regresa {fila_encabezado, columnas}."""
    for i, fila in enumerate(ws.iter_rows(min_row=1, max_row=15, values_only=True), start=1):
        planos = [_plano(c) for c in fila]
        cols: Dict[str, int] = {}
        for campo, nombres in _COLUMNAS.items():
            for j, p in enumerate(planos):
                if p and j not in cols.values() and (p in nombres or any(p == n for n in nombres)):
                    cols[campo] = j
                    break
        # Si no hubo coincidencia exacta para algunos, se intenta «empieza con»
        for campo, nombres in _COLUMNAS.items():
            if campo in cols:
                continue
            for j, p in enumerate(planos):
                if p and j not in cols.values() and any(p.startswith(n + " ") or p.endswith(" " + n) for n in nombres if len(n) > 3):
                    cols[campo] = j
                    break
        if "nombre" in cols and "credito" in cols and len(cols) >= 4:
            return {"fila_encabezado": i, "columnas": cols}
    return None


def leer_excel(contenido: bytes) -> Dict[str, Any]:
    from openpyxl import load_workbook
    try:
        wb = load_workbook(io.BytesIO(contenido), data_only=True, read_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo abrir el archivo. Debe ser un Excel (.xlsx).")
    hojas = list(wb.worksheets)
    # Primero la hoja «254»; si no, la primera visible que tenga los encabezados (las ocultas al final)
    hojas.sort(key=lambda w: (0 if str(w.title).strip() == "254" else 1, 1 if getattr(w, "sheet_state", "visible") != "visible" else 0))
    for ws in hojas:
        det = _detectar(ws)
        if not det:
            continue
        c = det["columnas"]
        filas = []
        for n, fila in enumerate(ws.iter_rows(min_row=det["fila_encabezado"] + 1, values_only=True), start=det["fila_encabezado"] + 1):
            val = lambda k: (fila[c[k]] if k in c and c[k] < len(fila) else None)  # noqa: E731
            nombre = " ".join(str(val("nombre") or "").split())
            credito = _credito(val("credito"))
            if not nombre and not credito:
                continue
            datos = services.normalizar_complementarios({
                "comp_expediente": val("expediente"), "comp_escritura": val("escritura"),
                "comp_volumen": val("volumen"), "comp_fecha": val("fecha"),
            })
            filas.append({"n": n, "nombre": nombre, "credito": credito,
                          "expediente": datos.get("comp_expediente", ""), "escritura": datos.get("comp_escritura", ""),
                          "volumen": datos.get("comp_volumen", ""), "fecha": datos.get("comp_fecha", ""),
                          "estado": "pendiente"})
            if len(filas) >= _MAX_FILAS:
                break
        faltan = [k for k in ("expediente", "escritura", "volumen", "fecha") if k not in c]
        return {"hoja": ws.title, "filas": filas, "faltan_columnas": faltan}
    raise HTTPException(status_code=400, detail="No encontré las columnas en el Excel. Debe tener al menos NOMBRE DEL ACREDITADO, "
                                                 "NÚMERO DE CRÉDITO y las de EXP., ESC, VOL. y FECHA.")


def _visibles(db: Session, usuario: dict):
    E = models.Expediente
    q = db.query(E)
    if compartir.es_admin(usuario):
        return q
    from sqlalchemy import or_
    cond = compartir.filtro_compartidos_con(db, usuario["username"])
    return q.filter(or_(E.usuario_propietario == usuario["username"], cond) if cond is not None else E.usuario_propietario == usuario["username"])


def _nombre_exp(e) -> str:
    return str((e.datos_extraidos or {}).get("nombre_acreditado") or "")


def _datos_de_fila(f: Dict[str, Any]) -> Dict[str, str]:
    return {k: v for k, v in {"comp_expediente": f.get("expediente"), "comp_escritura": f.get("escritura"),
                              "comp_volumen": f.get("volumen"), "comp_fecha": f.get("fecha")}.items() if v}


def cotejar(db: Session, usuario: dict, filas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    A cada renglón le busca su expediente. Estados:
      coincide       crédito y nombre coinciden
      revisar_nombre el crédito coincide pero el nombre no (se muestra para revisarlo)
      solo_nombre    no hay ese crédito, pero sí un expediente con ese nombre (hay que confirmarlo)
      varios         varios expedientes con ese crédito/nombre: hay que elegir uno
      ya_lleno       el expediente ya tiene exactamente esos datos
      distinto       el expediente ya tiene otros datos complementarios (se cambiarían)
      no_encontrado  no hay expediente: queda pendiente
      llenado        ese renglón ya se usó
    """
    exps = _visibles(db, usuario).all()
    por_credito: Dict[str, list] = {}
    por_nombre: Dict[str, list] = {}
    for e in exps:
        cr = _credito(e.numero_credito) or _credito((e.datos_extraidos or {}).get("numero_credito"))
        if cr:
            por_credito.setdefault(cr, []).append(e)
        clave = " ".join(_palabras(_nombre_exp(e)))
        if clave:
            por_nombre.setdefault(clave, []).append(e)
    nombres = {u.username: (u.nombre_mostrar or u.username) for u in db.query(models.Usuario).all()}

    def info(e):
        d = e.datos_extraidos or {}
        return {"id": str(e.id), "nombre": _nombre_exp(e), "credito": e.numero_credito, "dueno": nombres.get(e.usuario_propietario, e.usuario_propietario),
                "plantilla": d.get("plantilla_seleccionada") or d.get("plantilla") or "", "estado": e.estado or "GENERADO",
                "actuales": {k: d.get(k) for k in services.CAMPOS_COMPLEMENTARIOS if d.get(k)}}

    salida = []
    for f in filas:
        r = dict(f)
        if f.get("estado") == "llenado":
            r["cotejo"] = "llenado"
            salida.append(r)
            continue
        candidatos = por_credito.get(f.get("credito") or "", [])
        if candidatos:
            iguales = [e for e in candidatos if comparar_nombres(f.get("nombre"), _nombre_exp(e)) != "distinto"]
            elegidos = iguales or candidatos
            if len(elegidos) > 1:
                r["cotejo"] = "varios"
                r["opciones"] = [info(e) for e in elegidos]
            else:
                e = elegidos[0]
                r["exp"] = info(e)
                r["cotejo"] = "coincide" if comparar_nombres(f.get("nombre"), _nombre_exp(e)) == "igual" else "revisar_nombre"
        else:
            clave = " ".join(_palabras(f.get("nombre")))
            mismos = por_nombre.get(clave, [])
            if not mismos:
                mismos = [e for e in exps if comparar_nombres(f.get("nombre"), _nombre_exp(e)) == "parecido"][:5]
            if len(mismos) > 1:
                r["cotejo"] = "varios"
                r["opciones"] = [info(e) for e in mismos]
            elif mismos:
                r["exp"] = info(mismos[0])
                r["cotejo"] = "solo_nombre"
            else:
                r["cotejo"] = "no_encontrado"
        if r.get("exp"):
            actuales = r["exp"]["actuales"]
            nuevos = _datos_de_fila(f)
            if actuales and all(str(actuales.get(k) or "") == str(v) for k, v in nuevos.items()) and len(actuales) >= len(nuevos):
                r["cotejo"] = "ya_lleno"
            elif actuales and r["cotejo"] == "coincide":
                r["cotejo"] = "distinto"
        salida.append(r)
    return salida


def _resumen(x: models.ExcelComplementario) -> Dict[str, Any]:
    filas = x.filas or []
    llenados = sum(1 for f in filas if f.get("estado") == "llenado")
    return {"id": str(x.id), "nombre": x.nombre, "hoja": x.hoja, "subido_por": x.subido_por,
            "creado_en": x.creado_en.isoformat() if x.creado_en else None,
            "total": len(filas), "llenados": llenados, "pendientes": len(filas) - llenados,
            "completo": bool(filas) and llenados == len(filas)}


@router.post("/analizar")
async def analizar(file: UploadFile = File(...), db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    if compartir.es_revisor(usuario):
        raise HTTPException(status_code=403, detail="Los revisores no pueden cargar datos complementarios.")
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(contenido) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El Excel es demasiado grande (máximo 15 MB).")
    huella = hashlib.sha256(contenido).hexdigest()
    X = models.ExcelComplementario
    previo = db.query(X).filter(X.huella == huella).first()
    ya_usado = previo is not None
    if not previo:
        leido = leer_excel(contenido)
        if not leido["filas"]:
            raise HTTPException(status_code=400, detail="El Excel no trae renglones con datos.")
        previo = X(nombre=(file.filename or "Excel")[:200], huella=huella, hoja=leido["hoja"], subido_por=usuario["username"], filas=leido["filas"])
        db.add(previo)
        db.commit()
        db.refresh(previo)
        kpis.registrar(usuario["username"], "complementarios_excel", None, None, archivo=previo.nombre, renglones=len(leido["filas"]))
        faltan = leido["faltan_columnas"]
    else:
        faltan = []
    return {"excel": _resumen(previo), "ya_usado": ya_usado, "faltan_columnas": faltan,
            "filas": cotejar(db, usuario, previo.filas or [])}


@router.get("")
def lista(db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    X = models.ExcelComplementario
    return {"excels": [_resumen(x) for x in db.query(X).order_by(X.creado_en.desc()).limit(30).all()]}


def _obtener(db: Session, excel_id: str) -> models.ExcelComplementario:
    import uuid as _uuid
    try:
        uid = _uuid.UUID(str(excel_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Excel no válido.")
    x = db.query(models.ExcelComplementario).filter(models.ExcelComplementario.id == uid).first()
    if not x:
        raise HTTPException(status_code=404, detail="Ese Excel ya no está en el sistema.")
    return x


@router.get("/{excel_id}")
def abrir(excel_id: str, db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    x = _obtener(db, excel_id)
    return {"excel": _resumen(x), "ya_usado": True, "faltan_columnas": [], "filas": cotejar(db, usuario, x.filas or [])}


def llenar_expediente(db: Session, expediente, datos: Dict[str, str], usuario: str, origen: str) -> Dict[str, Any]:
    """Guarda los datos complementarios en el expediente y vuelve a generar su Word (con la plantilla actual). No cambia su estado."""
    from main import regenerar_word_expediente, diferencias  # aquí para no importar main al cargar
    anteriores = dict(expediente.datos_extraidos or {})
    plantilla = anteriores.get("plantilla_seleccionada") or anteriores.get("plantilla") or "plantilla_manera2.docx"
    regenerar_word_expediente(expediente, {"datos": dict(datos), "plantilla": plantilla, "plantilla_actual": True}, db)
    cambios = diferencias(anteriores, expediente.datos_extraidos or {})
    kpis.registrar(usuario, "complementarios", expediente.id, expediente.numero_credito, origen=origen, cambios=cambios, plantilla=plantilla)
    return cambios


@router.post("/{excel_id}/llenar")
def llenar(excel_id: str, payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    """payload: {"filas": [{"n": 2, "expediente_id": "..."}]}"""
    if compartir.es_revisor(usuario):
        raise HTTPException(status_code=403, detail="Los revisores no pueden cargar datos complementarios.")
    from main import obtener_expediente_autorizado
    x = _obtener(db, excel_id)
    filas = list(x.filas or [])
    por_n = {f.get("n"): i for i, f in enumerate(filas)}
    hechos, errores = [], []
    for pedido in (payload.get("filas") or [])[:_MAX_FILAS]:
        i = por_n.get(pedido.get("n"))
        if i is None:
            continue
        f = filas[i]
        try:
            exp = obtener_expediente_autorizado(db, pedido.get("expediente_id"), usuario)
            llenar_expediente(db, exp, _datos_de_fila(f), usuario["username"], origen=f"Excel {x.nombre} (renglón {f.get('n')})")
            filas[i] = {**f, "estado": "llenado", "expediente_id": str(exp.id), "llenado_por": usuario["username"],
                        "llenado_en": datetime.now(timezone.utc).isoformat()}
            hechos.append({"n": f.get("n"), "expediente_id": str(exp.id)})
        except Exception as e:
            db.rollback()
            errores.append({"n": f.get("n"), "error": getattr(e, "detail", None) or str(e)})
    x = _obtener(db, excel_id)
    x.filas = filas
    flag_modified(x, "filas")
    db.commit()
    return {"llenados": hechos, "errores": errores, "excel": _resumen(x), "filas": cotejar(db, usuario, x.filas or [])}


def pendiente_para(db: Session, numero_credito: Any, nombre: Any) -> Optional[Dict[str, Any]]:
    """
    Para un expediente que se acaba de guardar: si en algún Excel hay un renglón pendiente con su crédito
    (y su nombre coincide o se parece), regresa {excel, n, datos}.
    """
    cr = _credito(numero_credito)
    if not cr:
        return None
    X = models.ExcelComplementario
    for x in db.query(X).order_by(X.creado_en.desc()).limit(50).all():
        for f in x.filas or []:
            if f.get("estado") != "llenado" and f.get("credito") == cr and comparar_nombres(f.get("nombre"), nombre) != "distinto":
                return {"excel": x, "n": f.get("n"), "datos": _datos_de_fila(f)}
    return None


def marcar_llenado(db: Session, excel, n: Any, expediente_id: Any, usuario: str):
    filas = list(excel.filas or [])
    for i, f in enumerate(filas):
        if f.get("n") == n:
            filas[i] = {**f, "estado": "llenado", "expediente_id": str(expediente_id), "llenado_por": usuario,
                        "llenado_en": datetime.now(timezone.utc).isoformat()}
    excel.filas = filas
    flag_modified(excel, "filas")
