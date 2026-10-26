import os
import fitz  # PyMuPDF
import re
import nombres
from docxtpl import DocxTemplate

# Constante para calcular Veces Salario Mínimo Mensual en DF/CDMX
SALARIO_MINIMO_MENSUAL_DF = 3713.40

def limpiar_ceros_izquierda(val):
    val = str(val).strip()
    if val.isdigit():
        return str(int(val))
    val_limpia = val.lstrip('0')
    return val_limpia if val_limpia else "0"

def credito_a_letras(numero_str):
    mapa_digitos = {
        '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
        '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve'
    }
    digitos = [mapa_digitos[d] for d in str(numero_str).strip() if d in mapa_digitos]
    if digitos:
        return f'"{numero_str}" ({" ".join(digitos)})'
    return str(numero_str)

# ---------------------------------------------------------------------
# NÚMEROS CON LETRA (una sola regla para todo el sistema)
#   1 -> "uno", 21 -> "veintiuno", 16 -> "dieciséis", 22 -> "veintidós", 31 -> "treinta y uno".
#   Antes de "mil", "millones", "pesos" o "centavos" se acorta: "un", "veintiún", "treinta y un".
# ---------------------------------------------------------------------
_UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
_DIECES = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"]
_VEINTIS = ["VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS",
            "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"]
_DECENAS = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
_CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS",
             "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]


def grupo_en_letras(n, apocope=False):
    """0 a 999 con letra (MAYÚSCULAS). apocope=True: termina en "UN"/"VEINTIÚN" (va antes de un sustantivo)."""
    n = int(n)
    if n <= 0:
        return ""
    if n == 100:
        return "CIEN"
    c, r = divmod(n, 100)
    partes = []
    if c:
        partes.append(_CENTENAS[c])
    if r:
        if r < 10:
            texto = _UNIDADES[r]
        elif r < 20:
            texto = _DIECES[r - 10]
        elif r < 30:
            texto = _VEINTIS[r - 20]
        else:
            d, u = divmod(r, 10)
            texto = _DECENAS[d] + (f" Y {_UNIDADES[u]}" if u else "")
        if apocope:
            texto = re.sub(r"VEINTIUNO$", "VEINTIÚN", texto)
            texto = re.sub(r"\bUNO$", "UN", texto)
        partes.append(texto)
    return " ".join(partes)


def entero_en_letras(n, apocope=False):
    """Entero con letra (MAYÚSCULAS): 21 -> VEINTIUNO, 21000 -> VEINTIÚN MIL, 1001 -> MIL UNO."""
    n = int(n)
    if n == 0:
        return "CERO"
    millones, resto = divmod(n, 1_000_000)
    miles, cientos = divmod(resto, 1000)
    partes = []
    if millones:
        partes.append("UN MILLÓN" if millones == 1 else f"{entero_en_letras(millones, True)} MILLONES")
    if miles:
        partes.append("MIL" if miles == 1 else f"{grupo_en_letras(miles, True)} MIL")
    if cientos:
        partes.append(grupo_en_letras(cientos, apocope))
    return " ".join(partes)


def numero_a_palabras_generico(numero):
    """Convierte cualquier número entero o decimal con precisión exacta a texto completo."""
    try:
        val_str = str(numero).replace('$', '').replace(',', '').strip()
        if '.' in val_str:
            partes_num = val_str.split('.')
            enteros = int(partes_num[0] or 0)
            dec_str = partes_num[1]
        else:
            enteros = int(val_str)
            dec_str = ""
    except Exception:
        return str(numero)

    texto_enteros = entero_en_letras(enteros)

    texto_dec = ""
    if dec_str:
        zeros_lead = len(dec_str) - len(dec_str.lstrip('0'))
        partes_cero = ["CERO"] * zeros_lead
        restante_str = dec_str.lstrip('0')
        texto_restante = entero_en_letras(int(restante_str)) if restante_str.isdigit() else restante_str
        todas_partes_dec = partes_cero + ([texto_restante] if texto_restante else [])
        if todas_partes_dec:
            texto_dec = f" PUNTO {' '.join(todas_partes_dec)}"

    return f"{texto_enteros}{texto_dec}"

def convertir_vsm_a_letras(val_str):
    """
    Veces salario mínimo con letra. Después del punto se lee la cifra completa
    y los ceros del inicio uno por uno:
      45.2095 -> cuarenta y cinco punto dos mil noventa y cinco
      45.0003 -> cuarenta y cinco punto cero cero cero tres
      45.0000 -> cuarenta y cinco punto cero cero cero cero
    """
    if not val_str or str(val_str).upper() in ["NO_ENCONTRADO", "NONE", ""]:
        return ""
    limpio = str(val_str).replace(',', '').strip()
    if not re.fullmatch(r"\d*\.?\d+", limpio):
        return str(val_str)
    return numero_a_palabras_generico(limpio).lower()

_PALABRAS_DE_NUMERO = {
    "cero", "un", "uno", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
    "trece", "catorce", "quince", "dieciseis", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiun",
    "veintiún", "veintiuno", "veintidos", "veintidós", "veintitres", "veintitrés", "veinticuatro", "veinticinco", "veintiseis",
    "veintiséis", "veintisiete", "veintiocho", "veintinueve", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta",
    "ochenta", "noventa", "cien", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos",
    "setecientos", "ochocientos", "novecientos", "mil", "millon", "millón", "millones", "y", "punto",
}


def vsm_de_texto(texto):
    """
    Veces el salario mínimo tal como vienen en el documento (con letra): "78.6457 VSMM", "162.9260 VECES EL SALARIO",
    "setenta y ocho punto seis mil cuatrocientos cincuenta y siete veces el salario mínimo". None si no vienen.
    """
    t = str(texto or "")
    m = re.search(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:V\.?\s?S\.?\s?M\.?\s?M\.?|V\.?\s?S\.?\s?M\.?|VECES\s+(?:EL\s+)?(?:SALARIO|S\.\s?M))", t, re.I)
    if m:
        return convertir_vsm_a_letras(m.group(1).replace(",", ""))
    m = re.search(r"((?:[A-Za-zÁÉÍÓÚáéíóúÑñ]+\s+){1,25}?)VECES\s+(?:EL\s+)?SALARIO", t, re.I)
    if m:
        palabras = m.group(1).split()
        # Se toman las palabras de número justo antes de "veces el salario" (debe traer "punto" o ser un número)
        numero = []
        for p in reversed(palabras):
            if p.lower() in _PALABRAS_DE_NUMERO:
                numero.insert(0, p.lower())
            else:
                break
        while numero and numero[0] in ("y", "punto"):
            numero.pop(0)
        if numero and any(p not in ("y", "punto") for p in numero):
            return " ".join(numero)
    return None


# ---------------- Números con letra o romanos -> entero ----------------
_PALABRAS_NUM = {
    "CERO": 0, "UN": 1, "UNO": 1, "UNA": 1, "PRIMER": 1, "PRIMERO": 1, "DOS": 2, "TRES": 3, "CUATRO": 4, "CINCO": 5,
    "SEIS": 6, "SIETE": 7, "OCHO": 8, "NUEVE": 9, "DIEZ": 10, "ONCE": 11, "DOCE": 12, "TRECE": 13, "CATORCE": 14,
    "QUINCE": 15, "DIECISEIS": 16, "DIECISIETE": 17, "DIECIOCHO": 18, "DIECINUEVE": 19, "VEINTE": 20,
    "VEINTIUN": 21, "VEINTIUNO": 21, "VEINTIUNA": 21, "VEINTIDOS": 22, "VEINTITRES": 23, "VEINTICUATRO": 24,
    "VEINTICINCO": 25, "VEINTISEIS": 26, "VEINTISIETE": 27, "VEINTIOCHO": 28, "VEINTINUEVE": 29,
    "TREINTA": 30, "CUARENTA": 40, "CINCUENTA": 50, "SESENTA": 60, "SETENTA": 70, "OCHENTA": 80, "NOVENTA": 90,
    "CIEN": 100, "CIENTO": 100, "DOSCIENTOS": 200, "TRESCIENTOS": 300, "CUATROCIENTOS": 400, "QUINIENTOS": 500,
    "SEISCIENTOS": 600, "SETECIENTOS": 700, "OCHOCIENTOS": 800, "NOVECIENTOS": 900,
}
_ROMANO_VALIDO = re.compile(r"^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")


def _sin_acentos_mayus(t):
    return str(t or "").upper().translate(str.maketrans("ÁÉÍÓÚÜ", "AEIOUU"))


def palabras_a_entero(texto):
    """'DOS MIL DIECIOCHO' -> 2018, 'CIENTO VEINTE' -> 120, '15' -> 15. None si no es un número."""
    t = _sin_acentos_mayus(texto).replace(",", " ").strip()
    if not t:
        return None
    if t.isdigit():
        return int(t)
    total, actual, alguno = 0, 0, False
    for p in t.split():
        if p == "Y":
            continue
        if p == "MIL":
            total += (actual or 1) * 1000
            actual, alguno = 0, True
        elif p in _PALABRAS_NUM:
            actual += _PALABRAS_NUM[p]
            alguno = True
        else:
            return None
    return total + actual if alguno else None


def romano_a_entero(texto):
    """'XXIII' -> 23, 'MMV' -> 2005. None si no es un número romano válido."""
    t = str(texto or "").upper().strip().rstrip(".")
    if not t or not _ROMANO_VALIDO.match(t):
        return None
    valores = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for i, c in enumerate(t):
        v = valores[c]
        total += -v if i + 1 < len(t) and valores[t[i + 1]] > v else v
    return total or None


def cualquier_numero_a_entero(texto):
    """Número con dígitos, con letra o romano."""
    t = str(texto or "").strip()
    if re.fullmatch(r"\d+", t):
        return int(t)
    return romano_a_entero(t) or palabras_a_entero(t)


_PAL_NUM = r"(?:CERO|UNO?|UNA|DOS|TRES|CUATRO|CINCO|SEIS|SIETE|OCHO|NUEVE|DIEZ|ONCE|DOCE|TRECE|CATORCE|QUINCE|DIECI\w+|VEINT\w+|TREINTA|CUARENTA|CINCUENTA|SESENTA|SETENTA|OCHENTA|NOVENTA|CIEN|CIENTO|\w+CIENTOS|QUINIENTOS|MIL|Y)"


