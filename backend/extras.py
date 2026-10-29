"""
- Comentarios de cada expediente (entre quien lo hizo y quien lo revisa), con aviso en la campana y en tiempo real.
- Posibles duplicados: el mismo folio real o la misma escritura en otro expediente.
- Panel de inicio del administrador: cifras del día, de la semana y por persona.
"""
import re
import unicodedata
from datetime import datetime, time, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

import compartir
import models
import notificaciones
import tiempo_real
from auth import _a_utc, require_admin, require_user
from database import get_db

router = APIRouter(prefix="/api", tags=["extras"])
ZONA = ZoneInfo("America/Mexico_City")
MAX_COMENTARIO = 1500
_VACIOS = {"", "NO_ENCONTRADO", "N/A", "NULL", "NONE", "UNDEFINED", "NO CONSTA"}


def _expediente(db: Session, expediente_id: str, usuario: dict):
    import main
    return main.obtener_expediente_autorizado(db, expediente_id, usuario)


def _vacio(v: Any) -> bool:
    return str(v or "").strip().upper() in _VACIOS


def _sin_acentos(t: str) -> str:
    t = unicodedata.normalize("NFD", str(t or ""))
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def _iso(dt) -> Optional[str]:
    return _a_utc(dt).isoformat() if dt else None


# ---------------- Comentarios ----------------
def _participantes(db: Session, exp) -> List[str]:
    """Quienes ven el expediente: su dueño y las personas con acceso."""
    gente = {exp.usuario_propietario}
    gente.update(a["usuario"] for a in compartir.accesos_de_expediente(db, exp))
    return [g for g in gente if g]


def conteo_comentarios(db: Session, ids: List[str]) -> Dict[str, int]:
    if not ids:
        return {}
    C = models.Comentario
    filas = db.query(C.expediente_id, func.count(C.id)).filter(C.expediente_id.in_([str(i) for i in ids])).group_by(C.expediente_id).all()
    return {e: int(n) for e, n in filas}


def _json_comentario(c, nombres: Dict[str, str], fotos: Dict[str, str], yo: str) -> Dict[str, Any]:
    return {"id": c.id, "usuario": c.username, "nombre": nombres.get(c.username, c.username), "foto": fotos.get(c.username, ""),
            "texto": c.texto, "creado_en": _iso(c.creado_en), "mio": c.username == yo}


