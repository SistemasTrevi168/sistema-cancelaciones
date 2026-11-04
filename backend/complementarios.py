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
import os
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


# ---------------------------------------------------------------------------------------------
# Word hechos fuera del sistema: se suben, se identifica a quién pertenecen (por el número de
# crédito que trae el documento y se comprueba con el nombre) y se llenan sus espacios en blanco
# con los datos de su renglón del Excel. Se regresan en un ZIP.
# ---------------------------------------------------------------------------------------------
_BLANCO = r"(?:[ \t _…]|\.{3,})+"


def _reemplazar_en_parrafo(par, a, b, nuevo):
    """Cambia el texto [a, b) del párrafo (puede abarcar varios runs) conservando el formato del primero."""
    runs = par.runs
    if a == b:
        if not nuevo:
            return
        pos = 0
        for r in runs:
            if pos <= a <= pos + len(r.text) and r.text:
                r.text = r.text[:a - pos] + nuevo + r.text[a - pos:]
                return
            pos += len(r.text)
        return
    pos = 0
    primero = None
    for r in runs:
        t = r.text
        ini, fin = pos, pos + len(t)
        pos = fin
        if fin <= a or ini >= b:
            continue
        ca, cb = max(a, ini) - ini, min(b, fin) - ini
        if primero is None:
            primero = r
            r.text = t[:ca] + nuevo + t[cb:]
        else:
            r.text = t[:ca] + t[cb:]


def _aplicar(par, patron, grupos) -> bool:
    m = re.search(patron, par.text)
    if not m:
        return False
    for g in sorted(grupos, key=lambda g: -m.start(g)):
        _reemplazar_en_parrafo(par, m.start(g), m.end(g), grupos[g])
    return True


def _tiene_tab_con_guiones(par) -> bool:
    from docx.oxml.ns import qn
    ppr = par._p.pPr
    tabs = ppr.find(qn("w:tabs")) if ppr is not None else None
    return tabs is not None and any(t.get(qn("w:leader")) not in (None, "none") and t.get(qn("w:val")) == "right" for t in tabs)


def llenar_word(contenido: bytes, ctx: Dict[str, str]) -> (bytes, List[str]):
    """Llena en un Word los espacios en blanco de escritura, volumen, expediente y fecha. Regresa (docx, lugares_llenados)."""
    import docx
    from docx.oxml.ns import qn
    d = docx.Document(io.BytesIO(contenido))
    hechos: List[str] = []
    B = _BLANCO
    if ctx.get("escritura_num"):
        for s in d.sections:
            for p in list(s.header.paragraphs) + list(s.first_page_header.paragraphs) + list(s.even_page_header.paragraphs):
                if re.search(r"\d\s*ESP\.", p.text):
                    continue
                if _aplicar(p, r"^(\s*)ESP\.", {1: ctx["escritura_num"] + " "}):
                    if "encabezado" not in hechos:
                        hechos.append("encabezado")
    for p in d.paragraphs:
        t = p.text
        if ctx.get("escritura_letras") and re.search(r"INSTRUMENTO\s+NÚMERO" + B + r"\.", t):
            if _aplicar(p, r"INSTRUMENTO\s+NÚMERO(" + B + r")\.", {1: " " + ctx["escritura_letras"]}):
                hechos.append("instrumento")
                if _tiene_tab_con_guiones(p):
                    _aplicar(p, re.escape(ctx["escritura_letras"]) + r"\.(\s*-+\s*)$", {1: "\t"})
        elif re.search(r"VOLUMEN\s+NÚMERO", t) and ("PE" in t):
            grupos, patron = {}, r"VOLUMEN\s+NÚMERO(" + B + r")?\.(\s*-+|\s*\t\s*)?(PE-?)(" + B + r")?-(\s*)20"
            m = re.search(patron, t)
            if not m:
                continue
            if ctx.get("volumen_letras") and m.group(1) is not None:
                grupos[1] = " " + ctx["volumen_letras"]
            if ctx.get("expediente_num"):
                grupos[3] = "PE-"
                grupos[4] = ctx["expediente_num"]
            if m.group(4) is None and ctx.get("expediente_num"):
                # «PE--2026» sin espacios: se mete el número entre los guiones
                grupos.pop(4, None)
                grupos[3] = "PE-" + ctx["expediente_num"]
            con_tab = bool(_tiene_tab_con_guiones(p) and m.group(2) and "-" in m.group(2))
            if con_tab:
                grupos[2] = "\t"
            grupos = {g: v for g, v in grupos.items() if m.group(g) is not None}
            if grupos and _aplicar(p, patron, grupos):
                if 1 in grupos:
                    hechos.append("volumen")
                if 3 in grupos:
                    hechos.append("PE")
                if con_tab:
                    _aplicar(p, r"PE-.*?(\t\s*)$", {1: " "})
                    tabs = p._p.pPr.find(qn("w:tabs")) if p._p.pPr is not None else None
                    if tabs is not None:
                        for tab in list(tabs):
                            if tab.get(qn("w:leader")) in (None, "none") and tab.get(qn("w:val")) in ("left", "center"):
                                tabs.remove(tab)
        elif ctx.get("fecha_dia") and re.search(r"a los" + B + r"días del mes de" + B + r"del año", t):
            if _aplicar(p, r"a los(" + B + r")días del mes de(" + B + r")del año", {1: f" {ctx['fecha_dia']} ", 2: f" {ctx['fecha_mes']} "}):
                hechos.append("fecha")
        elif ctx.get("expediente_num") and re.match(r"^\s*EXP\." + B + r"-\s*20", t):
            if _aplicar(p, r"^\s*EXP\.(" + B + r")-(\s*)20", {1: " " + ctx["expediente_num"], 2: ""}):
                hechos.append("EXP.")
    salida = io.BytesIO()
    d.save(salida)
    return salida.getvalue(), hechos


