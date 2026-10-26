"""
Separa las constancias de folio del IFREM en sus actos (compraventa, hipoteca,
cancelación, anotaciones...) para poder tomar los datos del acto correcto,
sin importar si la constancia trae 2 hojas o más de 20.
"""
import re
import unicodedata

# Secciones de la constancia
SECCIONES = [
    ("gravamenes", re.compile(r"GRAV[AÁ]MENES", re.I)),
    ("propiedad", re.compile(r"INSCRIPCIONES\s+DE\s+PROPIEDAD", re.I)),
    ("anotaciones", re.compile(r"ANOTACIONES\s+PREVENTIVAS", re.I)),
]
NOMBRE_SECCION = {
    "gravamenes": "Gravámenes e hipotecas",
    "propiedad": "Inscripciones de propiedad",
    "anotaciones": "Anotaciones preventivas",
    "otros": "Otros",
}

# Renglones que son encabezados de tabla o pie de página del navegador (se ignoran)
_ENCABEZADOS = {
    "TRÁMITE", "TRAMITE", "VOLANTE", "ENTRADA", "FECHA DE", "INGRESO", "DD/MM/AAAA", "INSCRIPCIÓN",
    "INSCRIPCION", "CLAVE", "ACTO", "ESTADO", "DEL ACTO", "DEL", "ANTECEDENTE", "REGISTRAL",
    "ANTECEDENTE REGISTRAL", "REALES Y LIMITACIONES DE DOMINIO", "GRAVAMENES, HIPOTECAS, DERECHOS",
    "GRAVÁMENES, HIPOTECAS, DERECHOS", "INSCRIPCIONES DE PROPIEDAD", "ANOTACIONES PREVENTIVAS",
}
_PIE = [
    re.compile(r"^\d{1,2}/\d{1,2}/\d{2},\s*\d{1,2}:\d{2}$"),     # 26/8/26, 17:53
    re.compile(r"ifrem\.gob\.mx", re.I),
    re.compile(r"^https?://", re.I),
    re.compile(r"^\d{1,3}/\d{1,3}$"),                           # 1/3
    re.compile(r"Realizar otra b[uú]squeda", re.I),
    # Columna "estado del acto": TRÁMITE(S) CANCELADO(S): 0 / PARCIAL / 08/11/2018
    re.compile(r"^TR[AÁ]MITE\(S\)|^CANCELADO\(S\)|^\d+\s*/\s*(PARCIAL|TOTAL)\b", re.I),
    re.compile(r"^-{3,}$"),
]
_VOLANTE = re.compile(r"^\d{10,14}$")
_FECHA = re.compile(r"^(\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2})$")
_NOMBRE_ACTO = re.compile(r"^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\.,/()-]{3,60}$")
# Clave corta del acto en la tabla (A.C.S., C.V., C.G.A.M.L.U., CANC., HIP.…) o nombre de una palabra
_CLAVE_CON_PUNTOS = re.compile(r"^(?=.*\.)[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\.\s/-]{0,24}$")
_NOMBRES_DE_ACTO = {
    "COMPRAVENTA", "HIPOTECA", "EMBARGO", "DONACION", "DONACIÓN", "ADJUDICACION", "ADJUDICACIÓN", "FIDEICOMISO",
    "CANCELACION", "CANCELACIÓN", "PERMUTA", "HERENCIA", "USUFRUCTO", "SERVIDUMBRE", "ARRENDAMIENTO", "FUSION",
    "FUSIÓN", "SUBDIVISION", "SUBDIVISIÓN", "LOTIFICACION", "LOTIFICACIÓN", "INMATRICULACION", "INMATRICULACIÓN",
    "APORTACION", "APORTACIÓN", "DACION", "DACIÓN", "RECTIFICACION", "RECTIFICACIÓN", "AVISO", "DEMANDA",
}
_HORA = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")
_NUMERO_TRAMITE = re.compile(r"^\d{3,9}$")

PALABRAS_HIPOTECA = re.compile(
    r"HIPOTEC|GARANT[IÍ]A\s+HIPOTECARIA|A\.?\s?C\.?\s?S\.?|APERTURA\s+DE\s+CR[EÉ]DITO|MUTUO|OTORGAMIENTO\s+DE\s+CR[EÉ]DITO",
    re.I,
)
PALABRAS_CANCELACION = re.compile(r"CANCELACI[OÓ]N|CANCELA\b|EXTINCI[OÓ]N", re.I)