def numeros_de_notaria_a_digitos(texto):
    """'NOTARIO PÚBLICO NÚMERO XXIII' o 'NÚMERO CIENTO VEINTE' -> 'NÚMERO 23' / 'NÚMERO 120' (para poder leerlo)."""
    def cambiar(m):
        n = cualquier_numero_a_entero(m.group(2))
        return f"{m.group(1)} {n}" if n else m.group(0)
    texto = re.sub(r"(N[UÚ]M(?:ERO)?\.?|NO\.|N[º°]\.?)\s+([MDCLXVI]{1,8})(?=[\s,\.]|$)", cambiar, texto, flags=re.I)
    texto = re.sub(rf"(N[UÚ]M(?:ERO)?\.?|NO\.|N[º°]\.?)\s+((?:{_PAL_NUM})(?:\s+(?:{_PAL_NUM}))*)(?=[\s,\.]|$)", cambiar, texto, flags=re.I)
    return texto


_MESES_FECHA = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6, "JULIO": 7, "AGOSTO": 8,
    "SEPTIEMBRE": 9, "SETIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12,
    "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8, "SEP": 9, "SEPT": 9, "SET": 9,
    "OCT": 10, "NOV": 11, "DIC": 12,
}
_NOMBRE_MES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
               "octubre", "noviembre", "diciembre"]


def _fecha_en_letra(dia, mes, anio):
    if not (1 <= dia <= 31 and 1 <= mes <= 12 and 1900 <= anio <= 2100):
        return None
    return f"{numero_a_palabras_generico(dia).lower()} de {_NOMBRE_MES[mes]} de {numero_a_palabras_generico(anio).lower()}"


