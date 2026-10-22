"""
Correcciones de datos que se ejecutan UNA sola vez al arrancar el servidor.

reparar_plantillas_v1:
  Antes, al descargar un expediente desde Mi Historial, la pantalla mandaba la plantilla que estuviera
  elegida en ese momento (por defecto CDMX Ap. Crédito Hombre Soltero) y el servidor la guardaba como
  la plantilla del expediente. Aquí se regresa cada expediente a la plantilla con la que se guardó
  (la última decisión registrada: guardar, captura manual, Excel, edición o actualización).
"""
from typing import Any, Dict

import models

TAREA = "reparar_plantillas_v1"
USUARIO_SISTEMA = "sistema"
# Actividades donde una persona eligió la plantilla del expediente
DECISIONES = ("guardar", "manual", "excel", "editar", "actualizar")
# Actividades internas que no cuentan en los reportes
TIPOS_INTERNOS = ("corregir_plantilla", "mantenimiento")


def _limpia(p: Any) -> str:
    return str(p or "").strip().replace(".docx", "")


def ya_se_hizo(db, tarea: str) -> bool:
    A = models.Actividad
    for a in db.query(A).filter(A.tipo == "mantenimiento").all():
        if (a.detalle or {}).get("tarea") == tarea:
            return True
    return False


def reparar_plantillas(db, simular: bool = False) -> Dict[str, Any]:
    """Regresa cada expediente a la plantilla con la que se guardó. Devuelve un resumen."""
    A, E = models.Actividad, models.Expediente
    acts = (db.query(A)
            .filter(A.expediente_id.isnot(None), A.tipo.in_(DECISIONES + ("word",)))
            .order_by(A.creado_en, A.id).all())
    por_exp: Dict[str, list] = {}
    for a in acts:
        por_exp.setdefault(a.expediente_id, []).append(a)

    revisados, corregidos, sin_registro = 0, [], 0
    for exp in db.query(E).all():
        revisados += 1
        lista = por_exp.get(str(exp.id)) or []
        decisiones = [a for a in lista if a.tipo in DECISIONES and _limpia((a.detalle or {}).get("plantilla"))]
        if not decisiones:
            sin_registro += 1
            continue
        ultima = decisiones[-1]
        esperada = _limpia(ultima.detalle.get("plantilla"))
        datos = dict(exp.datos_extraidos or {})
        actual = _limpia(datos.get("plantilla_seleccionada") or datos.get("plantilla"))
        if not esperada or actual == esperada:
            continue

        # La versión de la plantilla con la que se generó con esa plantilla (si se registró)
        version = ultima.detalle.get("version")
        if not version:
            for a in lista:
                d = a.detalle or {}
                if _limpia(d.get("plantilla")) == esperada and d.get("version"):
                    version = d.get("version")
        datos["plantilla_seleccionada"] = esperada
        if version:
            datos["_plantilla_version"] = version
        else:
            datos.pop("_plantilla_version", None)

        corregidos.append({"id": str(exp.id), "credito": exp.numero_credito, "de": actual, "a": esperada})
        if not simular:
            exp.datos_extraidos = datos  # se asigna un dict nuevo para que se guarde el cambio
            db.add(models.Actividad(
                username=USUARIO_SISTEMA, tipo="corregir_plantilla", expediente_id=str(exp.id),
                numero_credito=exp.numero_credito,
                detalle={"de": actual, "a": esperada,
                         "motivo": "Se regresó a la plantilla con la que se guardó el expediente"},
            ))

    resumen = {"tarea": TAREA, "revisados": revisados, "corregidos": len(corregidos),
               "sin_registro": sin_registro, "detalle": corregidos[:200]}
    if not simular:
        db.add(models.Actividad(username=USUARIO_SISTEMA, tipo="mantenimiento",
                                detalle={k: v for k, v in resumen.items() if k != "detalle"}))
        db.commit()
    return resumen


def ejecutar_pendientes(SessionLocal) -> None:
    """Se llama al arrancar. Nunca debe impedir que el servidor arranque."""
    try:
        db = SessionLocal()
        try:
            if ya_se_hizo(db, TAREA):
                return
            r = reparar_plantillas(db)
            print(f"--> {TAREA}: {r['corregidos']} expediente(s) corregidos de {r['revisados']} "
                  f"({r['sin_registro']} sin registro de plantilla)")
            for c in r["detalle"]:
                print(f"    {c['credito']}: {c['de']} -> {c['a']}")
        finally:
            db.close()
    except Exception as e:
        print(f"Aviso: no se pudo ejecutar {TAREA}: {e}")