def _sin_acentos(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def _seccion_de(linea):
    for clave, patron in SECCIONES:
        if patron.search(linea):
            return clave
    return None


_PEGADO = re.compile(r"^(?:-{1,3}\s+)?(\d{10,14})((?:\s+(?:-{1,3}|\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}))+)\s*(.*)$")


def _separar_renglones_pegados(lineas):
    """Algunos PDF traen el renglón de la tabla en una sola línea: "1000000002505 --- 13/12/2001 A.C.S. INSTRUMENTO ...".
    Se separa en volante, fechas, clave y texto, como lo trae la mayoría."""
    salida = []
    for linea in lineas:
        m = _PEGADO.match(linea)
        if not m:
            salida.append(linea)
            continue
        salida.append(m.group(1))
        salida.extend(f for f in m.group(2).split() if not f.startswith("-"))
        resto = m.group(3).strip()
        mc = re.match(r"^([A-ZÁÉÍÓÚÑ](?:[A-ZÁÉÍÓÚÑ]{0,6}\.){1,8})\s+(.*)$", resto)
        if mc:
            salida.extend([mc.group(1), mc.group(2)])
        elif resto:
            salida.append(resto)
    return salida


_CIERRE = re.compile(r"VOLANTE\s*:?\s*(\d{10,14})\s+CALIFICADOR\s*:.*?ANALISTA\s*:\s*[A-ZÁÉÍÓÚÑ]*", re.I | re.S)


def _actos_por_cierre(paginas_texto):
    """Plan B: cada acto del folio electrónico termina con "VOLANTE: <número> CALIFICADOR: ... ANALISTA: ...".
    Se toma el texto entre un cierre y el siguiente, sin los encabezados de la tabla."""
    actos = []
    partes = []
    for num, texto in enumerate(paginas_texto, start=1):
        for l in _separar_renglones_pegados([x.strip() for x in texto.splitlines()]):
            if l and not any(p.search(l) for p in _PIE):
                partes.append((num, l))
    texto = " ".join(l for _, l in partes)
    # página de cada posición del texto
    marcas, pos = [], 0
    for num, l in partes:
        marcas.append((pos, num))
        pos += len(l) + 1

    def pagina_de(i):
        num = 1
        for p, n in marcas:
            if p > i:
                break
            num = n
        return num

    def seccion_en(i):
        sec, mejor = "otros", -1
        for clave, patron in SECCIONES:
            for m in patron.finditer(texto, 0, i):
                if m.start() > mejor:
                    sec, mejor = clave, m.start()
        return sec

    inicio = 0
    encab = re.compile(r"\b(?:TR[AÁ]MITE|VOLANTE|ENTRADA|FECHA\s+DE|INGRESO|DD/MM/AAAA|INSCRIPCI[OÓ]N|CLAVE|ACTO|ESTADO\s+DEL\s+ACTO|"
                       r"GRAV[AÁ]MENES,?\s+HIPOTECAS,?\s+DERECHOS|REALES\s+Y\s+LIMITACIONES\s+DE\s+DOMINIO|INSCRIPCIONES\s+DE\s+PROPIEDAD|"
                       r"ANOTACIONES\s+PREVENTIVAS|ESTADO|DEL)\b", re.I)
    for m in _CIERRE.finditer(texto):
        trozo = texto[inicio:m.end()]
        inicio = m.end()
        # Lo que va antes del texto del acto: encabezados, ---, volante, fechas y clave
        mt = re.search(r"(?:^|\s)(?:(\d{10,14})\s+)?(?:-{1,3}\s+)?(\d{1,2}/\d{1,2}/\d{4})?\s*(?:-{1,3}\s+)?(\d{1,2}/\d{1,2}/\d{4})?\s*"
                       r"([A-ZÁÉÍÓÚÑ](?:[A-ZÁÉÍÓÚÑ]{0,6}\.){1,8})\s+(?=[A-ZÁÉÍÓÚÑ0-9])", trozo)
        if mt and mt.start() < len(trozo) * 0.6:
            volante = mt.group(1) or m.group(1)
            fecha = mt.group(2) or mt.group(3) or ""
            clave = mt.group(4)
            cuerpo = trozo[mt.end():]
        else:
            volante, fecha, clave = m.group(1), "", ""
            cuerpo = trozo
            # quita encabezados al inicio
            while True:
                c2 = re.sub(r"^\s*(?:-{1,3}|\d{10,14}|\d{1,2}/\d{1,2}/\d{4})\s+", "", cuerpo)
                c2 = re.sub(r"^\s*" + encab.pattern, "", c2, flags=re.I) if encab.match(c2.strip()) else c2
                if c2 == cuerpo:
                    break
                cuerpo = c2
        cuerpo = " ".join(cuerpo.split())
        if len(cuerpo) < 25:
            continue
        actos.append({"seccion": seccion_en(m.start()), "pagina": pagina_de(m.start()), "volante": volante,
                      "fecha": fecha, "clave": clave, "texto": cuerpo})
    for n, acto in enumerate(actos, start=1):
        acto["id"] = n
        acto["seccion_nombre"] = NOMBRE_SECCION.get(acto["seccion"], "Otros")
        texto_up = acto["texto"].upper()
        acto["es_hipoteca"] = bool(PALABRAS_HIPOTECA.search(texto_up) or PALABRAS_HIPOTECA.search(acto["clave"] or ""))
        acto["es_cancelacion"] = bool(PALABRAS_CANCELACION.search(texto_up))
        acto["resumen"] = acto["texto"][:220] + ("…" if len(acto["texto"]) > 220 else "")
        acto["cancelada"] = False
    return actos


def dividir_actos(paginas_texto):
    """
    paginas_texto: lista con el texto de cada página.
    Regresa una lista de actos: {id, seccion, seccion_nombre, pagina, volante, fecha, clave, texto}
    """
    actos = []
    seccion = "otros"
    actual = None

    def cerrar():
        nonlocal actual
        if actual and actual["lineas"]:
            texto = " ".join(" ".join(actual["lineas"]).split())
            if len(texto) >= 25:  # descarta renglones sueltos sin contenido
                actual["texto"] = texto
                if not actual.get("volante"):
                    mv = re.search(r"VOLANTE\s*:\s*(\d{10,14})", texto, re.I)
                    if mv:
                        actual["volante"] = mv.group(1)
                del actual["lineas"]
                actos.append(actual)
        actual = None

    fin_acto = False  # el acto actual ya terminó (llegó "ANALISTA: ..."): una fecha suelta empieza otro

    for num_pagina, texto_pagina in enumerate(paginas_texto, start=1):
        lineas = _separar_renglones_pegados([l.strip() for l in texto_pagina.splitlines()])
        # Palabras de encabezado ("DEL", "ACTO"...) que pueden ser parte del texto de un acto:
        # se guardan aparte y solo se agregan si el texto del acto continúa después.
        pendientes = []
        for i, linea in enumerate(lineas):
            nueva_seccion = _seccion_de(linea)
            if nueva_seccion and len(linea) < 80:
                pendientes = []
                cerrar()
                seccion = nueva_seccion
                continue
            if not linea or linea in ("---", "-", "--") or any(p.search(linea) for p in _PIE):
                continue
            if linea.upper() in _ENCABEZADOS:
                pendientes.append(linea)
                continue

            siguiente = next((l for l in lineas[i + 1:i + 4] if l and l.upper() not in _ENCABEZADOS and l not in ("---",)), "")

            # Número de trámite (columna antes del volante): no es texto del acto
            if _NUMERO_TRAMITE.match(linea) and _VOLANTE.match(siguiente or ""):
                continue

            # Renglón del folio electrónico: empieza con el número de volante
            if _VOLANTE.match(linea):
                pendientes = []
                cerrar()
                fin_acto = False
                actual = {"seccion": seccion, "pagina": num_pagina, "volante": linea, "fecha": "", "clave": "", "lineas": []}
                continue
            # Acto sin volante ("---"): empieza con su fecha, después de que terminó el anterior (o al inicio de la sección)
            if seccion != "otros" and _FECHA.match(linea) and (actual is None or fin_acto):
                pendientes = []
                cerrar()
                fin_acto = False
                actual = {"seccion": seccion, "pagina": num_pagina, "volante": "", "fecha": linea, "clave": "", "lineas": []}
                continue
            # Renglón de libros: nombre del acto y luego su fecha (ej. COMPRAVENTA / 2006-11-08)
            if seccion != "otros" and _NOMBRE_ACTO.match(linea) and _FECHA.match(siguiente or "") and ":" not in linea:
                pendientes = []
                cerrar()
                actual = {"seccion": seccion, "pagina": num_pagina, "volante": "", "fecha": "", "clave": linea.strip(" ,"), "lineas": []}
                continue

            if actual is None:
                pendientes = []
                continue
            if pendientes:
                if actual["lineas"]:
                    actual["lineas"].extend(pendientes)
                pendientes = []
            if not actual["fecha"] and _FECHA.match(linea):
                actual["fecha"] = linea
                continue
            if _HORA.match(linea):  # hora suelta (00:00)
                continue
            # Segunda fecha de la tabla (fecha de inscripción), antes del texto del acto
            if actual["fecha"] and not actual["lineas"] and _FECHA.match(linea):
                actual.setdefault("fecha_inscripcion", linea)
                continue
            # Clave del acto justo después de las fechas (ej. A.C.S., C.V., C.G.A.M.L.U., COMPRAVENTA)
            if not actual["clave"] and not actual["lineas"] and (
                _CLAVE_CON_PUNTOS.match(linea) or _sin_acentos(linea.upper().strip(" .,")) in {_sin_acentos(n) for n in _NOMBRES_DE_ACTO}
            ):
                actual["clave"] = linea.strip()
                continue
            actual["lineas"].append(linea)
            if re.search(r"ANALISTA\s*:", linea, re.I):
                fin_acto = True
    cerrar()

    # Si el texto vino en otro orden y no se encontraron (o faltan) actos, se separan por su cierre "VOLANTE ... ANALISTA:"
    otros = _actos_por_cierre(paginas_texto)
    if len(otros) > len(actos):
        actos = otros

    for n, acto in enumerate(actos, start=1):
        acto["id"] = n
        acto["seccion_nombre"] = NOMBRE_SECCION.get(acto["seccion"], "Otros")
        texto_up = acto["texto"].upper()
        acto["es_hipoteca"] = bool(PALABRAS_HIPOTECA.search(texto_up) or PALABRAS_HIPOTECA.search(acto["clave"] or ""))
        acto["es_cancelacion"] = bool(PALABRAS_CANCELACION.search(texto_up))
        acto["resumen"] = acto["texto"][:220] + ("…" if len(acto["texto"]) > 220 else "")
        acto["cancelada"] = False

    # Una hipoteca ya cancelada en la misma constancia (la cancelación menciona su escritura) no es candidata
    def numero_escritura(texto):
        m = re.search(r"(?:ESCRITURA|INSTRUMENTO)\s+(?:P[UÚ]BLICA\s+)?(?:N[OÚ]M(?:ERO)?\.?|NO\.?)?\s*([0-9][0-9,]*)", texto, re.I)
        return m.group(1).replace(",", "") if m else None
    canceladas = {numero_escritura(a["texto"]) for a in actos if a["es_cancelacion"]} - {None}
    for acto in actos:
        if acto["es_hipoteca"] and not acto["es_cancelacion"] and numero_escritura(acto["texto"]) in canceladas:
            acto["cancelada"] = True
    return actos


def parece_constancia_ifrem(texto):
    t = texto.upper()
    if "CARTA DE INSTRUCCI" in t:  # la carta del INFONAVIT/FOVISSSTE nunca es una constancia
        return False
    # Solo la constancia de folio real del IFREM (Estado de México) tiene esta estructura de actos;
    # los antecedentes de la CDMX (escrituras) también dicen "folio real" y "gravamen", pero no son constancias.
    if "IFREM" in t or "FUNCIÓN REGISTRAL" in t or "FUNCION REGISTRAL" in t:
        return True
    return "FOLIO REAL ELECTR" in t and "INSCRIPCIONES DE PROPIEDAD" in t and bool(re.search(r"GRAV[AÁ]MENES,?\s+HIPOTECAS", t))


_NUMS = {
    "UN": 1, "UNO": 1, "PRIMERO": 1, "DOS": 2, "TRES": 3, "CUATRO": 4, "CINCO": 5, "SEIS": 6, "SIETE": 7, "OCHO": 8, "NUEVE": 9,
    "DIEZ": 10, "ONCE": 11, "DOCE": 12, "TRECE": 13, "CATORCE": 14, "QUINCE": 15, "DIECISEIS": 16, "DIECISIETE": 17,
    "DIECIOCHO": 18, "DIECINUEVE": 19, "VEINTE": 20, "VEINTIUNO": 21, "VEINTIUN": 21, "VEINTIDOS": 22, "VEINTITRES": 23,
    "VEINTICUATRO": 24, "VEINTICINCO": 25, "VEINTISEIS": 26, "VEINTISIETE": 27, "VEINTIOCHO": 28, "VEINTINUEVE": 29,
    "TREINTA": 30, "CUARENTA": 40, "CINCUENTA": 50, "SESENTA": 60, "SETENTA": 70, "OCHENTA": 80, "NOVENTA": 90,
    "NOVECIENTOS": 900, "OCHOCIENTOS": 800, "CIEN": 100, "CIENTO": 100, "DOSCIENTOS": 200, "TRESCIENTOS": 300,
    "CUATROCIENTOS": 400, "QUINIENTOS": 500, "SEISCIENTOS": 600, "SETECIENTOS": 700,
}


def _sin_acentos(t):
    return t.upper().translate(str.maketrans("ÁÉÍÓÚÜ", "AEIOUU"))


def _palabras_a_entero(texto):
    """'DOS MIL DIECIOCHO' -> 2018, 'DIEZ' -> 10, '10' -> 10. None si no se entiende."""
    t = _sin_acentos(texto).strip()
    if t.isdigit():
        return int(t)
    total, actual = 0, 0
    for p in t.replace(",", " ").split():
        if p == "Y":
            continue
        if p == "MIL":
            total += (actual or 1) * 1000
            actual = 0
        elif p in _NUMS:
            actual += _NUMS[p]
        else:
            return None
    return total + actual


_MES = r"(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)"


def _fecha_con_letra(texto, services):
    """'DE FECHA 10 DE SEPTIEMBRE DEL AÑO DOS MIL DIECIOCHO' (día y año con número o con letra)."""
    patron = (r"(?:DE\s+FECHA|CELEBRADA\s+EL|OTORGADA\s+EL|FIRMADA\s+EL)\s+"
              r"([0-9]{1,2}|[A-ZÁÉÍÓÚ]+(?:\s+Y\s+[A-ZÁÉÍÓÚ]+)?)\s+DE\s+" + _MES +
              r"\s+DE(?:L)?\s+(?:A[ÑN]O\s+)?([0-9]{4}|(?:DOS\s+MIL|MIL\s+NOVECIENTOS)(?:\s+[A-ZÁÉÍÓÚ]+){0,4}?)"
              r"(?=\s*[,\.;]|\s+(?:PASADA|OTORGADA|ANTE|EN\s+LA|EN\s+EL|DEL\s+VOLUMEN|INSCRIT)|\s*$)")
    m = re.search(patron, texto, re.I)
    if not m:
        return None
    dia = _palabras_a_entero(m.group(1))
    anio = _palabras_a_entero(m.group(3))
    if not dia or not anio or not (1 <= dia <= 31) or not (1900 <= anio <= 2100):
        return None
    fecha = services.convertir_fecha_texto(f"{dia} de {m.group(2).lower()} de {anio}")
    return fecha if fecha and fecha != "NO_ENCONTRADO" else None


_PALABRA_NOMBRE = r"[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\.]*"
# Número de la notaría con dígitos o con letra ("67", "SESENTA Y SIETE")
_PAL_NUM = r"(?:UNO?|DOS|TRES|CUATRO|CINCO|SEIS|SIETE|OCHO|NUEVE|DIEZ|ONCE|DOCE|TRECE|CATORCE|QUINCE|DIECI[A-ZÉ]+|VEINTI?[A-ZÚÓÉ]*|TREINTA|CUARENTA|CINCUENTA|SESENTA|SETENTA|OCHENTA|NOVENTA|CIENTO?|[A-Z]+CIENTOS)"
_NUM_NOTARIA = rf"(?:N[UÚ]M(?:ERO|\.)?|NO\.?|N[º°]\.?)\s*([0-9]{{1,4}}|{_PAL_NUM}(?:\s+(?:Y\s+)?{_PAL_NUM}){{0,3}})(?![A-Z])"
# "LIC. NOMBRE", "LIC.NOMBRE", "LICENCIADO NOMBRE", "LICDA. NOMBRE"
_LIC = r"(?:LIC(?:ENCIAD[OA])?\.\s*|LIC(?:ENCIAD[OA])?\s+|LICDA?\.?\s*(?=[A-ZÁÉÍÓÚÑ]{2}))"
_NOTARIO = r"(?:NOT(?:I)?AR[IÍ][OA](?:\s+P[UÚ]BLIC[OA])?|NOT\.\s*(?:P[UÚ]B(?:LIC[OA])?\.?)?)"
_JURISDICCION = r"((?:DEL?|DE\s+LA)\s+[A-ZÁÉÍÓÚÑ\s]{3,60}?)(?=\s*[,\.;]|\s+CON\s+RES|\s+EN\s+(?:LA|EL|QUE)|\s+LIC|\s+QUE|\s*$)"


def _jurisdiccion_notaria(jur):
    j = _sin_acentos(" ".join(str(jur or "").split()))
    if not j:
        return "del Estado de México"
    if "DISTRITO FEDERAL" in j or "CIUDAD DE MEXICO" in j:
        return "de la Ciudad de México"
    if "ESTADO DE MEXICO" in j:
        return "del Estado de México"
    m = re.search(r"DISTRITO\s+(?:JUDICIAL\s+)?DE\s+([A-Z\s]+)", j)
    if m:  # las constancias son del IFREM: notarías del Estado de México
        lugar = " ".join(p.capitalize() if p not in ("DE", "DEL", "LA", "LOS", "LAS") else p.lower() for p in m.group(1).split())
        return f"del Distrito de {lugar}, Estado de México"
    return "del Estado de México"


def _limpiar_nombre_notario(nombre):
    palabras = [p.strip(",") for p in str(nombre or "").split()]
    quitar = {"EL", "LA", "LIC", "LIC.", "LICENCIADO", "LICENCIADA", "LICDA", "LICDA.", "NOTARIO", "NOTARIA", "PUBLICO", "PÚBLICO",
              "PUBLICA", "PÚBLICA", "DEL", "DE"}
    while palabras and palabras[0].upper() in quitar:
        palabras.pop(0)
    while palabras and palabras[-1].upper() in {"DE", "DEL", "LA", "Y", "EL"}:
        palabras.pop()
    # Iniciales sueltas ("VICTOR A VARELA PEREZ") se dejan con punto
    palabras = [p + "." if len(p) == 1 and p.isalpha() and 0 < i < len(palabras) - 1 else p for i, p in enumerate(palabras)]
    return " ".join(palabras)


def notario_de_acto(texto, services):
    """
    Notario de un acto de la constancia, en sus formas más comunes:
      ... ANTE LA FE DEL NOTARIO PUBLICO LIC. VICTOR A VARELA PEREZ NUMERO 20, DEL DISTRITO DE TOLUCA ...
      ... ANTE LA FE DEL LIC. ROBERTO DIAZ MENDOZA, NOTARIO PÚBLICO NO. 24 DEL ESTADO DE MÉXICO ...
      ... NOTARIO PUBLICO NUMERO 5 DEL ESTADO DE MEXICO, LIC. ANA LUISA SOTO ...
    Regresa el texto listo para la plantilla, o None si no lo encuentra.
    """
    t = numeros_texto(texto)
    nombre_re = rf"({_PALABRA_NOMBRE}(?:\s+{_PALABRA_NOMBRE}){{1,7}}?)"
    patrones = [
        # NOTARIO PUBLICO LIC. NOMBRE NUMERO 20, DEL DISTRITO DE X
        rf"{_NOTARIO}\s*,?\s*{_LIC}?{nombre_re}\s*,?\s*{_NUM_NOTARIA}\s*,?\s*(?:{_JURISDICCION})?",
        # LIC. NOMBRE, NOTARIO PUBLICO NUMERO 24 DEL ESTADO DE MEXICO
        rf"{_LIC}{nombre_re}\s*,?\s*(?:TITULAR\s+DE\s+LA\s+)?{_NOTARIO}\s*{_NUM_NOTARIA}\s*,?\s*(?:{_JURISDICCION})?",
        # NOTARIO PUBLICO NUMERO 5 DEL ESTADO DE MEXICO, LIC. NOMBRE  ·  NOTARIO PUBLICO NUMERO 67 LIC. NOMBRE CON RESIDENCIA EN ...
        # NOTARIA PUBLICA NUMERO 67 A CARGO DEL LIC. NOMBRE  ·  NOTARIO PUBLICO NUMERO 67 DE TOLUCA, ESTADO DE MEXICO, LIC. NOMBRE
        rf"{_NOTARIO}\s*{_NUM_NOTARIA}([^;\.]{{0,60}}?)\s*,?\s*(?:A\s+CARGO\s+DE(?:L|\s+LA)?\s+)?{_LIC}{nombre_re}(?=\s*[,\.;]|\s+(?:EN|CON|QUE|Y|DEL?|A)\b|\s*$)",
    ]
    for i, pat in enumerate(patrones):
        m = re.search(pat, t, re.I)
        if not m:
            continue
        if i == 2:
            numero, jur, nombre = m.group(1), m.group(2), m.group(3)
        else:
            nombre, numero, jur = m.group(1), m.group(2), m.group(3)
        # "... LIC. NOMBRE CON RESIDENCIA EN LA CIUDAD DE MEXICO": la entidad viene después del nombre
        if not re.search(r"ESTADO\s+DE\s+M[EÉ]XICO|DISTRITO|CIUDAD\s+DE\s+M[EÉ]XICO", str(jur or ""), re.I):
            cola = re.match(r"\s*,?\s*(?:CON\s+RESIDENCIA\s+EN|DEL?|EN)\s+([^;]{3,70})", t[m.end():], re.I)
            if cola and re.search(r"ESTADO\s+DE\s+M[EÉ]XICO|DISTRITO|CIUDAD\s+DE\s+M[EÉ]XICO", cola.group(1), re.I):
                jur = cola.group(1)
        nombre = _limpiar_nombre_notario(nombre)
        if not str(numero).isdigit():
            numero = _palabras_a_entero(numero)
            if not numero:
                continue
        if len(nombre.split()) < 2 or re.search(r"\b(?:NOTARI|ESCRITURA|INSTRUMENTO|FECHA|NUMERO|CONSTA)", nombre, re.I):
            continue
        texto_notario = f"{nombre} Notario Público número {services.numero_a_palabras_generico(numero).lower()} {_jurisdiccion_notaria(jur)}"
        return services.formatear_notario(texto_notario)
    return None


def numeros_texto(texto):
    return " ".join(str(texto or "").split())


# ---- Número de escritura: tolera las variantes de redacción y los errores típicos del OCR ----
_ESC = r"(?:E\s?[S5]\s?C\s?R\s?[I1lLÍ]\s?T\s?U?\s?R\s?A|ESCRITUA|ESC\.)"
_PUB = r"(?:\s*(?:P[UÚ]BLICA|P[UÚ]B\.?|NOTARIAL))?"
_NUMERO = r"(?:N[UÚO]M(?:ERO|\.)?|N[º°oO]\.?|NO\.?|NRO\.?|#)"
# dígitos, con las confusiones del OCR (O por 0, I/l por 1) y separadores de miles
_VALOR = r"([0-9OIl](?:[0-9OIl]|[,\.\s](?=[0-9OIl]{3}))*)(?![0-9A-Z])"
_FIN_PALABRAS = r"(?=\s*[,;\.]|\s+(?:DE\s+FECHA|DEL?\s|OTORGAD|PASADA|ANTE|VOLUMEN|LIBRO|EN\s))"


def _a_digitos(crudo):
    t = str(crudo or "").strip().rstrip(",.")
    if not re.search(r"[0-9]", t):  # sin un solo dígito real no se adivina
        return None
    t = t.translate(str.maketrans("OIl", "011"))
    t = re.sub(r"[,\.\s]", "", t)
    if not t.isdigit() or not (1 <= len(t) <= 6) or int(t) == 0:
        return None
    return str(int(t))


def numero_escritura_de_texto(texto):
    """
    Número de la escritura en las redacciones que aparecen en las constancias, por ejemplo:
      ESCRITURA PUBLICA NUMERO 6511 · ESCRITURA No. 6,511 · ESC. 6511 · ESCRITURA PÚBLICA PASADA NUMERO 6511
      INSTRUMENTO NOTARIAL 6511 · NUMERO DE ESCRITURA: 6511 · ESCRITURA NUMERO SEIS MIL QUINIENTOS ONCE
    y con errores de OCR (ESCRlTURA, 65I1). Regresa los dígitos ("6511") o None.
    """
    t = " ".join(str(texto or "").replace("­", "").split())
    t = re.sub(r"(\w)-\s+(\w)", r"\1\2", t)  # palabras cortadas al final del renglón
    T = t.upper()
    patrones = [
        rf"{_ESC}{_PUB}\s*,?\s*(?:{_NUMERO})?\s*:?\s*{_VALOR}",
        rf"(?:{_NUMERO}|N[UÚ]MERO)\s*(?:DE\s+(?:LA\s+)?)?{_ESC}{_PUB}\s*:?\s*{_VALOR}",
        rf"INSTRUMENTO(?:\s+(?:NOTARIAL|P[UÚ]BLICO))?\s*,?\s*(?:{_NUMERO})?\s*:?\s*{_VALOR}",
        # "ESCRITURA PUBLICA PASADA NUMERO 6511" / "TESTIMONIO DE LA ESCRITURA ... NUMERO 6511" (sin pasar por el notario)
        rf"(?:{_ESC}|TESTIMONIO)(?:(?!NOTARI|VOLUMEN|PARTIDA|\$)[^;]){{0,40}}?{_NUMERO}\s*:?\s*{_VALOR}",
    ]
    for pat in patrones:
        for m in re.finditer(pat, T):
            numero = _a_digitos(m.group(1))
            if numero:
                return numero
    # Con letra: "ESCRITURA PUBLICA NUMERO SEIS MIL QUINIENTOS ONCE, DE FECHA ..."
    m = re.search(rf"{_ESC}{_PUB}\s*(?:{_NUMERO})?\s*([A-ZÁÉÍÓÚ]+(?:\s+[A-ZÁÉÍÓÚ]+){{0,6}}?){_FIN_PALABRAS}", T)
    if m:
        n = _palabras_a_entero(m.group(1))
        if n and 0 < n < 1000000:
            return str(n)
    return None


def datos_de_acto(acto, services):
    """Datos que se pueden tomar de un acto, ya con el formato que usa el Word."""
    texto = acto.get("texto", "")
    datos = {}

    numero = numero_escritura_de_texto(texto)
    if numero:
        datos["numero_escritura"] = services.numero_a_palabras_generico(numero).lower()
        datos["numero_escritura_digitos"] = numero

    for patron in [
        r"de\s+fecha\s+([0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4})",
        r"de\s+fecha\s+([0-9]{1,2}[-/][0-9A-Za-z]+[-/][0-9]{4})",
        r"(?:celebrada|otorgada|firmada)\s+el\s+([0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4})",
    ]:
        mf = re.search(patron, texto, re.I)
        if mf:
            fecha = services.convertir_fecha_texto(mf.group(1).strip())
            if fecha and fecha != "NO_ENCONTRADO":
                datos["fecha_escritura"] = fecha
                break
    if "fecha_escritura" not in datos:
        fecha = _fecha_con_letra(texto, services)
        if fecha:
            datos["fecha_escritura"] = fecha

    notario = notario_de_acto(texto, services) or services.extraer_notario_robusto(texto, texto)
    if notario and notario != "NO_ENCONTRADO":
        datos["notario_origen_completo"] = notario

    # Monto: en pesos ("MONTO DEL CREDITO: $198,640.00") o en veces el salario mínimo ("IMPORTE ...: 162.9260 VSMM")
    etiqueta_monto = (r"(?:MONTO(?:\s+DEL\s+CR[EÉ]DITO)?|IMPORTE(?:\s+DE\s+LA\s+OBLIGACI[OÓ]N(?:\s+GARANTIZADA)?|\s+DEL\s+CR[EÉ]DITO|\s+GARANTIZADO)?|"
                      r"OBLIGACI[OÓ]N\s+GARANTIZADA|(?:POR\s+)?LA\s+CANTIDAD\s+DE|CANTIDAD\s+DE|CR[EÉ]DITO\s+POR)\s*:?\s*")
    mm = re.search(etiqueta_monto + r"\$\s*(" + services.MONTO_NUMERO + ")", texto, re.I)
    if mm and services.normalizar_monto(mm.group(1)) is not None:
        datos["monto_credito"] = services.formatear_monto(mm.group(1))
    mv = re.search(etiqueta_monto + r"([0-9]+(?:[\.,][0-9]+)?)\s*(?:V\.?\s?S\.?\s?M\.?\s?M\.?|V\.?\s?S\.?\s?M\.?|VECES\s+(?:EL\s+)?(?:SALARIO|S\.\s?M))", texto, re.I)
    if mv:
        vsm = mv.group(1).replace(",", ".")
        try:
            datos["credito_a_salario"] = services.convertir_vsm_a_letras(vsm)
            datos["credito_a_salario_digitos"] = vsm
        except Exception:
            pass
    else:
        # También con letra o sin etiqueta: "...hasta por setenta y ocho punto seis mil ... veces el salario mínimo"
        vsm = services.vsm_de_texto(texto)
        if vsm:
            datos["credito_a_salario"] = vsm

    acreedor = re.search(r"ACREEDOR\s*:\s*([A-ZÁÉÍÓÚÑ\.\s]{3,60}?)(?:,|\s+DEUDOR)", texto, re.I)
    deudor = re.search(r"DEUDOR(?:ES)?\s*:\s*([A-ZÁÉÍÓÚÑ\.\s]{3,80}?)(?:,|\.\s|\s+MONTO|\s+PLAZO|\s+IMPORTE)", texto, re.I)
    if acreedor:
        datos["acreedor"] = " ".join(acreedor.group(1).split())
    if deudor:
        datos["deudor"] = " ".join(deudor.group(1).split())
    personas = personas_de_texto(texto)
    if personas:
        datos["personas"] = personas
    if re.search(r"\bMUTUO\b", texto, re.I):
        datos["tipo_credito"] = "MUTUO"
    elif re.search(r"APERTURA\s+DE\s+CR[EÉ]DITO|OTORGAMIENTO\s+DE(?:L)?\s+CR[EÉ]DITO", texto, re.I) \
            or re.fullmatch(r"A\.?\s?C\.?\s?S\.?", str(acto.get("clave") or "").strip(), re.I):
        datos["tipo_credito"] = "AP"
    return datos


# ---- Personas (acreditado y cónyuge) ----
_ETIQUETA_PERSONAS = re.compile(
    r"(?:DEUDOR(?:ES|A)?|PARTE\s+DEUDORA|ACREDITAD[OA]S?|COMPRADOR(?:ES|A)?|ADQUIRENTES?|PROPIETARI[OA]S?)"
    r"\s*(?:\((?:ES|S|A)\))?\s*:\s*", re.I)
_FIN_PERSONAS = re.compile(
    r"\b(?:MONTO|PLAZO|ACREEDOR|VALOR|DESTINO|GARANT|SU\s+ANTECEDENTE|VOLANTE|CALIFICADOR|ANALISTA|OBSERVACION|"
    r"TIPO\s+DE|VENDEDOR|INTER[EÉ]S|TASA|IMPORTE|CANTIDAD|SUPERFICIE|R\.?F\.?C|CURP)\b|\.\s|\.$", re.I)
_NO_ES_PERSONA = re.compile(
    r"INFONAVIT|FOVISSSTE|SOCIEDAD|\bS\.?\s?A\.?\b|BANCO|INSTITUTO|FINANCIERA|GOBIERNO|NO\s+CONSTA|CREDITO|HIPOTECA|"
    r"\bDE\s+C\.?\s?V\b|FIDEICOMISO|ASOCIACI", re.I)


def separar_personas(texto):
    """'JUAN PEREZ LOPEZ Y MARIA RUIZ SOTO' -> ['JUAN PEREZ LOPEZ', 'MARIA RUIZ SOTO']."""
    t = re.sub(r"[\"“”'«»]", " ", str(texto or "").upper())
    t = re.sub(r"\bY\s*/\s*O\b", ",", t)
    t = re.sub(r"\(\s*(?:SU\s+)?C[OÓ]NYUGE\s*\)", ",", t)
    partes = re.split(r"\s*[,;]\s*|\s+Y\s+|\s+E\s+(?=[A-ZÁÉÍÓÚÑ])", t)
    personas = []
    for p in partes:
        # Quita tratamientos al inicio, aunque vengan varios: "LA SEÑORA", "SU ESPOSA LA C.", "EL SR."
        p = p.strip()
        previo = None
        while previo != p:
            previo = p
            p = re.sub(r"^(?:C\.|SR\.?|SRA\.?|SRITA\.?|SE[ÑN]OR(?:A|ITA)?|DO[ÑN]A|DON|CIUDADAN[OA]|LIC\.?|LICENCIAD[OA]|"
                       r"ESPOS[OA]|C[OÓ]NYUGE|EL|LA|LOS|LAS|SUS?)\s+", "", p)
        p = " ".join(re.sub(r"[^A-ZÁÉÍÓÚÑÜ\.\s]", " ", p).split()).strip(" .")
        if len(p.split()) >= 2 and len(p) <= 70 and not _NO_ES_PERSONA.search(p) and p not in personas:
            personas.append(p)
    return personas


def personas_de_texto(texto):
    """Personas que aparecen como deudor / acreditado / comprador / propietario en el texto de un acto."""
    personas = []
    for m in _ETIQUETA_PERSONAS.finditer(texto or ""):
        resto = texto[m.end():m.end() + 250]
        fin = _FIN_PERSONAS.search(resto)
        bloque = resto[:fin.start()] if fin else resto
        for p in separar_personas(bloque):
            if p not in personas:
                personas.append(p)
    return personas


def propietarios_primera_pagina(texto):
    """Nombres en la tabla 'PROPIETARIO(S)' de la primera hoja de la constancia."""
    m = re.search(r"PROPIETARIO\(?S?\)?\s*\n(.*?)(?:\nFOLIO\s+REAL|\nDATOS\s+DE\s+IDENTIFICACI|\nDENOMINACI)", texto or "", re.S | re.I)
    if not m:
        return []
    nombres = []
    for linea in m.group(1).splitlines():
        l = linea.strip().upper()
        if not l or l in ("NOMBRE", "R.F.C.", "RFC", "IFE", "CURP", "INE") or re.fullmatch(r"[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{0,3}", l):
            continue
        for p in separar_personas(l):
            if p not in nombres:
                nombres.append(p)
    return nombres


def _parecido(a, b):
    pa = {w for w in _sin_acentos(a).split() if len(w) > 2}
    pb = {w for w in _sin_acentos(b).split() if len(w) > 2}
    return len(pa & pb)


def acreditado_y_conyuge(personas, nombre_referencia=""):
    """
    De las personas de un acto, cuál es el acreditado y cuál su cónyuge.
    Si hay un nombre de referencia (el de la carta) se toma como acreditado al que más se le parece.
    """
    if not personas:
        return "", ""
    acreditado = personas[0]
    if nombre_referencia:
        mejor = max(personas, key=lambda p: _parecido(p, nombre_referencia))
        if _parecido(mejor, nombre_referencia) > 0:
            acreditado = mejor
    otros = [p for p in personas if p != acreditado]
    return acreditado, (otros[0] if otros else "")


def elegir_acto(actos, nombre_acreditado="", entidad=""):
    """El acto de hipoteca que más probablemente es el que se va a cancelar."""
    candidatos = [a for a in actos if a.get("es_hipoteca") and not a.get("es_cancelacion") and not a.get("cancelada")] \
        or [a for a in actos if a.get("es_hipoteca") and not a.get("es_cancelacion")]
    if not candidatos:
        return None
    nombre = _sin_acentos(str(nombre_acreditado or "")).upper().split()
    entidad = _sin_acentos(str(entidad or "")).upper()

    def puntaje(a):
        t = _sin_acentos(a["texto"]).upper()
        p = 0
        if a["seccion"] == "gravamenes":
            p += 3
        if entidad and entidad in t:
            p += 3
        if "INFONAVIT" in t or "FOVISSSTE" in t:
            p += 1
        if nombre:
            p += sum(1 for palabra in nombre if len(palabra) > 2 and palabra in t)
        if re.search(r"ESCRITURA|INSTRUMENTO", t):
            p += 1
        return (p, a["id"])  # a igual puntaje, el más reciente (aparece después)

    return max(candidatos, key=puntaje)