def fecha_estructurada_a_texto(texto):
    """
    Lee la fecha en sus formas comunes y la regresa con letra ("diez de septiembre de dos mil dieciocho"):
    10/09/2018, 2018-09-10, 15/IX/2008, 10-SEP-2018, 10 DE SEPTIEMBRE DE 2018, XV DE MARZO DE MMV,
    DIEZ DE SEPTIEMBRE DEL AÑO DOS MIL DIECIOCHO. None si no la entiende.
    """
    t = re.sub(r"\s+", " ", _sin_acentos_mayus(texto)).strip()
    t = re.sub(r"\b(\d{1,2})\s*(?:O|RO|ER|º|°)\.?(?=\s+DE\b)", r"\1", t)
    m = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", t)
    if m:
        return _fecha_en_letra(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = re.search(r"\b(\d{1,2})\s*[-/\.]\s*(\d{1,2}|[IVX]{1,4}|[A-Z]{3,10})\.?\s*[-/\.]\s*(\d{2,4})\b", t)
    if m:
        mes_txt = m.group(2)
        mes = int(mes_txt) if mes_txt.isdigit() else (romano_a_entero(mes_txt) if re.fullmatch(r"[IVX]+", mes_txt) else _MESES_FECHA.get(mes_txt))
        anio = int(m.group(3))
        if anio < 100:
            anio += 2000 if anio < 50 else 1900
        if mes:
            return _fecha_en_letra(int(m.group(1)), mes, anio)
    meses = "|".join(sorted(_MESES_FECHA, key=len, reverse=True))
    m = re.search(rf"(?:^|\b)([A-Z0-9]+(?:\s+Y\s+[A-Z]+)?)\s+(?:DE\s+|-\s*)?({meses})\.?\s+(?:DE(?:L)?\s+|-\s*)?(?:A[NÑ]O\s+)?"
                  rf"(\d{{4}}|[MDCLXVI]{{2,10}}|(?:DOS\s+MIL|MIL\s+NOVECIENTOS)(?:\s+(?:Y|[A-Z]+))*)\b", t)
    if m:
        dia = cualquier_numero_a_entero(m.group(1))
        mes = _MESES_FECHA.get(m.group(2))
        anio_txt = m.group(3)
        anio = cualquier_numero_a_entero(anio_txt)
        if anio is None and re.match(r"(DOS\s+MIL|MIL\s+NOVECIENTOS)", anio_txt):
            # quitar palabras sobrantes al final ("DOS MIL OCHO ANTE ...")
            palabras = anio_txt.split()
            while palabras and anio is None:
                palabras.pop()
                anio = palabras_a_entero(" ".join(palabras)) if palabras else None
        if dia and mes and anio:
            return _fecha_en_letra(dia, mes, anio)
    return None


def convertir_fecha_texto(texto_fecha):
    if not texto_fecha or str(texto_fecha).upper() in ["NO_ENCONTRADO", "NONE", ""]:
        return "NO_ENCONTRADO"
    estructurada = fecha_estructurada_a_texto(texto_fecha)
    if estructurada:
        return estructurada
    return _convertir_fecha_texto_anterior(texto_fecha)


def _convertir_fecha_texto_anterior(texto_fecha):
    if not texto_fecha or str(texto_fecha).upper() in ["NO_ENCONTRADO", "NONE", ""]:
        return "NO_ENCONTRADO"
    
    texto_upper = re.sub(r'\s+', ' ', str(texto_fecha)).upper().strip()
    # El día 1 se escribe "uno" (no "primero"): "1o", "1ro.", "1er", "1º" se toman como 1
    texto_upper = re.sub(r'\b(\d{1,2})\s*(?:O|RO|ER|º|°)\.?(?=\s+DE\b)', r'\1', texto_upper)
    
    meses = {
        "ENERO": "enero", "FEBRERO": "febrero", "MARZO": "marzo", "ABRIL": "abril",
        "MAYO": "mayo", "JUNIO": "junio", "JULIO": "julio", "AGOSTO": "agosto",
        "SEPTIEMBRE": "septiembre", "OCTUBRE": "octubre", "NOVIEMBRE": "noviembre", "DICIEMBRE": "diciembre"
    }
    
    romanos = {
        'I': '01', 'II': '02', 'III': '03', 'IV': '04', 'V': '05', 'VI': '06',
        'VII': '07', 'VIII': '08', 'IX': '09', 'X': '10', 'XI': '11', 'XII': '12'
    }

    meses_num_map = {
        "01": "enero", "02": "febrero", "03": "marzo", "04": "abril", "05": "mayo", "06": "junio",
        "07": "julio", "08": "agosto", "09": "septiembre", "10": "octubre", "11": "noviembre", "12": "diciembre"
    }

    m_rom = re.search(r'(\d{1,2})[-/]([I|V|X]+)[-/](\d{2,4})', texto_upper)
    if m_rom:
        dia_num = int(m_rom.group(1))
        romano = m_rom.group(2).upper()
        anio_num = m_rom.group(3)
        if len(anio_num) == 2:
            anio_num = "20" + anio_num if int(anio_num) < 50 else "19" + anio_num
        mes_num = romanos.get(romano)
        if mes_num and mes_num in meses_num_map:
            dia_letra = numero_a_palabras_generico(dia_num).lower()
            anio_letra = numero_a_palabras_generico(int(anio_num)).lower()
            return f"{dia_letra} de {meses_num_map[mes_num]} de {anio_letra}"

    match_num = re.search(r'(\d{1,2})[/\.-](\d{1,2})[/\.-](\d{2,4})', texto_upper)
    if match_num:
        d, m, y = match_num.groups()
        if len(y) == 2:
            y = "20" + y if int(y) < 50 else "19" + y
        mes_key = f"{int(m):02d}"
        if mes_key in meses_num_map and 1 <= int(d) <= 31:
            dia_letra = numero_a_palabras_generico(int(d)).lower()
            anio_letra = numero_a_palabras_generico(int(y)).lower()
            return f"{dia_letra} de {meses_num_map[mes_key]} de {anio_letra}"

    numeros_palabras = {
        "UN": 1, "UNO": 1, "PRIMER": 1, "PRIMERO": 1, "DOS": 2, "TRES": 3, "CUATRO": 4, "CINCO": 5,
        "SEIS": 6, "SIETE": 7, "OCHO": 8, "NUEVE": 9, "DIEZ": 10, "ONCE": 11, "DOCE": 12,
        "TRECE": 13, "CATORCE": 14, "QUINCE": 15, "DIECISÉIS": 16, "DIECISEIS": 16, "DIECISIETE": 17,
        "DIECIOCHO": 18, "DIECINUEVE": 19, "VEINTE": 20, "VEINTIUNO": 21, "VEINTIDÓS": 22, "VEINTIDOS": 22,
        "VEINTITRÉS": 23, "VEINTITRES": 23, "VEINTICUATRO": 24, "VEINTICINCO": 25, "VEINTISÉIS": 26, "VEINTISEIS": 26,
        "VEINTISIETE": 27, "VEINTIOCHO": 28, "VEINTINUEVE": 29, "TREINTA": 30, "TREINTA Y UNO": 31
    }

    mes_encontrado = None
    for m_nombre in meses:
        if m_nombre in texto_upper:
            mes_encontrado = meses[m_nombre]
            break

    anio_num = None
    match_anio_num = re.search(r'\b(19\d{2}|20\d{2})\b', texto_upper)
    if match_anio_num:
        anio_num = match_anio_num.group(1)
    else:
        if "DOS MIL VEINTISÉIS" in texto_upper or "DOS MIL VEINTISEIS" in texto_upper: anio_num = "2026"
        elif "DOS MIL VEINTICINCO" in texto_upper: anio_num = "2025"
        elif "DOS MIL VEINTICUATRO" in texto_upper: anio_num = "2024"
        elif "DOS MIL VEINTITRÉS" in texto_upper or "DOS MIL VEINTITRES" in texto_upper: anio_num = "2023"
        elif "DOS MIL VEINTIDÓS" in texto_upper or "DOS MIL VEINTIDOS" in texto_upper: anio_num = "2022"
        elif "DOS MIL VEINTIUNO" in texto_upper: anio_num = "2021"
        elif "DOS MIL VEINTE" in texto_upper: anio_num = "2020"
        elif "DOS MIL DIECINUEVE" in texto_upper: anio_num = "2019"
        elif "DOS MIL DIECIOCHO" in texto_upper: anio_num = "2018"
        elif "DOS MIL DIECISIETE" in texto_upper: anio_num = "2017"
        elif "DOS MIL DIECISÉIS" in texto_upper or "DOS MIL DIECISEIS" in texto_upper: anio_num = "2016"
        elif "DOS MIL QUINCE" in texto_upper: anio_num = "2015"
        elif "DOS MIL CATORCE" in texto_upper: anio_num = "2014"
        elif "DOS MIL TRECE" in texto_upper: anio_num = "2013"
        elif "DOS MIL DOCE" in texto_upper: anio_num = "2012"
        elif "DOS MIL ONCE" in texto_upper: anio_num = "2011"
        elif "DOS MIL DIEZ" in texto_upper: anio_num = "2010"
        elif "DOS MIL NUEVE" in texto_upper: anio_num = "2009"
        elif "DOS MIL OCHO" in texto_upper: anio_num = "2008"
        elif "DOS MIL SIETE" in texto_upper: anio_num = "2007"
        elif "DOS MIL SEIS" in texto_upper: anio_num = "2006"
        elif "DOS MIL CINCO" in texto_upper: anio_num = "2005"
        elif "DOS MIL CUATRO" in texto_upper: anio_num = "2004"
        elif "DOS MIL TRES" in texto_upper: anio_num = "2003"
        elif "DOS MIL DOS" in texto_upper: anio_num = "2002"
        elif "DOS MIL UNO" in texto_upper: anio_num = "2001"
        elif "DOS MIL" in texto_upper: anio_num = "2000"

    dia_num = None
    match_dia_digito = re.search(r'\b(0?[1-9]|[12]\d|3[01])\b', texto_upper)
    if match_dia_digito:
        dia_num = int(match_dia_digito.group(1))
    else:
        for palabra, num in sorted(numeros_palabras.items(), key=lambda x: len(x[0]), reverse=True):
            if re.search(r'\b' + palabra + r'\b', texto_upper):
                dia_num = num
                break

    if dia_num and mes_encontrado and anio_num:
        dia_letra = numero_a_palabras_generico(dia_num).lower()
        anio_letra = numero_a_palabras_generico(int(anio_num)).lower()
        return f"{dia_letra} de {mes_encontrado} de {anio_letra}"

    return texto_fecha

def limpiar_fecha_escritura(fecha_str):
    return convertir_fecha_texto(fecha_str)

# ---------------------------------------------------------------------
# MONTOS escritos de muchas formas en las constancias:
#   $1,250,300.00  $1´250,300.00  $1'250,300.00  $1.800.000.00  $1 250 300.00  $170,869 02 M.N.  $250000
# ---------------------------------------------------------------------
_SEP_MILES = r"[,\.´'’`\s]"
# Con separadores de miles (cualquiera) y centavos opcionales (con punto, coma o espacio)
_MONTO_AGRUPADO = rf"[0-9]{{1,3}}(?:{_SEP_MILES}[0-9]{{3}})+(?:[\.,\s][0-9]{{2}})?(?![0-9])"
# Sin separadores de miles
_MONTO_SIMPLE = r"[0-9]+(?:[\.,][0-9]{1,2})?(?![0-9])"
MONTO_NUMERO = rf"(?:{_MONTO_AGRUPADO}|{_MONTO_SIMPLE})"


def normalizar_monto(texto):
    """'$1´250,300.00' -> 1250300.0 · '$1.800.000.00' -> 1800000.0 · '$170,869 02' -> 170869.02. None si no hay monto."""
    if texto is None:
        return None
    if isinstance(texto, (int, float)):
        return float(texto)
    t = str(texto).replace("$", " ").strip()
    m = re.search(MONTO_NUMERO, t)
    if not m:
        return None
    crudo = m.group(0).strip()
    centavos = ""
    mc = re.search(r"[\.,\s]([0-9]{2})$", crudo)
    # Los últimos dos dígitos son centavos si van después de un separador y antes había un grupo de miles o un entero
    if mc and not re.fullmatch(rf"[0-9]{{1,3}}{_SEP_MILES}[0-9]{{2}}", crudo) or (mc and re.fullmatch(r"[0-9]+[\.,][0-9]{2}", crudo)):
        centavos = mc.group(1)
        crudo = crudo[:mc.start()]
    elif re.fullmatch(r"[0-9]+[\.,][0-9]", crudo):  # "250000.5"
        crudo, centavos = re.split(r"[\.,]", crudo)[0], re.split(r"[\.,]", crudo)[1] + "0"
    enteros = re.sub(r"[^0-9]", "", crudo)
    if not enteros:
        return None
    try:
        return float(f"{int(enteros)}.{centavos or '00'}")
    except ValueError:
        return None


def formatear_monto(texto):
    """Monto con formato '$1,250,300.00'; si no se entiende, regresa el texto como venía."""
    n = normalizar_monto(texto)
    return f"${n:,.2f}" if n is not None else texto


def numero_a_letras(numero):
    """Monto con letra: CIENTO SESENTA Y SIETE MIL OCHOCIENTOS OCHENTA PESOS CON NOVENTA Y SEIS CENTAVOS, MONEDA NACIONAL."""
    val = normalizar_monto(numero)
    if val is None:
        return str(numero)
    enteros = int(val)
    centavos = int(round((val - enteros) * 100))

    if enteros == 0:
        texto_enteros = "CERO PESOS"
    else:
        # "UN MILLÓN DE PESOS" (millones exactos llevan "de")
        moneda = 'PESO' if enteros == 1 else ('DE PESOS' if enteros % 1_000_000 == 0 else 'PESOS')
        texto_enteros = f"{entero_en_letras(enteros, apocope=True)} {moneda}"
    texto_centavos = f"CON {grupo_en_letras(centavos, apocope=True)} CENTAVOS" if centavos > 0 else "CON CERO CENTAVOS"
    return f"{texto_enteros} {texto_centavos}, MONEDA NACIONAL"

# Abreviaturas que vienen en las constancias y cartas -> texto completo
_ABREVIATURAS = [
    (r"\bUNID(?:AD)?\.?\s*HAB(?:ITACIONAL)?\.?(?=\s|,|$)|\bU\.\s?H\.(?=\s|,|$)", "UNIDAD HABITACIONAL"),
    (r"\bSUPER\s*MZA\.?(?=\s|,|$)|\bS\.\s?M\.(?=\s|,|$)|\bSMZA\.?(?=\s|,|$)|\bSMZ\.?(?=\s|,|$)", "SUPERMANZANA"),
    (r"\bMZA?\.?(?=\s|,|$)", "MANZANA"),
    (r"\bLOT\.(?=\s|,|$)|\bLT\.?(?=\s|,|$)", "LOTE"),
    (r"\bCOND\.(?=\s|,|$)|\bCOND(?=\s|,|$)", "CONDOMINIO"),
    (r"\bD(?:E)?PTO\.?(?=\s|,|$)", "DEPARTAMENTO"),
    (r"\bEDIF\.?(?=\s|,|$)|\bEDF\.?(?=\s|,|$)|\bED\.(?=\s|,|$)", "EDIFICIO"),
    (r"\bFRACC?\.?(?=\s|,|$)", "FRACCIONAMIENTO"),
    (r"\bCOL\.(?=\s|,|$)", "COLONIA"),
    (r"\bAVE?\.(?=\s|,|$)", "AVENIDA"),
    (r"\bCDA\.?(?=\s|,|$)", "CERRADA"),
    (r"\bPRIV\.?(?=\s|,|$)", "PRIVADA"),
    (r"\bPROL\.?(?=\s|,|$)", "PROLONGACIÓN"),
    (r"\bBLVD\.?(?=\s|,|$)", "BOULEVARD"),
    (r"\bCALZ\.?(?=\s|,|$)", "CALZADA"),
    (r"\bCJTO\.?(?=\s|,|$)|\bCONJ\.(?=\s|,|$)", "CONJUNTO"),
    (r"\bHAB\.(?=\s|,|$)", "HABITACIONAL"),
    (r"\bVIV\.?(?=\s|,|$)", "VIVIENDA"),
    (r"\bCS\.?(?=\s+\d)", "CASA"),
    (r"\bINT\.(?=\s|,|$)", "INTERIOR"),
    (r"\bEXT\.(?=\s|,|$)", "EXTERIOR"),
    (r"\bN[UÚ]M\.(?=\s|,|$)|\bNO\.(?=\s*\d)", "NÚMERO"),
    (r"\bSECC?\.(?=\s|,|$)", "SECCIÓN"),
    (r"\bRESID?\.(?=\s|,|$)", "RESIDENCIAL"),
    (r"\bMPIO\.?(?=\s|,|$)", "MUNICIPIO"),
    (r"\bEDO\.?\s*(?:DE\s+)?M[EÉ]X\.?(?=\s|,|$)", "ESTADO DE MÉXICO"),
    (r"\bEDO\.(?=\s|,|$)", "ESTADO"),
    (r"\bC\.\s?P\.(?=\s|,|$)", "CÓDIGO POSTAL"),
    (r"\bPTE\.(?=\s|,|$)", "PONIENTE"),
    (r"\bOTE\.(?=\s|,|$)", "ORIENTE"),
    (r"\bNTE\.(?=\s|,|$)", "NORTE"),
    (r"\bETP\.?(?=\s|,|$)", "ETAPA"),
    (r"\bLOC\.(?=\s|,|$)", "LOCALIDAD"),
    (r"\bBO\.(?=\s|,|$)|\bBARR\.(?=\s|,|$)", "BARRIO"),
    (r"\bS\s?/\s?N\b", "SIN NÚMERO"),
]


def expandir_abreviaturas(texto):
    """LOT. 5 COND. LAS FLORES -> LOTE 5 CONDOMINIO LAS FLORES"""
    if not texto:
        return texto
    t = str(texto)
    for patron, completo in _ABREVIATURAS:
        t = re.sub(patron, completo, t, flags=re.I)
    return re.sub(r"\s{2,}", " ", t).strip()


def convertir_inmueble_a_letras(texto_inmueble):
    if not texto_inmueble or texto_inmueble == "NO_ENCONTRADO":
        return texto_inmueble

    mapa_romanos = {
        'I': 'uno', 'II': 'dos', 'III': 'tres', 'IV': 'cuatro', 'V': 'cinco',
        'VI': 'seis', 'VII': 'siete', 'VIII': 'ocho', 'IX': 'nueve', 'X': 'diez',
        'XI': 'once', 'XII': 'doce', 'XIII': 'trece', 'XIV': 'catorce', 'XV': 'quince'
    }

    def reemplazar_romano(match):
        rom = match.group(0).upper()
        return mapa_romanos.get(rom, rom)

    def reemplazar_arabigo(match):
        num_str = match.group(0)
        return numero_a_palabras_generico(num_str).lower()

    texto_procesado = re.sub(r'\b(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)\b', reemplazar_romano, texto_inmueble, flags=re.IGNORECASE)
    texto_procesado = re.sub(r'\b(?!\d{5}\b)\d+\b', reemplazar_arabigo, texto_procesado)

    return texto_procesado

def extraer_oficina_registral(texto):
    match = re.search(r'OFICINA\s+DE\s+["“\']?([^"”\'\n\r]+?)["”\']?\s+INMUEBLES', texto, re.IGNORECASE)
    if not match:
        match = re.search(r'OFICINA\s+REGISTRAL\s*:\s*([A-ZÁÉÍÓÚÑ\s]+)', texto, re.IGNORECASE)
    if not match:
        match = re.search(r'OFICINA\s+REGISTRAL\s+DE\s+["“\']?([^"”\'\n\r]+?)["”\']?(?=\s+INMUEBLES|\n|,|\.|$)', texto, re.IGNORECASE)
    if match:
        val = match.group(1).strip()
        return val.title()
    return "NO_ENCONTRADO"

def armar_ubicacion_inmueble(texto_completo):
    match_seccion = re.search(r'DATOS\s+DE\s+IDENTIFICACIÓN[:\s]*(.*?)(?=DATOS\s+DE\s+REGISTRO|RUMBOS\s+MEDIDAS|INFORMACIÓN\s+COMPLEMENTARIA|VOLANTE|ENTRADA|$)', texto_completo, re.IGNORECASE | re.DOTALL)
    texto_busqueda = match_seccion.group(1) if match_seccion else texto_completo

    palabras_prohibidas = [
        'ninguna', 'ninguno', 'no_encontrado', 'no consta', 'null', 'super', 'trámite', 
        'de', 'del', 'los', 'las', 'el', 'la', 'trabajadores', 'fondo', 'nacional', 'instituto'
    ]

    def extraer_val(patrones):
        for pat in patrones:
            m = re.search(pat, texto_busqueda, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                val_limpio = re.sub(r'^[:\s\-]+|[:\s\-]+$', '', val).strip()
                if val_limpio and val_limpio.lower() not in palabras_prohibidas and len(val_limpio) > 0:
                    return val_limpio
        return ""

    vivienda = extraer_val([r'\bVivienda[:\s#]*([A-Z0-9\-]+)', r'\bdepartamento\s*([0-9A-Z\-]+)'])
    lote = extraer_val([r'\bLote[:\s#]*([A-Z0-9\-]+)'])
    manzana = extraer_val([r'\b(?:Manzana|Mz\.)[:\s#]*([A-Z0-9\-]+)'])
    condominio = extraer_val([r'\bCondominio[:\s#]*([A-Z0-9\- ]+?)(?=\s*(?:CALLE|NO\.|COL|SECTOR|LOTE|MANZANA|$))'])
    sector = extraer_val([r'\b(?:Sector|Edf\.?)[:\s#]*([A-Z0-9\-]+)'])
    colonia = extraer_val([r'\b(?:Colonia|Col\.|Fraccionamiento|Pueblo)[:\s#]*([A-ZÁÉÍÓÚÑ0-9\- ]+?)(?=\s*(?:SECTOR|MUNICIPIO|C\.P\.|CALLE|LOTE|$))'])
    municipio = extraer_val([r'\b(?:Municipio|Alcaldía)[:\s#]*([A-ZÁÉÍÓÚÑ ]+?)(?=\s*(?:DISTRITO|ESTADO|C\.P\.|COLONIA|$))'])
    estado = extraer_val([r'\b(?:Estado|Entidad\s+Federativa)[:\s#]*([A-ZÁÉÍÓÚÑ ]+?)(?=\s*(?:OBSERVACIONES|SUPERFICIE|C\.P\.|MUNICIPIO|$))'])

    elementos = []
    if vivienda:
        v_upper = vivienda.upper()
        if v_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            if "DEPARTAMENTO" in v_upper or "CASA" in v_upper or "VIVIENDA" in v_upper:
                elementos.append(vivienda if v_upper.startswith(("EL ", "LA ")) else f"EL INMUEBLE {vivienda}")
            else:
                elementos.append(f"EL DEPARTAMENTO HABITACIONAL MARCADO CON EL NÚMERO {vivienda}")
    if lote:
        l_upper = lote.upper()
        if l_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            elementos.append(f"CONSTRUIDO SOBRE EL LOTE {lote}")
    if manzana:
        m_upper = manzana.upper()
        if m_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            elementos.append(f"DE LA MANZANA {manzana}")
    if condominio:
        c_upper = condominio.upper()
        if c_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            if "RÉGIMEN" in c_upper or "REGIMEN" in c_upper:
                elementos.append(f"DEL {condominio}")
            else:
                elementos.append(f"DEL RÉGIMEN DE PROPIEDAD EN CONDOMINIO {condominio}")
    if sector:
        s_upper = sector.upper()
        if s_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            elementos.append(sector if "EDIFICIO" in s_upper or "EDF" in s_upper else f"SECTOR EDIFICIO {sector}")
    if colonia:
        co_upper = colonia.upper()
        if co_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            elementos.append(f"UBICADO EN {colonia}")
    if municipio:
        mu_upper = municipio.upper()
        if mu_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            elementos.append(municipio if "MUNICIPIO" in mu_upper else f"EN EL MUNICIPIO DE {municipio}")
    if estado:
        e_upper = estado.upper()
        if e_upper not in ['NO CONSTA', 'NO_ENCONTRADO']:
            elementos.append(estado if "ESTADO" in e_upper else f"ESTADO DE {estado}")

    if not elementos:
        return "NO_ENCONTRADO"
    
    resultado_ubicacion = ", ".join(elementos)
    return convertir_inmueble_a_letras(resultado_ubicacion)

# Nombres de mujer que no terminan en "A" y nombres de hombre que sí terminan en "A"
NOMBRES_FEMENINOS = {
    "ISABEL", "RAQUEL", "BEATRIZ", "CARMEN", "ROCIO", "LUZ", "ESTHER", "ESTER", "INES", "PILAR", "MARIBEL",
    "ARACELI", "ARACELY", "NOEMI", "RUTH", "SOLEDAD", "MERCEDES", "DOLORES", "CONSUELO", "ROSARIO", "GUADALUPE",
    "MARISOL", "ANABEL", "YAZMIN", "JAZMIN", "YASMIN", "ITZEL", "NAYELI", "ARELI", "ARELY", "ANAHI", "BELEN",
    "MIRIAM", "MIRYAM", "CARIDAD", "LOURDES", "IRAIS", "NANCY", "KAREN", "LIZBETH", "ELIZABETH", "IVONNE",
    "YVONNE", "LILIAN", "LILIANA", "MONSERRAT", "MONTSERRAT", "ABIGAIL", "CONCEPCION", "ASUNCION", "SOCORRO",
    "AMPARO", "MARILU", "ZOE", "INGRID", "EDITH", "JUDITH", "RUBI", "SARAHI", "DULCE", "ARIADNE", "BRISEIDA",
    "NOHEMI", "MABEL", "MAYTE", "MARIBETH", "JANET", "JANETH", "LIZ", "GISEL", "GISELLE", "MICHELLE", "NICOLE",
    "ESTEFANI", "STEPHANIE", "ARIEL", "MAGALI", "MAGALY", "NELLY", "ANEL", "YARELI", "DENISSE", "DENISE",
    "BERENICE", "LEONOR", "AURORA", "MARIA", "MA", "MA.", "MARÍA", "ROSAURA", "ENCARNACION", "TRINIDAD",
}
NOMBRES_MASCULINOS = {"BAUTISTA", "LUCA", "JOSHUA", "ELISEA", "JOSE", "JUAN", "J."}


def genero_por_nombre(nombre):
    """FEMENINO / MASCULINO según el nombre de pila del acreditado ('' si no hay nombre).
    El nombre puede venir con los apellidos primero (constancia): se decide por el nombre de pila, no por el apellido."""
    return nombres.genero(nombre)


def determinar_genero_y_estado_civil(texto_completo, nombre_acreditado=""):
    texto_upper = texto_completo.upper()

    # Se decide por el nombre del acreditado. Frases como "a favor del trabajador" o
    # "el acreditado" vienen igual en todas las cartas, así que no sirven para saberlo.
    genero = genero_por_nombre(nombre_acreditado)
    if not genero:
        if re.search(r'\bLA\s+ACREDITADA\b|\bLA\s+TRABAJADORA\b|\bSEÑORA\b|\bCIUDADANA\b', texto_upper):
            genero = "FEMENINO"
        else:
            genero = "NO_ENCONTRADO"

    if re.search(r'\bCASAD[AO]\b|\bSOCIEDAD\s+CONYUGAL\b|\bSEPARACION\s+DE\s+BIENES\b|\bESTADO\s+CIVIL\s*:\s*CASAD', texto_upper):
        estado_civil = "CASADO"
    elif re.search(r'\bSOLTER[AO]\b|\bESTADO\s+CIVIL\s*:\s*SOLTER', texto_upper):
        estado_civil = "SOLTERO"
    else:
        estado_civil = "SOLTERO"

    return genero, estado_civil

def extraer_notario_robusto(texto_limpio, texto_completo=""):
    texto_upper = numeros_de_notaria_a_digitos(texto_limpio.upper())
    candidatos_validos = []

    prohibidas = {
        "ESTADO", "MEXICO", "MÉXICO", "MUNICIPIO", "TOLUCA", "RESIDENCIA", "RESICENCIA", "PRESENTE", 
        "PODER", "REGISTRO", "OFICINA", "INMUEBLES", "PUBLICO", "PÚBLICO", "NOTARIO", "NOTIARIO", 
        "NOTARIA", "NOTARÍA", "LIC", "LICENCIADO", "DE", "DEL", "LA", "LAS", "LOS", "Y", "A", "EN", "CON", 
        "FE", "ANTE", "PASADA", "TESTIMONIO", "ESCRITURA", "PUBLICA", "PÚBLICA", "NO", "QUE", "SE", "HIZO",
        "PRIMER", "SEGUNDO", "TERCER", "INSTRUMENTO", "NUMERO", "NÚMERO", "VOLANTE", "CALIFICADOR", "VIGILANCIA", 
        "ACTO", "A.C.S", "GENERAL", "DISTRITO", "FEDERAL", "JUZGADO", "TRIBUNAL", "FECHA", "COMPRAVENTA"
    }

    patrones = [
        r'NOTI?AR[IÍ][OA]\s+P[UÚ]BLIC[OA]\s+(?:LICENCIAD[OA]|LIC\.?\s+)?([A-ZÁÉÍÓÚÑ\s]{4,45}?)\s*,?\s+(?:N[UÚ]M[EÉ]RO|NO\.?)\s*([0-9]+)\s*,?\s*DEL?\s+([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*,|\s+CON\s+RES|\s+EN\s+LA|\s+QUE|\.|$)',
        r'(?:ANTE\s+LA\s+FE\s+(?:DEL?\s+|DE\s+LA\s+)?)(?:LICENCIAD[OA]|LIC\.?\s+)?([A-ZÁÉÍÓÚÑ\s]{4,45}?)\s*,?\s*NOTI?AR[IÍ][OA]\s+P[UÚ]BLIC[OA]\s+(?:NO\.?|N[UÚ]M[EÉ]RO)?\s*([0-9]+)\s+DEL?\s+([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*,|\s+CON\s+RES|\s+EN\s+LA|\.|$)',
        r'NOTI?AR[IÍ][OA]\s+(?:P[UÚ]BLIC[OA]\s+)?(?:NO\.?|N[UÚ]M[EÉ]RO)?\s*([0-9]+)\s+DEL?\s+([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*,|\s+CON\s+RES|\s+EN\s+LA|\s+EN\s+QUE|\.|$)'
    ]

    for pat in patrones[:2]:
        for match in re.finditer(pat, texto_upper):
            posible_nombre = match.group(1).strip()
            num_notaria = match.group(2).strip()
            jurisdiccion = match.group(3).strip()
            jurisdiccion = re.sub(r'\s+(?:CON|RESIDENCIA|RESICENCIA|EN|DE).*$', '', jurisdiccion).strip()
            
            particulas = {"DE", "DEL", "LA", "LAS", "LOS", "Y"}
            # Las partículas (de, del, la, y) se conservan dentro del nombre: MARIA DE LA LUZ, ESCOBAR Y EZETA
            palabras_n = [p for p in posible_nombre.split() if (p in particulas or p not in prohibidas) and (len(p) > 1 or p == "Y") and not p.isdigit()]
            while palabras_n and palabras_n[0] in particulas:
                palabras_n.pop(0)
            while palabras_n and palabras_n[-1] in particulas:
                palabras_n.pop()
            if palabras_n:
                nombre_limpio = " ".join(palabras_n)
                if "JUAN CARLOS" in nombre_limpio.upper():
                    continue
                
                num_notaria_letra = numero_a_palabras_generico(num_notaria).lower()
                
                sub_texto = texto_upper[match.start():min(len(texto_upper), match.end() + 100)]
                if "ESTADO DE MÉXICO" in sub_texto or "ESTADO DE MEXICO" in sub_texto:
                    jur_fmt = "del Estado de México"
                elif "CIUDAD DE MÉXICO" in sub_texto or "CIUDAD DE MEXICO" in sub_texto or "DISTRITO FEDERAL" in sub_texto:
                    jur_fmt = "de la Ciudad de México"
                else:
                    jurisdiccion_lower = jurisdiccion.lower()
                    if "méxico" in jurisdiccion_lower or "mexico" in jurisdiccion_lower:
                        jur_fmt = "del Estado de México"
                    elif "federal" in jurisdiccion_lower or "ciudad" in jurisdiccion_lower:
                        jur_fmt = "de la Ciudad de México"
                    else:
                        jur_fmt = f"del {jurisdiccion_lower.capitalize()}" if not jurisdiccion_lower.startswith("de") else f"de {jurisdiccion_lower.capitalize()}"

                candidatos_validos.append({
                    "pos": match.start(),
                    "texto": f"{nombre_limpio} Notario Público número {num_notaria_letra} {jur_fmt}"
                })

    if not [c for c in candidatos_validos if "JUAN CARLOS" not in c["texto"].upper()]:
        for match_not in re.finditer(patrones[2], texto_upper):
            num_notaria = match_not.group(1).strip()
            jurisdiccion = match_not.group(2).strip()
            jurisdiccion = re.sub(r'\s+(?:CON|RESIDENCIA|RESICENCIA|EN|DE).*$', '', jurisdiccion).strip()
            
            inicio_pos = max(0, match_not.start() - 250)
            bloque_anterior = texto_upper[inicio_pos:match_not.start()]
            
            palabras_validas = []
            # Si viene "LIC. MARIA DE LA LUZ ROJAS, NOTARIA ...", el nombre es lo que está entre LIC. y NOTARIA
            m_lic = re.search(r'LIC(?:ENCIAD[OA])?\.?\s+([A-ZÁÉÍÓÚÑ\s]{4,60}?)\s*,?\s*$', bloque_anterior)
            if m_lic:
                particulas = {"DE", "DEL", "LA", "LAS", "LOS", "Y"}
                palabras_validas = [p for p in m_lic.group(1).split() if p in particulas or p not in prohibidas]
                while palabras_validas and palabras_validas[0] in particulas:
                    palabras_validas.pop(0)
                while palabras_validas and palabras_validas[-1] in particulas:
                    palabras_validas.pop()
            if not palabras_validas:
                palabras = re.findall(r'\b[A-ZÁÉÍÓÚÑ]{3,}\b', bloque_anterior)
                for p in reversed(palabras):
                    if p not in prohibidas and not p.isdigit():
                        palabras_validas.insert(0, p)
                        if len(palabras_validas) >= 4:
                            break
            
            if palabras_validas:
                nombre_notario = " ".join(palabras_validas)
                if "JUAN CARLOS" in nombre_notario.upper():
                    continue
                
                num_notaria_letra = numero_a_palabras_generico(num_notaria).lower()
                
                sub_texto = texto_upper[match_not.start():min(len(texto_upper), match_not.end() + 100)]
                if "ESTADO DE MÉXICO" in sub_texto or "ESTADO DE MEXICO" in sub_texto:
                    jur_fmt = "del Estado de México"
                elif "CIUDAD DE MÉXICO" in sub_texto or "CIUDAD DE MEXICO" in sub_texto or "DISTRITO FEDERAL" in sub_texto:
                    jur_fmt = "de la Ciudad de México"
                else:
                    jurisdiccion_lower = jurisdiccion.lower()
                    if "méxico" in jurisdiccion_lower or "mexico" in jurisdiccion_lower:
                        jur_fmt = "del Estado de México"
                    elif "federal" in jurisdiccion_lower or "ciudad" in jurisdiccion_lower:
                        jur_fmt = "de la Ciudad de México"
                    else:
                        jur_fmt = f"del {jurisdiccion_lower.capitalize()}" if not jurisdiccion_lower.startswith("de") else f"de {jurisdiccion_lower.capitalize()}"

                candidatos_validos.append({
                    "pos": match_not.start(),
                    "texto": f"{nombre_notario} Notario Público número {num_notaria_letra} {jur_fmt}"
                })

    candidatos_validos = [c for c in candidatos_validos if "JUAN CARLOS" not in c["texto"].upper()]

    texto_resultado = "NO_ENCONTRADO"
    if candidatos_validos:
        candidatos_validos.sort(key=lambda x: x["pos"])
        texto_resultado = candidatos_validos[-1]["texto"]

    if texto_completo:
        sup_upper = texto_completo.upper()
        menciones_extra = []
        if "PATRIMONIO INMUEBLE FEDERAL" in sup_upper:
            menciones_extra.append("Patrimonio Inmueble Federal")
        elif "INMOBILIARIO FEDERAL" in sup_upper:
            menciones_extra.append("Inmobiliario Federal")
        if menciones_extra and (" NACIONAL" in sup_upper or "DEL NACIONAL" in sup_upper):
            if "nacional" not in str(texto_resultado).lower():
                menciones_extra.append("Nacional")
        
        if menciones_extra and texto_resultado != "NO_ENCONTRADO":
            texto_resultado += f", {', '.join(menciones_extra)}"

    return formatear_notario(texto_resultado)


_PALABRAS_MINUSCULA = {"DE", "DEL", "LA", "LAS", "LOS", "Y", "E", "VON", "VAN"}


def nombre_propio(nombre):
    """JUAN PEREZ DE LA ROSA -> Juan Perez de la Rosa"""
    palabras = str(nombre or "").split()
    res = []
    for i, p in enumerate(palabras):
        up = p.upper()
        if i > 0 and up in _PALABRAS_MINUSCULA:
            res.append(p.lower())
        else:
            res.append("-".join(x[:1].upper() + x[1:].lower() for x in p.split("-")))
    return " ".join(res)


def acentos_notario(texto):
    """
    Palabras fijas del notario con sus acentos y siempre «Notario Público» (también si es licenciada):
      'de la Licenciada Ana Soto, Notaria Publica numero cinco del Estado de Mexico'
      -> 'de la Licenciada Ana Soto, Notario Público número cinco del Estado de México'
    """
    t = str(texto or "")
    if not t or t.upper() == "NO_ENCONTRADO":
        return texto
    t = re.sub(r"\bNotari[oa]\s+P[uú]blic[oa]\b", "Notario Público", t)
    t = re.sub(r"\bn[uú]mero\b", "número", t)
    t = re.sub(r"\bM[eé]xico\b", "México", t)
    t = re.sub(r"\bLicenciad([oa])\b", r"Licenciad\1", t)
    return t


def formatear_notario(texto):
    """
    Deja el notario listo para la plantilla ("ante la fe {{ notario_origen_completo }}"):
      del Licenciado Jorge Valdes Ramirez, Notario Público número veinticuatro del Estado de México
      de la Licenciada Ana Luisa Martinez Soto, Notario Público número ochenta y ocho del Estado de México
    (si es mujer cambia a «de la Licenciada», pero el cargo se queda «Notario Público»).
    Si ya tiene ese formato (o no se reconoce), solo se le ponen los acentos.
    """
    t = " ".join(str(texto or "").split())
    if not t or t.upper() == "NO_ENCONTRADO":
        return texto
    if re.match(r"^(del\s+licenciad[oa]|de\s+la\s+licenciad[oa])\b", t, re.I):
        return acentos_notario(t)
    m = re.search(r"\bNOTARI[OA]\s+P[UÚ]BLIC[OA]\b", t, re.I)
    if not m:
        return acentos_notario(t)
    nombre = t[:m.start()].strip(" ,.-")
    resto = t[m.start():].strip()
    nombre = re.sub(r"^(?:EL\s+|LA\s+)?(?:LICENCIAD[OA]|LIC\.?)\s*", "", nombre, flags=re.I).strip(" ,.")
    if not nombre or len(nombre.split()) < 2:
        return acentos_notario(t)
    mujer = genero_por_nombre(nombre) == "FEMENINO"
    resto = re.sub(r"^NOTARI[OA]\s+P[UÚ]BLIC[OA]", "Notario Público", resto, flags=re.I)
    titulo = "de la Licenciada" if mujer else "del Licenciado"
    return acentos_notario(f"{titulo} {nombre_propio(nombre)}, {resto}")

# Encabezado y pie que pone el navegador al imprimir la consulta del IFREM a PDF:
#   "2/10/26, 4:19 p.m."  "nt.ifrem.gob.mx/portal/...?linea=..."  "https://nt.ifrem.gob.mx/..."  "1/2"
_FECHA_NAVEGADOR = r"\d{1,2}/\d{1,2}/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?"
_URL_PORTAL = r"(?:https?://)?[\w.-]*ifrem\.gob\.mx/\S*"
_CONTADOR_PAGINA = r"\d{1,3}\s*/\s*\d{1,3}"


def quitar_encabezados_navegador(texto: str) -> str:
    """Quita del texto la fecha, el link y el número de página que imprime el navegador en cada hoja."""
    if not texto:
        return texto
    lineas = texto.split("\n")
    salida = []
    anterior_era_basura = False
    for linea in lineas:
        limpia = linea.strip()
        resto = re.sub(_URL_PORTAL, " ", limpia, flags=re.I)
        hubo_url = resto != limpia
        resto = re.sub(rf"^\s*{_FECHA_NAVEGADOR}", " ", resto, flags=re.I)
        hubo_fecha = resto.strip() != re.sub(_URL_PORTAL, " ", limpia, flags=re.I).strip()
        if hubo_url or hubo_fecha:
            resto = re.sub(rf"\s+{_CONTADOR_PAGINA}\s*$", " ", resto)
        resto = resto.strip()
        # Línea que solo traía el contador de página ("1/2") justo después del link
        if anterior_era_basura and re.fullmatch(_CONTADOR_PAGINA, limpia):
            continue
        if (hubo_url or hubo_fecha) and not resto:
            anterior_era_basura = True
            continue
        if hubo_url:
            salida.append(resto)
            anterior_era_basura = True
            continue
        salida.append(linea)
        anterior_era_basura = False
    return "\n".join(salida)


def extraer_datos_pdf(ruta_pdf):
    datos = {
        "numero_carta": "NO_ENCONTRADO",
        "fecha_expedicion": "NO_ENCONTRADO",
        "numero_credito": "NO_ENCONTRADO",
        "numero_credito_letras": "NO_ENCONTRADO",
        "nombre_acreditado": "NO_ENCONTRADO",
        "monto_credito": "NO_ENCONTRADO",
        "monto_credito_letras": "NO_ENCONTRADO",
        "credito_a_salario": "",
        "credito_a_salario_letras": "NO_ENCONTRADO",
        "entidad_financiera": "NO_ENCONTRADO",
        "fecha_liquidacion": "NO_ENCONTRADO",
        "folio_real": "NO_ENCONTRADO",
        "oficina_registral": "NO_ENCONTRADO",
        "datos_inmueble": "NO_ENCONTRADO",
        "genero": "NO_ENCONTRADO",
        "estado_civil": "NO_ENCONTRADO",
        "numero_escritura": "NO_ENCONTRADO",
        "fecha_escritura": "NO_ENCONTRADO",
        "notario_origen_completo": "NO_ENCONTRADO",
        "tiene_conyuge": "NO_ENCONTRADO",
    }

    try:
        doc = fitz.open(ruta_pdf)
        texto_completo = ""
        paginas_texto = []
        for pagina in doc:
            texto_pagina = quitar_encabezados_navegador(pagina.get_text())
            paginas_texto.append(texto_pagina)
            texto_completo += texto_pagina + "\n"
        doc.close()
        datos["texto_raw"] = texto_completo
    except Exception as e:
        print(f"Error al abrir PDF {ruta_pdf}: {e}")
        return datos

    nombre_archivo = os.path.basename(ruta_pdf)
    texto_limpio = " ".join(texto_completo.split())

    # 1. NÚMERO DE CRÉDITO
    match_credito = re.search(r'(?:Crédito|Cuenta|Finiquito|Contrato)(?:\s+con)?(?:\s+n[uú]mero)?[:\s#]*(\d{8,12})', texto_limpio, re.IGNORECASE)
    raw_credito = None
    if match_credito:
        raw_credito = match_credito.group(1).strip()
    else:
        match_nombre = re.search(r'(\d{8,12})', nombre_archivo)
        if match_nombre:
            raw_credito = match_nombre.group(1)

    if raw_credito:
        datos["numero_credito"] = raw_credito
        datos["numero_credito_letras"] = credito_a_letras(raw_credito)

    # 2. NÚMERO DE CARTA Y FECHA DE EXPEDICIÓN
    match_carta = re.search(r'Número\s+de\s+carta[:\s#]*([A-Z0-9\-\/]{5,20})', texto_limpio, re.IGNORECASE)
    if not match_carta:
        match_carta = re.search(r'(?:Carta\s*(?:de\s*Instrucción)?|Oficio|Instrucción|Ref)[:\s\.\°\#-]*([A-Z0-9\-\/]{5,20})', texto_limpio, re.IGNORECASE)
    if match_carta:
        val = match_carta.group(1).strip()
        if val.lower() not in ['de', 'del', 'para', 'con', 'que', 'por', 'ext']:
            datos["numero_carta"] = val

    patrones_fecha_exp = [
        r'(?:Fecha\s+de\s+expedici[óo]n|Expedid[oa]\s+el|M[ée]xico,?\s*(?:D\.?F\.?|CDMX)?,?\s*a|Ciudad\s+de\s+M[ée]xico,?\s*a|A)\s*[:\s]*([0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4}|[0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4}|[A-ZÁÉÍÓÚÑ\s]+\d{,2}\s+DÍAS?[^,\.]*)',
        r'(?:a\s+los|a)\s+([0-9]{1,2}\s+d[ií]as?\s+del?\s+mes\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+del?\s+a[nñ]o\s+[0-9]{4}|[0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4})',
        r'([0-9]{1,2}\s+de\s+(?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+de\s+\d{4})'
    ]
    for patron in patrones_fecha_exp:
        match_fecha_exp = re.search(patron, texto_completo, re.IGNORECASE)
        if match_fecha_exp:
            raw_exp = match_fecha_exp.group(1).strip()
            limpia_exp = convertir_fecha_texto(raw_exp)
            if limpia_exp and limpia_exp != "NO_ENCONTRADO":
                datos["fecha_expedicion"] = limpia_exp
                break

    # 3. MONTO DEL CRÉDITO Y VSM
    texto_credito = ""
    match_acta_credito = re.search(
        r'(?:A\.?C\.?S\.?|APERTURA\s+DE\s+CREDITO|MUTUO|CREDITO\s+HIPOTECARIO|OTORGAMIENTO\s+DE\s+CREDITO)(.*?)(?=GRAVAMENES|ANTECEDENTE|VOLANTE|C\.V\.|$)',
        texto_limpio,
        re.IGNORECASE | re.DOTALL
    )
    if match_acta_credito:
        texto_credito = match_acta_credito.group(1)
    else:
        texto_credito = texto_limpio

    vsm = vsm_de_texto(texto_credito)
    if vsm:
        datos["credito_a_salario"] = vsm

    match_monto_cred = re.search(
        r'(?:IMPORTE\s+(?:DE\s+LA\s+OBLIGACI[OÓ]N\s+GARANTIZADA|DEL\s+CR[EÉ]DITO)?[:\s]*|CANTIDAD\s+DE\s*|CR[EÉ]DITO\s+HASTA\s+POR\s+LA\s+CANTIDAD\s+DE\s*)\$\s*(' + MONTO_NUMERO + ')',
        texto_credito,
        re.IGNORECASE
    )
    monto_raw = None
    if match_monto_cred:
        monto_raw = match_monto_cred.group(1)
    else:
        match_monto_gen = re.search(r'\$\s*(' + MONTO_NUMERO + ')', texto_credito, re.IGNORECASE)
        if match_monto_gen:
            monto_raw = match_monto_gen.group(1)

    if monto_raw and normalizar_monto(monto_raw) is not None:
        try:
            num = normalizar_monto(monto_raw)
            datos["monto_credito"] = f"${num:,.2f}"
            datos["monto_credito_letras"] = numero_a_letras(num)
            
            # Las veces salario NO se calculan con el monto: solo se toman si el documento las trae
        except Exception:
            datos["monto_credito"] = monto_raw
            datos["monto_credito_letras"] = monto_raw

    # 4. ENTIDAD FINANCIERA
    if "INFONAVIT" in texto_limpio.upper() or "FONDO NACIONAL DE LA VIVIENDA" in texto_limpio.upper():
        datos["entidad_financiera"] = "INFONAVIT"
    elif "FOVISSSTE" in texto_limpio.upper():
        datos["entidad_financiera"] = "FOVISSSTE"
    elif "BANAMEX" in texto_limpio.upper() or "CITIBANAMEX" in texto_limpio.upper():
        datos["entidad_financiera"] = "BANAMEX"
    elif "BANORTE" in texto_limpio.upper():
        datos["entidad_financiera"] = "BANORTE"

    # 5. FOLIO REAL ELECTRÓNICO
    match_folio = re.search(r'(?:FOLIO\s+REAL\s+ELECTRÓNICO\s+NUMERO|FOLIO\s+REAL\s+ELECTRÓNICO|FOLIO\s+ELECTRÓNICO)[:\s#]*([0-9A-Z\-]{4,15})', texto_limpio, re.IGNORECASE)
    if not match_folio:
        match_folio = re.search(r'(?:Folio\s*Real|Antecedente|F\.R\.|F\.E\.)[:\s#]*([0-9A-Z\-]{4,15})', texto_limpio, re.IGNORECASE)
    if match_folio:
        val = match_folio.group(1).strip()
        if val.lower() not in ['sreales', 'real', 'registral', 'electronico', 'numero']:
            folio_limpio = limpiar_ceros_izquierda(val)
            if folio_limpio.isdigit():
                datos["folio_real"] = numero_a_palabras_generico(folio_limpio).lower()
            else:
                datos["folio_real"] = folio_limpio

    # 6. NOMBRE DEL ACREDITADO
    patrones_acreditado = [
        r'(?:trabajador|acreditado|deudor)\s+((?:J\.\s*)?[A-ZÁÉÍÓÚÑ\s]{8,50}?)(?=\s+para|\s+gravando|\s+con|\s+cumpli|\s+ha|\.|\,)',
        r'a\s+favor\s+del?\s+((?:J\.\s*)?[A-ZÁÉÍÓÚÑ\s]{8,50}?)(?=\s+para|\s+gravando|\s+con|\.|\,)',
        r'(?:Acreditado\(a\)|Acreditado|Titular|Cliente)[:\s]+([A-ZÁÉÍÓÚÑ\s]{8,50})(?=\s+(?:y/o|con|S\.A\.|RFC|CURP|Crédito|Fecha|\d))',
        r'(?:Acreditado|Titular)[:\s]*\n+([A-ZÁÉÍÓÚÑ\s]{8,50})'
    ]

    palabras_invalidas = ["TRAMITE", "LIBERACION", "CANCELACION", "INMUEBLE", "CREDITO", "INFONAVIT"]

    for patron in patrones_acreditado:
        coincidencia = re.search(patron, texto_completo, re.IGNORECASE)
        if coincidencia:
            nombre = coincidencia.group(1).strip()
            nombre_limpio = " ".join(nombre.split())
            if not any(palabra in nombre_limpio.upper() for palabra in palabras_invalidas) and len(nombre_limpio) > 5:
                datos["nombre_acreditado"] = nombre_limpio
                break

    # 7. FECHA DE LIQUIDACIÓN / PAGO
    match_fecha_pago = re.search(r'(?:saldo\s+deudor.*?:?|a\s+partir\s+de|liquidad[oa]\s+el|pagad[oa]\s+el|fecha\s+de\s+pago)[:\s]*([0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4}|[0-9]{1,2}[/\-][0-9]{1,2}[/\-][0-9]{2,4}|[A-ZÁÉÍÓÚÑ\s]+DÍAS?[^,\.]*)', texto_completo, re.IGNORECASE)
    if match_fecha_pago:
        raw_pago = match_fecha_pago.group(1).strip()
        limpia_pago = convertir_fecha_texto(raw_pago)
        if limpia_pago and limpia_pago != "NO_ENCONTRADO":
            datos["fecha_liquidacion"] = limpia_pago
    else:
        fechas = re.findall(r'(\d{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+\d{4})', texto_completo, re.IGNORECASE)
        if len(fechas) > 1:
            datos["fecha_liquidacion"] = convertir_fecha_texto(fechas[1].strip())
        elif fechas:
            datos["fecha_liquidacion"] = convertir_fecha_texto(fechas[0].strip())

    # 8. OFICINA REGISTRAL Y UBICACIÓN DEL INMUEBLE
    datos["oficina_registral"] = extraer_oficina_registral(texto_completo)
    datos["datos_inmueble"] = armar_ubicacion_inmueble(texto_completo)

    # 9. DETERMINAR GÉNERO Y ESTADO CIVIL
    genero, estado_civil = determinar_genero_y_estado_civil(texto_completo, datos.get("nombre_acreditado", ""))
    datos["genero"] = genero
    datos["estado_civil"] = estado_civil

    # 10. ANTECEDENTES
    import actos_ifrem  # el mismo lector que se usa en los actos de la constancia
    val_esc = actos_ifrem.numero_escritura_de_texto(texto_limpio)
    if val_esc:
        datos["numero_escritura"] = numero_a_palabras_generico(val_esc).lower()

    patrones_fecha = [
        r'de\s+fecha\s+([0-9]{1,2}[-/][0-9A-Za-z]+[-/][0-9]{4})',
        r'de\s+fecha\s+([0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4})',
        r'fecha\s+([0-9]{1,2}[-/][0-9A-Za-z]+[-/][0-9]{4})',
        r'fecha\s+([0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4})',
        r'de\s+fecha\s+([A-ZÁÉÍÓÚÑ\s]+\d{,2}\s+DÍAS?[^,\.]*)',
        r'(?:celebrada|otorgada|suscrita)\s+el\s+([0-9]{1,2}\s+de\s+[a-zA-ZÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4})'
    ]
    for pat in patrones_fecha:
        match_f_esc = re.search(pat, texto_limpio, re.IGNORECASE)
        if match_f_esc:
            fecha_bruta = match_f_esc.group(1).strip()
            fecha_limpia = convertir_fecha_texto(fecha_bruta)
            if fecha_limpia and fecha_limpia != "NO_ENCONTRADO":
                datos["fecha_escritura"] = fecha_limpia
                break

    datos["notario_origen_completo"] = extraer_notario_robusto(texto_limpio, texto_completo)

    tiene_conyuge_match = bool(re.search(r'(C[ÓO]NYUGE|SOCIEDAD\s+CONYUGAL|CASAD[AO]\s+EN\s+SOCIEDAD|EN\s+COPROPIEDAD)', texto_limpio, re.IGNORECASE))
    datos["tiene_conyuge"] = "Sí" if tiene_conyuge_match else "No"

    # Qué documento es (cada dato se toma solo del documento que le corresponde)
    datos["_tipo_documento"] = tipo_documento(texto_completo, nombre_archivo)

    # Actos de la constancia del IFREM (para tomar los datos del acto correcto)
    try:
        import actos_ifrem
        if datos["_tipo_documento"] == "constancia" and actos_ifrem.parece_constancia_ifrem(texto_completo):
            datos["_actos"] = actos_ifrem.dividir_actos(paginas_texto)
            datos["_propietarios"] = actos_ifrem.propietarios_primera_pagina(paginas_texto[0] if paginas_texto else "")
    except Exception as e:
        print(f"No se pudieron separar los actos de {ruta_pdf}: {e}")

    return datos


def tipo_documento(texto_completo, nombre_archivo=""):
    """'carta' (carta de instrucción) o 'constancia' (constancia de folio / antecedente)."""
    t = str(texto_completo or "").upper()
    n = str(nombre_archivo or "").upper()
    try:
        import actos_ifrem
        if actos_ifrem.parece_constancia_ifrem(texto_completo):
            return "constancia"
    except Exception:
        pass
    if "CARTA DE INSTRUCCI" in t or re.search(r"N[UÚ]MERO\s+DE\s+CARTA", t):
        return "carta"
    if "CONSTANCIA" in n or "ANTECEDENTE" in n or "FOLIO" in n:
        return "constancia"
    if "CARTA" in n:
        return "carta"
    return "constancia"


# De qué documento sale cada dato
CAMPOS_DE_CARTA = {
    "fecha_expedicion", "numero_carta", "fecha_liquidacion", "numero_credito", "numero_credito_letras",
    "entidad_financiera",
    # El nombre se toma primero de la carta solo como respaldo: si la constancia del IFREM trae
    # el acto (deudor / comprador) o la tabla de propietarios, ese nombre lo reemplaza (main.aplicar_acto_elegido).
    # En antecedentes que no son del IFREM (escrituras escaneadas) el texto libre da nombres equivocados.
    "nombre_acreditado",
}
CAMPOS_DE_CONSTANCIA = {
    "monto_credito", "monto_credito_letras", "credito_a_salario", "datos_inmueble",
    "folio_real", "oficina_registral", "tiene_conyuge", "nombre_conyuge", "numero_escritura",
    "fecha_escritura", "notario_origen_completo", "estado_civil",
    "texto_raw",  # el desglose del inmueble se arma con el texto de la constancia
}
# Datos que pueden venir en cualquiera de los dos documentos (por ahora ninguno: las veces salario son de la constancia)
CAMPOS_DE_CUALQUIERA = set()
# Si no vienen en su documento, se pueden tomar del otro (son el mismo dato en los dos)
CAMPOS_CON_RESPALDO = {"numero_credito", "numero_credito_letras", "entidad_financiera", "nombre_acreditado"}

def combinar_datos_pareja(datos_lista):
    """
    Junta los datos de la carta y de la constancia. Cada dato se toma SOLO de su documento:
    de la carta: fecha de expedición, número de carta, fecha de liquidación, número de crédito y entidad;
    de la constancia: todo lo demás (inmueble, folio, oficina, escritura, notario, monto, cónyuge…).
    Si falta uno de los documentos, sus datos NO se toman del otro (p. ej. el inmueble nunca sale de la carta),
    salvo los que son el mismo dato en los dos (crédito, entidad, nombre).
    """
    cartas = [d for d in datos_lista if d.get("_tipo_documento") == "carta"]
    constancias = [d for d in datos_lista if d.get("_tipo_documento") != "carta"]

    def fuentes(campo):
        if campo in CAMPOS_DE_CARTA:
            return cartas
        if campo in CAMPOS_DE_CONSTANCIA and campo not in CAMPOS_DE_CUALQUIERA:
            return constancias
        return datos_lista

    datos_finales = {
        "numero_carta": "NO_ENCONTRADO",
        "fecha_expedicion": "NO_ENCONTRADO",
        "numero_credito": "NO_ENCONTRADO",
        "numero_credito_letras": "NO_ENCONTRADO",
        "nombre_acreditado": "NO_ENCONTRADO",
        "monto_credito": "NO_ENCONTRADO",
        "monto_credito_letras": "NO_ENCONTRADO",
        "credito_a_salario": "",
        "entidad_financiera": "NO_ENCONTRADO",
        "fecha_liquidacion": "NO_ENCONTRADO",
        "folio_real": "NO_ENCONTRADO",
        "oficina_registral": "NO_ENCONTRADO",
        "datos_inmueble": "NO_ENCONTRADO",
        "numero_escritura": "NO_ENCONTRADO",
        "fecha_escritura": "NO_ENCONTRADO",
        "notario_origen_completo": "NO_ENCONTRADO",
        "tiene_conyuge": "NO_ENCONTRADO",
        "nombre_conyuge": "NO_ENCONTRADO"
    }
    
    def valido(v):
        val = str(v).strip()
        return val and val != "NO_ENCONTRADO" and val.lower() not in ['de', 'sreales', 'folio', 'carta', 'real']

    claves = {k for d in datos_lista for k in d if not str(k).startswith("_")}
    for k in claves:
        lista = fuentes(k)
        valores = [str(d[k]).strip() for d in lista if k in d and valido(d[k])]
        if not valores and k in CAMPOS_CON_RESPALDO:
            valores = [str(d[k]).strip() for d in datos_lista if k in d and valido(d[k])]
        if valores:
            datos_finales[k] = max(valores, key=len)

    # Para elegir al acreditado entre las personas de la constancia se usa el nombre de la carta
    nombres_carta = [str(d.get("nombre_acreditado", "")).strip() for d in cartas if valido(d.get("nombre_acreditado", ""))]
    datos_finales["_nombre_carta"] = nombres_carta[0] if nombres_carta else ""
    datos_finales["_propietarios"] = [p for d in constancias for p in (d.get("_propietarios") or [])]

    # El género sale del nombre del acreditado ya combinado (antes ganaba el texto más largo: "MASCULINO")
    genero = genero_por_nombre(datos_finales.get("nombre_acreditado"))
    if genero:
        datos_finales["genero"] = genero
    # Si algún documento dice que está casado(a), eso pesa más que el "soltero" por omisión
    civiles = [str(d.get("estado_civil", "")).upper() for d in (constancias or datos_lista)]
    if "CASADO" in civiles:
        datos_finales["estado_civil"] = "CASADO"

    return datos_finales

_CONSENTIMIENTO = re.compile(r"consentimiento\s+de\s+su\s+c[óo]nyuge", re.I)


def _parrafos(documento):
    for p in documento.paragraphs:
        yield p
    for tabla in documento.tables:
        for fila in tabla.rows:
            for celda in fila.cells:
                yield from celda.paragraphs


def completar_conyuge_en_documento(documento, conyuge):
    """
    Donde la plantilla dice "con el consentimiento de su cónyuge" sin el nombre, se agrega:
      "... de su cónyuge sobre el inmueble"   -> "... de su cónyuge el señor ARTURO ESCALONA MACEDO, sobre el inmueble"
      "... de su cónyuge, sobre el inmueble"  -> "... de su cónyuge, la señora ANA LOPEZ RUIZ, sobre el inmueble"
    Si ya trae el nombre (o "el señor/la señora ..."), no se toca. Regresa cuántas veces se agregó.
    """
    conyuge = " ".join(str(conyuge or "").split())
    if not conyuge or conyuge.upper() == "NO_ENCONTRADO":
        return 0
    tratamiento = "la señora" if nombres.genero(conyuge) == "FEMENINO" else "el señor"
    apellido = nombres._clave(conyuge.split()[-1])
    agregados = 0
    for p in _parrafos(documento):
        runs = p.runs
        texto = "".join(r.text for r in runs)
        if not _CONSENTIMIENTO.search(texto):
            continue
        for m in reversed(list(_CONSENTIMIENTO.finditer(texto))):
            despues = texto[m.end():m.end() + 140]
            if apellido and apellido in nombres._clave(despues):
                continue  # ya trae el nombre
            if re.match(r"\s*,?\s*(?:el|la)\s+(?:se[ñn]or(?:a)?|C\.|ciudadan[oa])\b", despues, re.I):
                continue
            pos = m.end()
            if despues.startswith(","):
                pos += 1
            resto = texto[pos:].lstrip()
            final = "" if (not resto or resto[0] in ".;:,") else ","
            insercion = f" {tratamiento} {conyuge}{final}"
            # se mete en el renglón (run) donde termina la palabra "cónyuge" (o la coma)
            inicio = 0
            for r in runs:
                fin = inicio + len(r.text)
                if inicio <= pos <= fin and (pos < fin or r is runs[-1] or fin > inicio):
                    corte = pos - inicio
                    r.text = r.text[:corte] + insercion + r.text[corte:]
                    agregados += 1
                    break
                inicio = fin
            texto = "".join(r.text for r in runs)
    return agregados


def generar_word_cancelacion(ruta_plantilla, datos, ruta_salida):
    if not os.path.exists(ruta_plantilla):
        ruta_plantilla_alt = os.path.join("templates", "plantilla_manera2.docx")
        if os.path.exists(ruta_plantilla_alt):
            ruta_plantilla = ruta_plantilla_alt
        else:
            print(f"ADVERTENCIA: No se encontró la plantilla en {ruta_plantilla}")
            return False

    doc = DocxTemplate(ruta_plantilla)
    
    folio_raw = str(datos.get("folio_real", "")).strip()
    folio_limpio = limpiar_ceros_izquierda(folio_raw) if folio_raw and folio_raw != "NO_ENCONTRADO" else ""

    credito_raw = str(datos.get("numero_credito", "")).strip()
    if credito_raw and credito_raw != "NO_ENCONTRADO":
        credito_texto = credito_raw if ('"' in credito_raw or '(' in credito_raw) else credito_a_letras(credito_raw)
    else:
        credito_texto = ""

    monto_raw = str(datos.get("monto_credito", "")).strip()
    # El monto con letra que se ve en pantalla (el sistema lo calcula y se puede corregir a mano)
    monto_letras = str(datos.get("monto_letras") or datos.get("monto_credito_letras") or "").strip()
    
    if monto_raw and monto_raw != "NO_ENCONTRADO":
        if not monto_letras or monto_letras == "NO_ENCONTRADO":
            monto_letras = numero_a_letras(monto_raw)
        monto_texto = f"{monto_raw} M.N. ({monto_letras})"
    else:
        monto_texto = ""

    def obtener_valor(clave):
        val = str(datos.get(clave, "")).strip()
        if not val or val == "NO_ENCONTRADO" or val.lower() in ['l', 'no', 'no_encontrado', 'null']:
            return ""
        return val

    datos_inmueble_val = convertir_inmueble_a_letras(obtener_valor("datos_inmueble"))
    # Sin «:» en los datos del inmueble ("Manzana: 15" -> "Manzana 15"), también en expedientes guardados antes
    datos_inmueble_val = re.sub(r"\s{2,}", " ", re.sub(r"\s*:\s*", " ", datos_inmueble_val)).strip()

    context = {
        "numero_carta": obtener_valor("numero_carta"),
        "fecha_expedicion": obtener_valor("fecha_expedicion"),
        "crédito_a_salario": obtener_valor("credito_a_salario"),
        "credito_a_salario": obtener_valor("credito_a_salario"),
        "numero_credito": credito_texto,
        "nombre_acreditado": obtener_valor("nombre_acreditado"),
        "monto_credito": monto_texto,
        "monto_letras": monto_letras,
        "entidad_financiera": obtener_valor("entidad_financiera"),
        "fecha_liquidacion": obtener_valor("fecha_liquidacion"),
        "folio_real": folio_limpio,
        "oficina_registral": obtener_valor("oficina_registral"),
        "datos_inmueble": datos_inmueble_val,
        "numero_escritura": obtener_valor("numero_escritura"),
        "fecha_escritura": obtener_valor("fecha_escritura"),
        "notario_origen_completo": obtener_valor("notario_origen_completo"),
        "tiene_conyuge": obtener_valor("tiene_conyuge"),
        # En las plantillas de casados la variable se llama {{ nombre_conyugue }}
        "nombre_conyuge": obtener_valor("nombre_conyuge") or obtener_valor("nombre_conyugue"),
        "nombre_conyugue": obtener_valor("nombre_conyuge") or obtener_valor("nombre_conyugue"),
    }

    # Coacreditados: datos del "TRABAJADOR DOS" (los del uno son los de siempre)
    credito2 = obtener_valor("numero_credito_2")
    monto2 = obtener_valor("monto_credito_2")
    letras2 = obtener_valor("monto_letras_2")
    if monto2 and not letras2:
        letras2 = numero_a_letras(monto2)
    context.update({
        "nombre_acreditado_2": obtener_valor("nombre_acreditado_2"),
        "numero_carta_2": obtener_valor("numero_carta_2"),
        "fecha_expedicion_2": obtener_valor("fecha_expedicion_2"),
        "fecha_liquidacion_2": obtener_valor("fecha_liquidacion_2"),
        "credito_a_salario_2": obtener_valor("credito_a_salario_2"),
        "numero_credito_2": (credito2 if ('"' in credito2 or '(' in credito2) else credito_a_letras(credito2)) if credito2 else "",
        "monto_credito_2": f"{monto2} M.N. ({letras2})" if monto2 else "",
    })

    doc.render(context)
    try:
        completar_conyuge_en_documento(doc.docx, context.get("nombre_conyuge"))
    except Exception as e:
        print(f"No se pudo completar el nombre del cónyuge: {e}")

    directorio_salida = os.path.dirname(ruta_salida)
    if directorio_salida:
        os.makedirs(directorio_salida, exist_ok=True)
        
    doc.save(ruta_salida)
    return True