def _texto_word(contenido: bytes) -> str:
    import docx
    d = docx.Document(io.BytesIO(contenido))
    partes = [p.text for p in d.paragraphs]
    for t in d.tables:
        for fila in t.rows:
            for celda in fila.cells:
                partes.append(celda.text)
    return "\n".join(partes)


def _renglon_de_word(texto: str, filas: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """El renglón del Excel al que pertenece un Word: por un número de crédito que aparezca en el texto, y si no, por el nombre."""
    creditos = {_credito(c) for c in re.findall(r"\b\d{8,11}\b", texto)}
    por_credito = [f for f in filas if f.get("credito") and f["credito"] in creditos]
    if por_credito:
        return {"fila": por_credito[0], "por": "credito", "nombre_ok": set(_palabras(por_credito[0].get("nombre"))) <= set(_plano(texto).split())}
    palabras = set(_plano(texto).split())
    por_nombre = [f for f in filas if f.get("nombre") and set(_palabras(f["nombre"])) <= palabras]
    if len(por_nombre) == 1:
        return {"fila": por_nombre[0], "por": "nombre", "nombre_ok": True}
    return None


_ZIPS: Dict[str, Dict[str, Any]] = {}


@router.post("/{excel_id}/words")
async def llenar_words(excel_id: str, files: List[UploadFile] = File(...), db: Session = Depends(get_db),
                       usuario: dict = Depends(require_user)):
    """Llena los Word que se hicieron fuera del sistema con los datos de su renglón del Excel. Regresa el resumen y un ZIP."""
    import uuid as _uuid
    import zipfile
    if compartir.es_revisor(usuario):
        raise HTTPException(status_code=403, detail="Los revisores no pueden cargar datos complementarios.")
    x = _obtener(db, excel_id)
    filas = list(x.filas or [])
    con_exp = {f.get("n"): f for f in cotejar(db, usuario, filas)}
    resultados = []
    buf = io.BytesIO()
    usados = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for archivo in files[:300]:
            nombre = os.path.basename((archivo.filename or "documento.docx").replace("\\", "/"))
            res: Dict[str, Any] = {"archivo": nombre}
            contenido = await archivo.read()
            if not nombre.lower().endswith(".docx") or not contenido:
                res.update(estado="error", detalle="No es un Word (.docx).")
                resultados.append(res)
                continue
            try:
                texto = _texto_word(contenido)
            except Exception:
                res.update(estado="error", detalle="No se pudo abrir el Word.")
                resultados.append(res)
                continue
            r = _renglon_de_word(texto, filas)
            if not r:
                res.update(estado="sin_renglon", detalle="No encontré en el Excel su número de crédito ni su nombre.")
                resultados.append(res)
                continue
            f = r["fila"]
            ctx = services.contexto_complementario(_datos_de_fila(f))
            ctx = {k: (v if str(v).strip() else "") for k, v in ctx.items()}
            lleno, hechos = llenar_word(contenido, ctx)
            res.update(n=f.get("n"), nombre=f.get("nombre"), credito=f.get("credito"), por=r["por"], nombre_ok=r["nombre_ok"], lugares=hechos)
            if not hechos:
                res.update(estado="sin_espacios", detalle="No encontré los espacios en blanco (¿ya estaba lleno o tiene otro acomodo?).")
                resultados.append(res)
                continue
            base = nombre[:-5]
            salida = f"{base}.docx"
            k = 2
            while salida in usados:
                salida = f"{base} ({k}).docx"
                k += 1
            usados.add(salida)
            z.writestr(salida, lleno)
            en_sistema = con_exp.get(f.get("n"), {}).get("exp")
            res["estado"] = "llenado"
            if en_sistema:
                res["en_sistema"] = True
                res["detalle"] = "Este crédito sí está en el sistema: llénalo también desde la lista para que su Word del sistema quede completo."
            elif f.get("estado") != "llenado":
                for i, ff in enumerate(filas):
                    if ff.get("n") == f.get("n"):
                        filas[i] = {**ff, "estado": "llenado", "word": nombre, "llenado_por": usuario["username"],
                                    "llenado_en": datetime.now(timezone.utc).isoformat()}
            resultados.append(res)
    x.filas = filas
    flag_modified(x, "filas")
    db.commit()
    n_llenos = sum(1 for r in resultados if r["estado"] == "llenado")
    kpis.registrar(usuario["username"], "complementarios_words", None, None, archivo=x.nombre, words=len(resultados), llenados=n_llenos)
    token = None
    if n_llenos:
        token = _uuid.uuid4().hex
        # Se guarda en memoria un rato para descargarlo (se limpian los viejos)
        ahora = datetime.now(timezone.utc)
        for t in [t for t, v in _ZIPS.items() if (ahora - v["en"]).total_seconds() > 3600]:
            _ZIPS.pop(t, None)
        _ZIPS[token] = {"datos": buf.getvalue(), "usuario": usuario["username"], "en": ahora}
    return {"resultados": resultados, "llenados": n_llenos, "zip": token, "excel": _resumen(x), "filas": cotejar(db, usuario, x.filas or [])}


@router.get("/zip/{token}")
def descargar_words(token: str, usuario: dict = Depends(require_user)):
    from fastapi.responses import Response
    z = _ZIPS.get(token)
    if not z or z["usuario"] != usuario["username"]:
        raise HTTPException(status_code=404, detail="Ese ZIP ya no está disponible; vuelve a subir los Word.")
    return Response(z["datos"], media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="Word_llenados.zip"'})
