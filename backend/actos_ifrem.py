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
]
_VOLANTE = re.compile(r"^\d{10,14}$")
_FECHA = re.compile(r"^(\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2})$")
_NOMBRE_ACTO = re.compile(r"^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\.,/()-]{3,60}$")

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
                del actual["lineas"]
                actos.append(actual)
        actual = None

    for num_pagina, texto_pagina in enumerate(paginas_texto, start=1):
        lineas = [l.strip() for l in texto_pagina.splitlines()]
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

            # Renglón del folio electrónico: empieza con el número de volante
            if _VOLANTE.match(linea):
                pendientes = []
                cerrar()
                actual = {"seccion": seccion, "pagina": num_pagina, "volante": linea, "fecha": "", "clave": "", "lineas": []}
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
            if re.match(r"^\d{1,2}:\d{2}$", linea):  # hora suelta (00:00)
                continue
            # Clave corta del acto justo después de la fecha (ej. A.C.S., C.V.)
            if actual["fecha"] and not actual["clave"] and not actual["lineas"] and len(linea) <= 12 and re.match(r"^[A-Z\.\s]+$", linea):
                actual["clave"] = linea
                continue
            actual["lineas"].append(linea)
    cerrar()

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
    return ("FOLIO REAL" in t or "IFREM" in t) and ("GRAV" in t or "INSCRIPCIONES DE PROPIEDAD" in t)


_NUMS = {
    "UN": 1, "UNO": 1, "PRIMERO": 1, "DOS": 2, "TRES": 3, "CUATRO": 4, "CINCO": 5, "SEIS": 6, "SIETE": 7, "OCHO": 8, "NUEVE": 9,
    "DIEZ": 10, "ONCE": 11, "DOCE": 12, "TRECE": 13, "CATORCE": 14, "QUINCE": 15, "DIECISEIS": 16, "DIECISIETE": 17,
    "DIECIOCHO": 18, "DIECINUEVE": 19, "VEINTE": 20, "VEINTIUNO": 21, "VEINTIUN": 21, "VEINTIDOS": 22, "VEINTITRES": 23,
    "VEINTICUATRO": 24, "VEINTICINCO": 25, "VEINTISEIS": 26, "VEINTISIETE": 27, "VEINTIOCHO": 28, "VEINTINUEVE": 29,
    "TREINTA": 30, "CUARENTA": 40, "CINCUENTA": 50, "SESENTA": 60, "SETENTA": 70, "OCHENTA": 80, "NOVENTA": 90,
    "NOVECIENTOS": 900, "OCHOCIENTOS": 800,
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


def datos_de_acto(acto, services):
    """Datos que se pueden tomar de un acto, ya con el formato que usa el Word."""
    texto = acto.get("texto", "")
    datos = {}

    m = re.search(r"(?:ESCRITURA|INSTRUMENTO)\s+(?:P[UÚ]BLICA\s+)?(?:N[OÚ]M(?:ERO)?\.?|NO\.?|N[º°]\.?)?\s*([0-9][0-9,\.]*)", texto, re.I)
    if m:
        numero = m.group(1).rstrip(",.").replace(",", "")
        if numero.isdigit():
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

    notario = services.extraer_notario_robusto(texto, texto)
    if notario and notario != "NO_ENCONTRADO":
        datos["notario_origen_completo"] = notario

    mm = re.search(r"(?:MONTO\s+DEL\s+CR[EÉ]DITO|IMPORTE(?:\s+DEL\s+CR[EÉ]DITO)?|CANTIDAD\s+DE)\s*:?\s*\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)", texto, re.I)
    if mm:
        try:
            datos["monto_credito"] = f"${float(mm.group(1).replace(',', '')):,.2f}"
        except ValueError:
            pass

    acreedor = re.search(r"ACREEDOR\s*:\s*([A-ZÁÉÍÓÚÑ\.\s]{3,60}?)(?:,|\s+DEUDOR)", texto, re.I)
    deudor = re.search(r"DEUDOR(?:ES)?\s*:\s*([A-ZÁÉÍÓÚÑ\.\s]{3,80}?)(?:,|\s+MONTO|\s+PLAZO)", texto, re.I)
    if acreedor:
        datos["acreedor"] = " ".join(acreedor.group(1).split())
    if deudor:
        datos["deudor"] = " ".join(deudor.group(1).split())
    personas = personas_de_texto(texto)
    if personas:
        datos["personas"] = personas
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
        p = re.sub(r"^(?:C\.|SR\.?|SRA\.?|SE[ÑN]OR(?:A)?|LIC\.?|EL|LA|LOS|SUS?)\s+", "", p.strip())
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
