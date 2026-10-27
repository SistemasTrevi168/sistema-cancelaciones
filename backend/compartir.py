"""
Compartir expedientes: la persona que los hace (proyectista) da acceso a otras para que los revisen,
editen, cambien su estado y descarguen el Word. El expediente sigue siendo de quien lo hizo.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

import kpis
import models
import notificaciones
from auth import require_user
from database import get_db

router = APIRouter(prefix="/api/compartir", tags=["compartir"])

ROLES = ("operador", "revisor")
# A quién se le puede compartir: operadores, revisores y también administradores
# (el admin puede abrir cualquier expediente, pero así le aparecen en «Compartidos conmigo»)
DESTINOS = ROLES + ("admin",)


def es_admin(usuario: dict) -> bool:
    return bool(usuario and usuario.get("es_admin"))


def es_revisor(usuario: dict) -> bool:
    return bool(usuario) and not es_admin(usuario) and usuario.get("role") == "revisor"


def rol_de(user) -> str:
    """admin / operador / revisor"""
    if getattr(user, "es_admin", False):
        return "admin"
    rol = (getattr(user, "rol", None) or "").strip().lower()
    return rol if rol in ROLES else "operador"


def filtro_compartidos_con(db: Session, username: str):
    """Condición SQL: expedientes a los que `username` tiene acceso por compartido."""
    C, E = models.Compartido, models.Expediente
    filas = db.query(C).filter(C.con_usuario == username).all()
    ids = [c.expediente_id for c in filas if c.expediente_id and not c.todos]
    duenos = [c.propietario for c in filas if c.todos]
    condiciones = []
    if ids:
        import uuid as _uuid
        validos = []
        for i in ids:
            try:
                validos.append(_uuid.UUID(str(i)))
            except ValueError:
                pass
        if validos:
            condiciones.append(E.id.in_(validos))
    if duenos:
        condiciones.append(E.usuario_propietario.in_(duenos))
    return or_(*condiciones) if condiciones else None


def tiene_acceso(db: Session, expediente, usuario: dict) -> bool:
    """Dueño, administrador o alguien a quien se le compartió."""
    if not usuario or not expediente:
        return False
    if es_admin(usuario) or expediente.usuario_propietario == usuario.get("username"):
        return True
    C = models.Compartido
    return db.query(C.id).filter(
        C.con_usuario == usuario.get("username"),
        C.propietario == expediente.usuario_propietario,
        or_(C.todos.is_(True), C.expediente_id == str(expediente.id)),
    ).first() is not None


def accesos_de_expediente(db: Session, expediente) -> List[Dict[str, Any]]:
    """Quién tiene acceso a un expediente (directo o por «todos»)."""
    C = models.Compartido
    filas = db.query(C).filter(C.propietario == expediente.usuario_propietario,
                               or_(C.todos.is_(True), C.expediente_id == str(expediente.id))).all()
    salida: Dict[str, Dict[str, Any]] = {}
    for c in filas:
        a = salida.setdefault(c.con_usuario, {"usuario": c.con_usuario, "directo": False, "todos": False})
        if c.todos:
            a["todos"] = True
        else:
            a["directo"] = True
    return list(salida.values())


def _nombres(db: Session) -> Dict[str, str]:
    return {u.username: (u.nombre_mostrar or u.username) for u in db.query(models.Usuario).all()}


def _mis_expedientes(db: Session, ids: List[str], usuario: dict):
    """Expedientes indicados que esta persona puede compartir (los suyos; el admin, cualquiera)."""
    import uuid as _uuid
    validos = []
    for i in ids or []:
        try:
            validos.append(_uuid.UUID(str(i)))
        except ValueError:
            pass
    if not validos:
        return []
    q = db.query(models.Expediente).filter(models.Expediente.id.in_(validos))
    if not es_admin(usuario):
        q = q.filter(models.Expediente.usuario_propietario == usuario["username"])
    return q.all()


def _destinatarios(db: Session, usernames: List[str], yo: str) -> List[str]:
    """Se comparte con usuarios activos (operadores, revisores o administradores)."""
    validos = {u.username for u in db.query(models.Usuario).filter(models.Usuario.activo.is_(True)).all() if rol_de(u) in DESTINOS}
    return [u for u in dict.fromkeys(usernames or []) if u in validos and u != yo]


# ---------------- ENDPOINTS ----------------

@router.get("/directorio")
def directorio(db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    """Personas a las que se les puede compartir: operadores, revisores y administradores activos."""
    if es_revisor(usuario):
        raise HTTPException(status_code=403, detail="Tu usuario es de revisión: no puede compartir expedientes.")
    gente = db.query(models.Usuario).filter(models.Usuario.activo.is_(True), models.Usuario.username != usuario["username"]).all()
    lista = [{"usuario": u.username, "nombre": u.nombre_mostrar or u.username, "rol": rol_de(u)} for u in gente if rol_de(u) in DESTINOS]
    return sorted(lista, key=lambda x: x["nombre"].lower())


@router.get("/expediente/{expediente_id}")
def accesos_expediente(expediente_id: str, db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    exps = _mis_expedientes(db, [expediente_id], usuario)
    if not exps:
        raise HTTPException(status_code=404, detail="Expediente no encontrado")
    nombres = _nombres(db)
    return [{**a, "nombre": nombres.get(a["usuario"], a["usuario"])} for a in accesos_de_expediente(db, exps[0])]


@router.get("/todos")
def accesos_a_todo(propietario: Optional[str] = None, db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    """Personas que tienen acceso a TODOS mis expedientes."""
    dueno = propietario if (propietario and es_admin(usuario)) else usuario["username"]
    C = models.Compartido
    nombres = _nombres(db)
    filas = db.query(C).filter(C.propietario == dueno, C.todos.is_(True)).all()
    return [{"usuario": c.con_usuario, "nombre": nombres.get(c.con_usuario, c.con_usuario)} for c in filas]


@router.post("")
def compartir(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    """
    {ids: [...], usuarios: [...]}  -> comparte esos expedientes
    {todos: true, usuarios: [...]} -> comparte todos mis expedientes (también los futuros)
    """
    if es_revisor(usuario):
        raise HTTPException(status_code=403, detail="Tu usuario es de revisión: no puede compartir expedientes.")
    yo = usuario["username"]
    para = _destinatarios(db, payload.get("usuarios") or [], yo)
    if not para:
        raise HTTPException(status_code=400, detail="Elige al menos a una persona para compartir.")
    C = models.Compartido
    nuevos = 0
    nombres = _nombres(db)
    quien = nombres.get(yo, yo)
    if payload.get("todos"):
        for u in para:
            if not db.query(C.id).filter(C.propietario == yo, C.con_usuario == u, C.todos.is_(True)).first():
                db.add(C(propietario=yo, con_usuario=u, todos=True, creado_por=yo))
                nuevos += 1
                notificaciones.notificar(db, u, "compartir_todo", f"{quien} te dio acceso a todos sus expedientes",
                                         "También verás los que haga después. Están en «Compartidos conmigo».", {"de": yo, "de_nombre": quien})
        db.commit()
        kpis.registrar(yo, "compartir_todo", con=para)
        return {"status": "exito", "nuevos": nuevos}

    exps = _mis_expedientes(db, payload.get("ids") or [], usuario)
    if not exps:
        raise HTTPException(status_code=400, detail="No hay expedientes tuyos para compartir en la selección.")
    por_persona: Dict[str, list] = {}
    for e in exps:
        agregados = []
        for u in para:
            if u == e.usuario_propietario:
                continue
            if not db.query(C.id).filter(C.expediente_id == str(e.id), C.con_usuario == u).first():
                db.add(C(propietario=e.usuario_propietario, con_usuario=u, expediente_id=str(e.id), todos=False, creado_por=yo))
                agregados.append(u)
                por_persona.setdefault(u, []).append(e)
                nuevos += 1
        if agregados:
            db.add(models.Actividad(username=yo, tipo="compartir", expediente_id=str(e.id), numero_credito=e.numero_credito,
                                    detalle={"con": agregados}))
    # Aviso a cada persona: un solo aviso por vez que se comparte (aunque sean varios expedientes)
    for u, lista in por_persona.items():
        acreditados = [str((e.datos_extraidos or {}).get("nombre_acreditado") or e.numero_credito or "").strip() for e in lista]
        acreditados = [a for a in acreditados if a]
        if len(lista) == 1:
            titulo = f"{quien} te compartió un expediente"
            mensaje = f"{acreditados[0] if acreditados else 'Expediente'} · crédito {lista[0].numero_credito}"
        else:
            titulo = f"{quien} te compartió {len(lista)} expedientes"
            mensaje = ", ".join(acreditados[:3]) + (f" y {len(lista) - 3} más" if len(lista) > 3 else "")
        notificaciones.notificar(db, u, "compartir", titulo, mensaje,
                                 {"de": yo, "de_nombre": quien, "ids": [str(e.id) for e in lista][:200],
                                  "creditos": [e.numero_credito for e in lista][:200]})
    db.commit()
    return {"status": "exito", "expedientes": len(exps), "nuevos": nuevos}


@router.post("/quitar")
def quitar(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db), usuario: dict = Depends(require_user)):
    """
    {ids: [...], usuarios: [...]}  -> quita el acceso directo a esos expedientes
    {todos: true, usuarios: [...]} -> quita el acceso a todos mis expedientes
    """
    if es_revisor(usuario):
        raise HTTPException(status_code=403, detail="Tu usuario es de revisión: no puede compartir expedientes.")
    yo = usuario["username"]
    usuarios = list(dict.fromkeys(payload.get("usuarios") or []))
    if not usuarios:
        raise HTTPException(status_code=400, detail="Elige al menos a una persona.")
    C = models.Compartido
    quitados = 0
    if payload.get("todos"):
        dueno = payload.get("propietario") if (payload.get("propietario") and es_admin(usuario)) else yo
        quitados = db.query(C).filter(C.propietario == dueno, C.todos.is_(True), C.con_usuario.in_(usuarios)).delete(synchronize_session=False)
        db.commit()
        kpis.registrar(yo, "quitar_acceso_todo", con=usuarios)
        return {"status": "exito", "quitados": quitados}
    exps = _mis_expedientes(db, payload.get("ids") or [], usuario)
    for e in exps:
        n = db.query(C).filter(C.expediente_id == str(e.id), C.con_usuario.in_(usuarios)).delete(synchronize_session=False)
        if n:
            quitados += n
            db.add(models.Actividad(username=yo, tipo="quitar_acceso", expediente_id=str(e.id), numero_credito=e.numero_credito,
                                    detalle={"con": usuarios}))
    db.commit()
    return {"status": "exito", "quitados": quitados}


def resumen_por_expediente(db: Session, expedientes) -> Dict[str, List[str]]:
    """{expediente_id: [usuarios con acceso]} para la lista de Mi Historial."""
    if not expedientes:
        return {}
    C = models.Compartido
    duenos = {e.usuario_propietario for e in expedientes}
    filas = db.query(C).filter(C.propietario.in_(duenos)).all()
    todos_de: Dict[str, List[str]] = {}
    directo: Dict[str, List[str]] = {}
    for c in filas:
        if c.todos:
            todos_de.setdefault(c.propietario, []).append(c.con_usuario)
        elif c.expediente_id:
            directo.setdefault(c.expediente_id, []).append(c.con_usuario)
    salida = {}
    for e in expedientes:
        gente = list(dict.fromkeys(directo.get(str(e.id), []) + todos_de.get(e.usuario_propietario, [])))
        if gente:
            salida[str(e.id)] = gente
    return salida