@router.get("/expedientes/{expediente_id}/comentarios")
def ver_comentarios(expediente_id: str, db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    exp = _expediente(db, expediente_id, sesion)
    C = models.Comentario
    filas = db.query(C).filter(C.expediente_id == str(exp.id)).order_by(C.creado_en.asc()).all()
    usuarios = {u.username: u for u in db.query(models.Usuario).all()}
    nombres = {u: (x.nombre_mostrar or u) for u, x in usuarios.items()}
    fotos = {u: (x.foto or "") for u, x in usuarios.items()}
    return {"comentarios": [_json_comentario(c, nombres, fotos, sesion["username"]) for c in filas],
            "participantes": [{"usuario": p, "nombre": nombres.get(p, p)} for p in sorted(_participantes(db, exp))]}


@router.post("/expedientes/{expediente_id}/comentarios")
def comentar(expediente_id: str, payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    exp = _expediente(db, expediente_id, sesion)
    texto = re.sub(r"\n{3,}", "\n\n", str(payload.get("texto") or "").replace("\r\n", "\n")).strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Escribe el comentario.")
    texto = texto[:MAX_COMENTARIO]
    yo = sesion["username"]
    c = models.Comentario(expediente_id=str(exp.id), username=yo, texto=texto)
    db.add(c)
    quien = sesion.get("nombre_mostrar") or yo
    acreditado = str((exp.datos_extraidos or {}).get("nombre_acreditado") or "").strip()
    resumen = texto if len(texto) <= 120 else texto[:117] + "…"
    for p in _participantes(db, exp):
        tiempo_real.avisar_al_guardar(db, p, "comentarios", {"expediente_id": str(exp.id)})
        if p != yo:
            notificaciones.notificar(db, p, "comentario", f"{quien} comentó en {acreditado or 'un expediente'}",
                                     f"«{resumen}» · crédito {exp.numero_credito}",
                                     {"de": yo, "de_nombre": quien, "expediente_id": str(exp.id),
                                      "propietario": exp.usuario_propietario, "credito": exp.numero_credito})
    import kpis
    kpis.registrar(yo, "comentario", exp.id, exp.numero_credito, texto=resumen)
    db.commit()
    return ver_comentarios(expediente_id, db, sesion)


@router.delete("/comentarios/{comentario_id}")
def borrar_comentario(comentario_id: str, db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    C = models.Comentario
    c = db.query(C).filter(C.id == comentario_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    exp = _expediente(db, c.expediente_id, sesion)
    if c.username != sesion["username"] and not sesion.get("es_admin"):
        raise HTTPException(status_code=403, detail="Solo puedes borrar tus comentarios.")
    db.delete(c)
    for p in _participantes(db, exp):
        tiempo_real.avisar_al_guardar(db, p, "comentarios", {"expediente_id": str(exp.id)})
    db.commit()
    return {"ok": True}


# ---------------- Posibles duplicados ----------------
def _numero_folio(v: Any) -> Optional[str]:
    """«"321240" (TRESCIENTOS…)» o «321240» -> «321240»."""
    m = re.search(r"\d{3,}", str(v or ""))
    return str(int(m.group(0))) if m else None


def _numero_escritura(v: Any) -> Optional[str]:
    t = str(v or "").strip()
    if _vacio(t):
        return None
    m = re.search(r"\d+", t)
    if m:
        return str(int(m.group(0)))
    import main
    n = main.palabras_a_numero(t)
    return str(n) if n else None


@router.post("/expedientes/coincidencias")
def coincidencias(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db), sesion: dict = Depends(require_user)):
    """
    {datos, excluir} -> otros expedientes con el mismo folio real, o con la misma escritura
    (mismo número y, además, misma fecha o mismo notario). Solo es un aviso: puede ser correcto.
    """
    import main
    datos = payload.get("datos") or {}
    excluir = str(payload.get("excluir") or "")
    credito = re.sub(r"\D", "", str(datos.get("numero_credito") or ""))
    E = models.Expediente
    folio = _numero_folio(datos.get("folio_real"))
    esc = _numero_escritura(datos.get("numero_escritura"))
    fecha = _sin_acentos(datos.get("fecha_escritura")).strip()
    notario = _sin_acentos(datos.get("notario_origen_completo")).strip()
    resultado = {"folio": [], "escritura": []}
    if not folio and not esc:
        return resultado
    nombres = {u.username: (u.nombre_mostrar or u.username) for u in db.query(models.Usuario).all()}

    def fila(e) -> Dict[str, Any]:
        d = e.datos_extraidos or {}
        return {"expediente_id": str(e.id), "numero_credito": e.numero_credito, "acreditado": str(d.get("nombre_acreditado") or ""),
                "usuario": e.usuario_propietario, "nombre_usuario": nombres.get(e.usuario_propietario, e.usuario_propietario),
                "estado": main.estado_de(e), "fecha": _iso(e.fecha_creacion)}

    def otro(e) -> bool:
        return str(e.id) != excluir and (not credito or re.sub(r"\D", "", e.numero_credito or "") != credito)

    if folio:
        patron = rf"(^|[^0-9])0*{folio}([^0-9]|$)"
        q = db.query(E).filter(E.datos_extraidos.op("->>")("folio_real").op("~")(patron)).limit(30)
        resultado["folio"] = [fila(e) for e in q.all() if otro(e)][:10]
    if esc:
        candidatos = db.query(E).filter(func.coalesce(E.datos_extraidos.op("->>")("numero_escritura"), "") != "").all()
        for e in candidatos:
            d = e.datos_extraidos or {}
            if not otro(e) or _numero_escritura(d.get("numero_escritura")) != esc:
                continue
            misma_fecha = fecha and _sin_acentos(d.get("fecha_escritura")).strip() == fecha
            mismo_notario = notario and _sin_acentos(d.get("notario_origen_completo")).strip() == notario
            if misma_fecha or mismo_notario:
                resultado["escritura"].append(fila(e))
            if len(resultado["escritura"]) >= 10:
                break
    return resultado


# ---------------- Panel de inicio del administrador ----------------
def _incidencia(d: Dict[str, Any]) -> bool:
    return _vacio(d.get("notario_origen_completo")) or (_vacio(d.get("numero_escritura")) and _vacio(d.get("fecha_escritura")))


@router.get("/admin/panel")
def panel_admin(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    import main
    E = models.Expediente
    hoy = datetime.now(ZONA).date()
    inicio_dia = datetime.combine(hoy, time.min, tzinfo=ZONA)
    inicio_semana = inicio_dia - timedelta(days=hoy.weekday())
    inicio_mes = datetime.combine(hoy.replace(day=1), time.min, tzinfo=ZONA)
    desde14 = inicio_dia - timedelta(days=13)
    usuarios = {u.username: u for u in db.query(models.Usuario).all()}

    totales = {"hoy": 0, "semana": 0, "mes": 0, "total": 0, "GENERADO": 0, "REVISADO": 0, "ENTREGADO": 0, "incidencias": 0}
    por_dia: Dict[str, int] = {}
    personas: Dict[str, Dict[str, Any]] = {}
    for e in db.query(E).all():
        d = e.datos_extraidos or {}
        estado = main.estado_de(e)
        creado = _a_utc(e.fecha_creacion).astimezone(ZONA) if e.fecha_creacion else None
        inc = _incidencia(d)
        totales["total"] += 1
        totales[estado] += 1
        totales["incidencias"] += 1 if inc else 0
        p = personas.setdefault(e.usuario_propietario, {"usuario": e.usuario_propietario, "total": 0, "hoy": 0, "semana": 0,
                                                         "GENERADO": 0, "REVISADO": 0, "ENTREGADO": 0, "incidencias": 0, "ultimo": None})
        p["total"] += 1
        p[estado] += 1
        p["incidencias"] += 1 if inc else 0
        if creado:
            if creado >= inicio_dia:
                totales["hoy"] += 1
                p["hoy"] += 1
            if creado >= inicio_semana:
                totales["semana"] += 1
                p["semana"] += 1
            if creado >= inicio_mes:
                totales["mes"] += 1
            if creado >= desde14:
                k = creado.date().isoformat()
                por_dia[k] = por_dia.get(k, 0) + 1
            if not p["ultimo"] or creado.isoformat() > p["ultimo"]:
                p["ultimo"] = creado.isoformat()
    for u, p in personas.items():
        x = usuarios.get(u)
        p["nombre"] = (x.nombre_mostrar or u) if x else u
        p["foto"] = (x.foto or "") if x else ""
        p["rol"] = compartir.rol_de(x) if x else ""
        p["activo"] = bool(getattr(x, "activo", True)) if x else False
        p["pendientes"] = p["GENERADO"] + p["REVISADO"]
    dias = [{"fecha": (desde14 + timedelta(days=i)).date().isoformat(), "total": por_dia.get((desde14 + timedelta(days=i)).date().isoformat(), 0)} for i in range(14)]
    # Sesiones abiertas ahora (personas conectadas)
    S = models.Sesion
    conectados = sorted({s.username for s in db.query(S).all() if _a_utc(s.expira_en) > datetime.now(ZONA)})
    return {
        "totales": totales,
        "ultimos_14_dias": dias,
        "personas": sorted(personas.values(), key=lambda p: (-p["pendientes"], -p["total"])),
        "conectados": [{"usuario": u, "nombre": (usuarios[u].nombre_mostrar or u) if u in usuarios else u} for u in conectados],
        "generado_en": datetime.now(ZONA).isoformat(),
    }
