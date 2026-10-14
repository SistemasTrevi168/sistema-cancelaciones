"""
Sugerencia de plantilla según el contenido de los documentos.

La plantilla se arma con 4 piezas:
  - Lugar:        CDMX o EDOMEX (constancia del IFREM, dirección del inmueble, oficina registral)
  - Tipo:         Apertura de crédito (AP) o Contrato de mutuo (MUTUO) (texto del acto de la hipoteca)
  - Acreditado:   hombre o mujer (por el nombre)
  - Estado civil: casado(a) si se encontró cónyuge; soltero(a) si no
Si la carta habla de coacreditados se sugiere el modelo de coacreditados.
El usuario siempre puede elegir otra plantilla a mano.
"""
import re

_CDMX = re.compile(r"CIUDAD\s+DE\s+M[EÉ]XICO|DISTRITO\s+FEDERAL|\bCDMX\b|\bALCALD[IÍ]A\b|\bDELEGACI[OÓ]N\s+(?:BENITO|COYOAC|IZTAP|GUSTAVO|TLALPAN|XOCHIM|ALVARO|AZCAPO|CUAUHT|MIGUEL|VENUSTIANO|MAGDALENA|CUAJIMALPA|MILPA|TLAHUAC|IZTACALCO)", re.I)
_EDOMEX = re.compile(r"ESTADO\s+DE\s+M[EÉ]XICO|EDO\.?\s*(?:DE\s+)?M[EÉ]X|\bIFREM\b|INSTITUTO\s+DE\s+LA\s+FUNCI[OÓ]N\s+REGISTRAL", re.I)
_MUTUO = re.compile(r"\bMUTUO\b", re.I)
_AP = re.compile(r"APERTURA\s+DE\s+CR[EÉ]DITO|\bA\.?\s?C\.?\s?S\.?(?=\s|$)", re.I)
_COAC = re.compile(r"COACREDITAD|CO-ACREDITAD|UNAMOS\s+CR[EÉ]DITOS", re.I)

_VACIOS = {"", "NO_ENCONTRADO", "NONE", "NULL", "N/A"}


def _valor(v):
    v = str(v or "").strip()
    return "" if v.upper() in _VACIOS else v


def _textos(lista_datos, tipo):
    return " ".join(str(d.get("texto_raw") or "") for d in lista_datos if (d.get("_tipo_documento") == "carta") == (tipo == "carta"))


def _direccion_carta(texto):
    """Solo la dirección de la vivienda en la carta (el resto puede traer domicilios del Instituto)."""
    m = re.search(r"ubicad[ao]\s+en\s+(.{10,250}?)(?:,\s*constituid|\.\s)", " ".join(str(texto).split()), re.I)
    return m.group(1) if m else ""


def tipo_de_credito(texto):
    """'MUTUO', 'AP' o '' según el texto (de un acto o de un documento)."""
    if _MUTUO.search(texto or ""):
        return "MUTUO"
    if _AP.search(texto or ""):
        return "AP"
    return ""


def sugerir_plantilla(datos, actos, lista_datos):
    texto_constancia = _textos(lista_datos, "constancia")
    texto_carta = _textos(lista_datos, "carta")
    razones, dudas = [], []

    # --- Lugar ---
    region = ""
    if re.search(r"\bIFREM\b|INSTITUTO\s+DE\s+LA\s+FUNCI[OÓ]N\s+REGISTRAL", texto_constancia, re.I):
        region = "EDOMEX"
        razones.append("La constancia es del IFREM → Estado de México")
    else:
        for fuente, texto in (("los datos del inmueble", f"{datos.get('datos_inmueble', '')} {datos.get('oficina_registral', '')}"),
                              ("la constancia", texto_constancia),
                              ("la dirección de la carta", _direccion_carta(texto_carta))):
            n_cdmx, n_edomex = len(_CDMX.findall(texto)), len(_EDOMEX.findall(texto))
            # Gana el que aparece claramente más veces (un documento puede mencionar los dos)
            cdmx = n_cdmx > 0 and n_cdmx >= 3 * n_edomex
            edomex = n_edomex > 0 and n_edomex >= 3 * n_cdmx
            if cdmx or edomex:
                region = "CDMX" if cdmx else "EDOMEX"
                razones.append(f"Según {fuente} el inmueble está en {'la Ciudad de México' if cdmx else 'el Estado de México'}")
                break
    if not region:
        dudas.append("No se pudo saber si el inmueble está en CDMX o en el Estado de México")

    # --- Tipo de crédito (del acto de la hipoteca que se va a cancelar) ---
    elegido = next((a for a in actos if a.get("elegido")), None)
    tipo = tipo_de_credito(elegido.get("texto", "")) if elegido else ""
    if tipo:
        razones.append(f"El acto de la hipoteca es {'un contrato de mutuo' if tipo == 'MUTUO' else 'una apertura de crédito'}")
    else:
        tipo = tipo_de_credito(texto_constancia) or tipo_de_credito(texto_carta)
        if tipo:
            razones.append(f"Los documentos hablan de {'contrato de mutuo' if tipo == 'MUTUO' else 'apertura de crédito'}")
        else:
            tipo = "AP"
            dudas.append("No se encontró si es apertura de crédito o mutuo (se supone apertura de crédito)")

    # --- Coacreditados ---
    coacreditados = bool(_COAC.search(texto_carta) or _COAC.search(texto_constancia))
    if coacreditados:
        razones.append("Los documentos mencionan coacreditados")

    # --- Acreditado y estado civil ---
    nombre = _valor(datos.get("nombre_acreditado"))
    genero = _valor(datos.get("genero")).upper()
    mujer = genero == "FEMENINO"
    if nombre and genero:
        razones.append(f"{'La acreditada' if mujer else 'El acreditado'} es {nombre}")
    else:
        dudas.append("No se encontró el nombre del acreditado (se supone hombre)")
    conyuge = _valor(datos.get("nombre_conyuge"))
    casado = bool(conyuge) or _valor(datos.get("tiene_conyuge")).upper() in ("SÍ", "SI")
    if conyuge:
        razones.append(f"Aparece su cónyuge: {conyuge}")
    elif casado:
        razones.append("Los documentos indican que tiene cónyuge")

    region_clave = region or "EDOMEX"
    if coacreditados:
        plantilla = f"COAC_{region_clave}_{tipo}"
    else:
        estado = ("CASADA" if casado else "SOLTERA") if mujer else ("CASADO" if casado else "SOLTERO")
        plantilla = f"{region_clave}_{tipo}_{'M' if mujer else 'H'}_{estado}"

    return {
        "plantilla": plantilla,
        "region": region,
        "tipo": tipo,
        "genero": "FEMENINO" if mujer else "MASCULINO",
        "coacreditados": coacreditados,
        "razones": razones,
        "dudas": dudas,
        "segura": not dudas,
    }
