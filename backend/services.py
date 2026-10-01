import os
import fitz  # PyMuPDF
import re
from docx import Document

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

def numero_a_palabras_generico(numero):
    """Convierte cualquier número entero o decimal con precisión exacta a texto completo."""
    unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
    decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
    dieces = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"]
    centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

    def convert_group(n):
        if n == 0: return ""
        if n == 100: return "CIEN"
        c = n // 100
        d = (n % 100) // 10
        u = n % 10
        res = ""
        if c > 0: res += centenas[c] + " "
        if d == 1:
            res += dieces[u] + " "
        else:
            if d > 0:
                res += decenas[d] + (" Y " if u > 0 else " ")
            if u > 0:
                res += unidades[u] + " "
        return res

    try:
        val_str = str(numero).replace('$', '').replace(',', '').strip()
        if '.' in val_str:
            partes_num = val_str.split('.')
            enteros = int(partes_num[0])
            dec_str = partes_num[1]
        else:
            enteros = int(val_str)
            dec_str = ""
    except Exception:
        return str(numero)

    if enteros == 0:
        texto_enteros = "CERO"
    else:
        millones = enteros // 1000000
        miles = (enteros % 1000000) // 1000
        cientos = enteros % 1000

        partes = []
        if millones > 0:
            if millones == 1:
                partes.append("UN MILLÓN")
            else:
                partes.append(f"{convert_group(millones).strip()} MILLONES")
        if miles > 0:
            if miles == 1:
                partes.append("MIL")
            else:
                partes.append(f"{convert_group(miles).strip()} MIL")
        if cientos > 0:
            partes.append(convert_group(cientos).strip())

        texto_enteros = " ".join(partes)

    texto_dec = ""
    if dec_str:
        zeros_lead = len(dec_str) - len(dec_str.lstrip('0'))
        partes_cero = ["CERO"] * zeros_lead
        restante_str = dec_str.lstrip('0')
        if restante_str:
            try:
                val_restante = int(restante_str)
                texto_restante = convert_group(val_restante).strip()
            except Exception:
                texto_restante = restante_str
        else:
            texto_restante = ""

        todas_partes_dec = partes_cero + ([texto_restante] if texto_restante else [])
        if todas_partes_dec:
            texto_dec = f" PUNTO {' '.join(todas_partes_dec)}"

    return f"{texto_enteros}{texto_dec}"

def convertir_fecha_texto(texto_fecha):
    if not texto_fecha or str(texto_fecha).upper() in ["NO_ENCONTRADO", "NONE", ""]:
        return "NO_ENCONTRADO"
    
    texto_upper = re.sub(r'\s+', ' ', str(texto_fecha)).upper().strip()
    
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

def numero_a_letras(numero):
    unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
    decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
    dieces = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"]
    centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

    def convert_group(n):
        if n == 0: return ""
        if n == 100: return "CIEN"
        c = n // 100
        d = (n % 100) // 10
        u = n % 10
        res = ""
        if c > 0: res += centenas[c] + " "
        if d == 1:
            res += dieces[u] + " "
        else:
            if d > 0:
                res += decenas[d] + (" Y " if u > 0 else " ")
            if u > 0:
                res += unidades[u] + " "
        return res

    try:
        val = float(str(numero).replace('$', '').replace(',', '').strip())
        enteros = int(val)
        centavos = int(round((val - enteros) * 100))
    except Exception:
        return str(numero)

    if enteros == 0:
        texto_enteros = "CERO PESOS"
    else:
        millones = enteros // 1000000
        miles = (enteros % 1000000) // 1000
        cientos = enteros % 1000

        partes = []
        if millones > 0:
            if millones == 1:
                partes.append("UN MILLÓN")
            else:
                partes.append(f"{convert_group(millones).strip()} MILLONES")
        if miles > 0:
            if miles == 1:
                partes.append("MIL")
            else:
                partes.append(f"{convert_group(miles).strip()} MIL")
        if cientos > 0:
            partes.append(convert_group(cientos).strip())

        texto_enteros = " ".join(partes) + " PESOS"

    if centavos > 0:
        texto_centavos = f"CON {convert_group(centavos).strip()} CENTAVOS"
    else:
        texto_centavos = "CON CERO CENTAVOS"

    return f"{texto_enteros} {texto_centavos}, MONEDA NACIONAL"

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
        return match.group(1).strip()
    return "NO_ENCONTRADO"

def armar_ubicacion_inmueble(texto_completo):
    match_seccion = re.search(r'DATOS DE IDENTIFICACIÓN[:\s]*(.*?)(?=DATOS DE REGISTRO|INFORMACIÓN COMPLEMENTARIA|VOLANTE|ENTRADA|$)', texto_completo, re.IGNORECASE | re.DOTALL)
    texto_busqueda = match_seccion.group(1) if match_seccion else texto_completo

    patrones_ordenados = [
        ("vivienda", r'(?:Vivienda)[:\s#]*([A-Z0-9\-]+)'),
        ("uso_suelo", r'(?:Uso\s+de?\s+suelo)[:\s#]*([A-ZÁÉÍÓÚ\s]+?)(?=\s*(?:CALLE|LOTE|NO\.|MZ|COL|$))'),
        ("no_interior", r'(?:No\.\s*Interior|Num\.\s*Int\.|Int\.)[:\s#]*([A-Z0-9\-]+)'),
        ("lote", r'(?:Lote)[:\s#]*([A-Z0-9\-]+)'),
        ("manzana", r'(?:Manzana|Mz\.)[:\s#]*([A-Z0-9\-]+)'),
        ("supermanzana", r'(?:Supermanzana|Smz\.)[:\s#]*([A-Z0-9\-]+)'),
        ("etapa", r'(?:Etapa)[:\s#]*([A-Z0-9\-]+)(?!\s*FICIE)'),
        ("condominio", r'(?:Condominio)[:\s#]*([A-Z0-9\-\s]+?)(?=\s*(?:CALLE|NO\.|COL|SECTOR|$))'),
        ("calle", r'(?:Calle|Andador|Avenida|Av\.)[:\s#]*([A-ZÁÉÍÓÚÑ0-9\s]+?)(?=\s*(?:NO\.|NUM\.|LOTE|MZ|COL|C\.P\.|\d|$))'),
        ("no_exterior", r'(?:No\.\s*Exterior|Num\.\s*Ext\.|Ext\.)[:\s#]*([A-Z0-9\-]+)'),
        ("denominacion", r'(?:Denominación\s+del\s+Inmueble|Conjunto|Fraccionamiento)[:\s#]*([A-ZÁÉÍÓÚÑ0-9\s]+?)(?=\s*(?:COLONIA|SECTOR|MUNICIPIO|$))'),
        ("seccion", r'(?:Sección)[:\s#]*([A-Z0-9\-]+)'),
        ("colonia", r'(?:Colonia|Col\.)[:\s#]*([A-ZÁÉÍÓÚÑ0-9\s]+?)(?=\s*(?:SECTOR|MUNICIPIO|C\.P\.|$))'),
        ("sector", r'(?:Sector)[:\s#]*([A-Z0-9\-]+)'),
        ("municipio", r'(?:Municipio|Alcaldía)[:\s#]*([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*(?:DISTRITO|ESTADO|C\.P\.|$))'),
        ("distrito", r'(?:Distrito)[:\s#]*([A-ZÁÉÍÓÚÑ\s]+)'),
        ("estado", r'(?:Estado|Entidad\s+Federativa)[:\s#]*([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*(?:OBSERVACIONES|SUPERFICIE|C\.P\.|$))'),
        ("observaciones", r'(?:Observaciones)[:\s#]*([A-ZÁÉÍÓÚÑ0-9\s]+?)(?=\s*(?:C\.P\.|SUPERFICIE|VOLANTE|$))'),
        ("codigo_postal", r'(?:C\.P\.|Código\s+Postal)[:\s#]*(\d{5})')
    ]

    componentes_encontrados = []
    for clave, patron in patrones_ordenados:
        coincidencia = re.search(patron, texto_busqueda, re.IGNORECASE)
        if coincidencia:
            valor = coincidencia.group(1).strip()
            valor_limpio = re.sub(r'^(CALLE|LOTE|MANZANA|COLONIA|ESTADO)\b', '', valor, flags=re.IGNORECASE).strip()
            if valor_limpio and valor_limpio.lower() not in ['ninguna', 'ninguno', 'no_encontrado', 'no consta', 'null', 'super']:
                etiqueta = clave.replace('_', ' ').title()
                componentes_encontrados.append(f"{etiqueta}: {valor_limpio}")

    if componentes_encontrados:
        texto_armado = ", ".join(componentes_encontrados)
        return convertir_inmueble_a_letras(texto_armado)
    return "NO_ENCONTRADO"

def determinar_genero_y_estado_civil(texto_completo, nombre_acreditado=""):
    texto_upper = texto_completo.upper()
    nombre_upper = nombre_acreditado.upper()
    
    if re.search(r'\bLA\s+ACREDITADA\b|\bSEÑORA\b|\bA\s+FAVOR\s+DE\s+LA\b|\bCIUDADANA\b', texto_upper):
        genero = "FEMENINO"
    elif re.search(r'\bEL\s+ACREDITADO\b|\bSEÑOR\b|\bA\s+FAVOR\s+DEL\b|\bCIUDADANO\b', texto_upper):
        genero = "MASCULINO"
    else:
        primer_nombre = nombre_upper.split()[0] if nombre_upper else ""
        if primer_nombre.endswith(('A', 'IA', 'IS')):
            genero = "FEMENINO"
        else:
            genero = "MASCULINO"

    if re.search(r'\bCASAD[AO]\b|\bSOCIEDAD\s+CONYUGAL\b|\bSEPARACION\s+DE\s+BIENES\b|\bESTADO\s+CIVIL\s*:\s*CASAD', texto_upper):
        estado_civil = "CASADO"
    elif re.search(r'\bSOLTER[AO]\b|\bESTADO\s+CIVIL\s*:\s*SOLTER', texto_upper):
        estado_civil = "SOLTERO"
    else:
        estado_civil = "SOLTERO"

    return genero, estado_civil

def extraer_notario_robusto(texto_limpio, texto_completo=""):
    texto_upper = texto_limpio.upper()
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
        r'NOTI?AR[IÍ]O\s+P[UÚ]BLIC[OA]\s+(?:LICENCIADO|LIC\.?\s+)?([A-ZÁÉÍÓÚÑ\s]{4,45}?)\s+(?:N[UÚ]M[EÉ]RO|NO\.?)\s*([0-9]+)\s+DEL?\s+([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*,|\s+CON\s+RES|\s+EN\s+LA|\s+QUE|\.|$)',
        r'(?:ANTE\s+LA\s+FE\s+(?:DEL?\s+)?)(?:LICENCIADO|LIC\.?\s+)?([A-ZÁÉÍÓÚÑ\s]{4,45}?)\s*,?\s*NOTI?AR[IÍ]O\s+P[UÚ]BLIC[OA]\s+(?:NO\.?|N[UÚ]M[EÉ]RO)?\s*([0-9]+)\s+DEL?\s+([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*,|\s+CON\s+RES|\s+EN\s+LA|\.|$)',
        r'NOTI?AR[IÍ]O\s+(?:P[UÚ]BLIC[OA]\s+)?(?:NO\.?|N[UÚ]M[EÉ]RO)?\s*([0-9]+)\s+DEL?\s+([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*,|\s+CON\s+RES|\s+EN\s+LA|\s+EN\s+QUE|\.|$)'
    ]

    for pat in patrones[:2]:
        for match in re.finditer(pat, texto_upper):
            posible_nombre = match.group(1).strip()
            num_notaria = match.group(2).strip()
            jurisdiccion = match.group(3).strip()
            jurisdiccion = re.sub(r'\s+(?:CON|RESIDENCIA|RESICENCIA|EN|DE).*$', '', jurisdiccion).strip()
            
            palabras_n = [p for p in posible_nombre.split() if p not in prohibidas and len(p) > 1 and not p.isdigit()]
            if palabras_n:
                nombre_limpio = " ".join(palabras_n)
                if "JUAN CARLOS" in nombre_limpio.upper():
                    continue
                
                num_notaria_letra = numero_a_palabras_generico(num_notaria).lower()
                
                sub_texto = texto_upper[match.start():min(len(texto_upper), match.end() + 100)]
                if "ESTADO DE MÉXICO" in sub_texto or "ESTADO DE MEXICO" in sub_texto:
                    jur_fmt = "del estado de méxico"
                elif "CIUDAD DE MÉXICO" in sub_texto or "CIUDAD DE MEXICO" in sub_texto or "DISTRITO FEDERAL" in sub_texto:
                    jur_fmt = "de la ciudad de méxico"
                else:
                    jurisdiccion_lower = jurisdiccion.lower()
                    if "méxico" in jurisdiccion_lower or "mexico" in jurisdiccion_lower:
                        jur_fmt = "del estado de méxico"
                    elif "federal" in jurisdiccion_lower or "ciudad" in jurisdiccion_lower:
                        jur_fmt = "de la ciudad de méxico"
                    else:
                        jur_fmt = f"del {jurisdiccion_lower}" if not jurisdiccion_lower.startswith("de") else f"de {jurisdiccion_lower}"

                candidatos_validos.append({
                    "pos": match.start(),
                    "texto": f"{nombre_limpio} notario público número {num_notaria_letra} {jur_fmt}"
                })

    if not [c for c in candidatos_validos if "JUAN CARLOS" not in c["texto"].upper()]:
        for match_not in re.finditer(patrones[2], texto_upper):
            num_notaria = match_not.group(1).strip()
            jurisdiccion = match_not.group(2).strip()
            jurisdiccion = re.sub(r'\s+(?:CON|RESIDENCIA|RESICENCIA|EN|DE).*$', '', jurisdiccion).strip()
            
            inicio_pos = max(0, match_not.start() - 250)
            bloque_anterior = texto_upper[inicio_pos:match_not.start()]
            
            palabras = re.findall(r'\b[A-ZÁÉÍÓÚÑ]{3,}\b', bloque_anterior)
            palabras_validas = []
            
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
                    jur_fmt = "del estado de méxico"
                elif "CIUDAD DE MÉXICO" in sub_texto or "CIUDAD DE MEXICO" in sub_texto or "DISTRITO FEDERAL" in sub_texto:
                    jur_fmt = "de la ciudad de méxico"
                else:
                    jurisdiccion_lower = jurisdiccion.lower()
                    if "méxico" in jurisdiccion_lower or "mexico" in jurisdiccion_lower:
                        jur_fmt = "del estado de méxico"
                    elif "federal" in jurisdiccion_lower or "ciudad" in jurisdiccion_lower:
                        jur_fmt = "de la ciudad de méxico"
                    else:
                        jur_fmt = f"del {jurisdiccion_lower}" if not jurisdiccion_lower.startswith("de") else f"de {jurisdiccion_lower}"

                candidatos_validos.append({
                    "pos": match_not.start(),
                    "texto": f"{nombre_notario} notario público número {num_notaria_letra} {jur_fmt}"
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
            menciones_extra.append("patrimonio inmueble federal")
        elif "INMOBILIARIO FEDERAL" in sup_upper:
            menciones_extra.append("inmobiliario federal")
        if " NACIONAL" in sup_upper or "DEL NACIONAL" in sup_upper:
            if "nacional" not in str(texto_resultado).lower():
                menciones_extra.append("nacional")
        
        if menciones_extra and texto_resultado != "NO_ENCONTRADO":
            texto_resultado += f", {', '.join(menciones_extra)}"

    return texto_resultado

def extraer_datos_pdf(ruta_pdf):
    datos = {
        "numero_carta": "NO_ENCONTRADO",
        "fecha_expedicion": "NO_ENCONTRADO",
        "numero_credito": "NO_ENCONTRADO",
        "numero_credito_letras": "NO_ENCONTRADO",
        "nombre_acreditado": "NO_ENCONTRADO",
        "monto_credito": "NO_ENCONTRADO",
        "monto_credito_letras": "NO_ENCONTRADO",
        "credito_a_salario": "NO_ENCONTRADO",
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
        for pagina in doc:
            texto_completo += pagina.get_text() + "\n"
        doc.close()
        datos["texto_raw"] = texto_completo
    except Exception as e:
        print(f"Error al abrir PDF {ruta_pdf}: {e}")
        return datos

    nombre_archivo = os.path.basename(ruta_pdf)
    texto_limpio = " ".join(texto_completo.split())

    # 1. NÚMERO DE CRÉDITO
    match_credito = re.search(r'(?:Crédito|Cuenta|Finiquito|Contrato)[:\s#]*(\d{8,12})', texto_limpio, re.IGNORECASE)
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

    match_vsm = re.search(r'([\d,]+\.?\d*)\s*(?:VECES\s+EL\s+SALARIO|V\.?S\.?M\.?|VSM)', texto_credito, re.IGNORECASE)
    if match_vsm:
        raw_vsm = match_vsm.group(1).replace(",", "").strip()
        datos["credito_a_salario"] = numero_a_palabras_generico(raw_vsm).lower()

    match_monto_cred = re.search(
        r'(?:IMPORTE\s+(?:DE\s+LA\s+OBLIGACION\s+GARANTIZADA|DEL\s+CREDITO)?[:\s]*|CANTIDAD\s+DE\s*|CRÉDITO\s+HASTA\s+POR\s+LA\s+CANTIDAD\s+DE\s*)\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)',
        texto_credito,
        re.IGNORECASE
    )
    monto_raw = None
    if match_monto_cred:
        monto_raw = match_monto_cred.group(1).replace(',', '')
    else:
        match_monto_gen = re.search(r'\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)', texto_credito, re.IGNORECASE)
        if match_monto_gen:
            monto_raw = match_monto_gen.group(1).replace(',', '')

    if monto_raw:
        try:
            num = float(str(monto_raw).replace('$', '').replace(',', '').strip())
            datos["monto_credito"] = f"${num:,.2f}"
            datos["monto_credito_letras"] = numero_a_letras(num)
            
            if datos["credito_a_salario"] == "NO_ENCONTRADO":
                veces_salario = num / SALARIO_MINIMO_MENSUAL_DF
                veces_salario_str = f"{veces_salario:.4f}".rstrip('0').rstrip('.')
                datos["credito_a_salario"] = numero_a_palabras_generico(veces_salario_str).lower()
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
    patrones_escritura = [
        r'(?:ESCRITURA|INSTRUMENTO)\s+(?:P[uú]blica\s+)?(?:N[oº°]|NÚM[EÉ]RO|NUMERO|NO)\.?\s*([0-9,\.]+)',
        r'escritura\s+p[uú]blica\s+([0-9,\.]+)',
        r'instrumento\s+([0-9,\.]+)'
    ]
    for pat in patrones_escritura:
        match_esc = re.search(pat, texto_limpio, re.IGNORECASE)
        if match_esc:
            val_esc = match_esc.group(1).strip().rstrip(',').replace(',', '')
            if val_esc.isdigit():
                datos["numero_escritura"] = numero_a_palabras_generico(val_esc).lower()
                break

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

    return datos


def combinar_datos_pareja(datos_lista):
    datos_finales = {
        "numero_carta": "NO_ENCONTRADO",
        "fecha_expedicion": "NO_ENCONTRADO",
        "numero_credito": "NO_ENCONTRADO",
        "numero_credito_letras": "NO_ENCONTRADO",
        "nombre_acreditado": "NO_ENCONTRADO",
        "monto_credito": "NO_ENCONTRADO",
        "monto_credito_letras": "NO_ENCONTRADO",
        "credito_a_salario": "NO_ENCONTRADO",
        "entidad_financiera": "NO_ENCONTRADO",
        "fecha_liquidacion": "NO_ENCONTRADO",
        "folio_real": "NO_ENCONTRADO",
        "oficina_registral": "NO_ENCONTRADO",
        "datos_inmueble": "NO_ENCONTRADO",
        "numero_escritura": "NO_ENCONTRADO",
        "fecha_escritura": "NO_ENCONTRADO",
        "notario_origen_completo": "NO_ENCONTRADO",
        "tiene_conyuge": "NO_ENCONTRADO"
    }
    
    for d in datos_lista:
        for k, v in d.items():
            val = str(v).strip()
            if val != "NO_ENCONTRADO" and val.lower() not in ['de', 'sreales', 'folio', 'carta', 'real']:
                if datos_finales.get(k) == "NO_ENCONTRADO" or len(val) > len(str(datos_finales.get(k, ""))):
                    datos_finales[k] = val
                
    return datos_finales


def reemplazar_texto_en_parrafo(parrafo, mapa_reemplazos):
    texto_parrafo = parrafo.text
    if not any(key in texto_parrafo for key in mapa_reemplazos.keys()):
        return

    for key in mapa_reemplazos.keys():
        if key in parrafo.text and not any(key in r.text for r in parrafo.runs):
            for idx, run in enumerate(parrafo.runs):
                if "{" in run.text:
                    j = idx + 1
                    while j < len(parrafo.runs) and "}" not in parrafo.runs[j-1].text:
                        run.text += parrafo.runs[j].text
                        parrafo.runs[j].text = ""
                        j += 1

    for key, value in mapa_reemplazos.items():
        val_str = str(value)
        for run in parrafo.runs:
            if key in run.text:
                run.text = run.text.replace(key, val_str)
                run.font.underline = False
                run.font.highlight_color = None


def generar_word_cancelacion(ruta_plantilla, datos, ruta_salida):
    if not os.path.exists(ruta_plantilla):
        ruta_plantilla_alt = os.path.join("templates", "plantilla_manera2.docx")
        if os.path.exists(ruta_plantilla_alt):
            ruta_plantilla = ruta_plantilla_alt
        else:
            print(f"ADVERTENCIA: No se encontró la plantilla en {ruta_plantilla}")
            return False

    doc = Document(ruta_plantilla)
    
    folio_raw = str(datos.get("folio_real", "")).strip()
    folio_limpio = limpiar_ceros_izquierda(folio_raw) if folio_raw and folio_raw != "NO_ENCONTRADO" else ""

    credito_raw = str(datos.get("numero_credito", "")).strip()
    if credito_raw and credito_raw != "NO_ENCONTRADO":
        credito_texto = credito_raw if ('"' in credito_raw or '(' in credito_raw) else credito_a_letras(credito_raw)
    else:
        credito_texto = ""

    monto_raw = str(datos.get("monto_credito", "")).strip()
    monto_letras = str(datos.get("monto_credito_letras", "")).strip()
    
    if monto_raw and monto_raw != "NO_ENCONTRADO":
        if not monto_letras or monto_letras == "NO_ENCONTRADO":
            monto_letras = numero_a_letras(monto_raw)
        monto_texto = f"{monto_raw} ({monto_letras})"
    else:
        monto_texto = ""

    def obtener_valor(clave):
        val = str(datos.get(clave, "")).strip()
        if not val or val == "NO_ENCONTRADO" or val.lower() in ['l', 'no', 'no_encontrado', 'null']:
            return ""
        return val

    mapa_reemplazos = {
        "{{ numero_carta }}": obtener_valor("numero_carta"),
        "{{numero_carta}}": obtener_valor("numero_carta"),
        "{numero_carta}": obtener_valor("numero_carta"),

        "{{ fecha_expedicion }}": obtener_valor("fecha_expedicion"),
        "{{fecha_expedicion}}": obtener_valor("fecha_expedicion"),
        "{fecha_expedicion}": obtener_valor("fecha_expedicion"),

        "{{ crédito_a_salario }}": obtener_valor("credito_a_salario"),
        "{{credito_a_salario}}": obtener_valor("credito_a_salario"),
        "{credito_a_salario}": obtener_valor("credito_a_salario"),
        
        "{{ numero_credito }}": credito_texto,
        "{{numero_credito}}": credito_texto,
        "{numero_credito}": credito_texto,

        "{{ nombre_acreditado }}": obtener_valor("nombre_acreditado"),
        "{{nombre_acreditado}}": obtener_valor("nombre_acreditado"),
        "{nombre_acreditado}": obtener_valor("nombre_acreditado"),

        "{{ monto_credito }}": monto_texto,
        "{{monto_credito}}": monto_texto,
        "{monto_credito}": monto_texto,

        "{{ monto_letras }}": monto_letras,
        "{{monto_letras}}": monto_letras,
        "{monto_letras}": monto_letras,

        "{{ entidad_financiera }}": obtener_valor("entidad_financiera"),
        "{{entidad_financiera}}": obtener_valor("entidad_financiera"),
        "{entidad_financiera}": obtener_valor("entidad_financiera"),

        "{{ fecha_liquidacion }}": obtener_valor("fecha_liquidacion"),
        "{{fecha_liquidacion}}": obtener_valor("fecha_liquidacion"),
        "{fecha_liquidacion}": obtener_valor("fecha_liquidacion"),

        "{{ folio_real }}": folio_limpio,
        "{{folio_real}}": folio_limpio,
        "{folio_real}": folio_limpio,

        "{{ oficina_registral }}": obtener_valor("oficina_registral"),
        "{{oficina_registral}}": obtener_valor("oficina_registral"),
        "{oficina_registral}": obtener_valor("oficina_registral"),

        "{{ datos_inmueble }}": obtener_valor("datos_inmueble"),
        "{{datos_inmueble}}": obtener_valor("datos_inmueble"),
        "{datos_inmueble}": obtener_valor("datos_inmueble"),

        "{{ numero_escritura }}": obtener_valor("numero_escritura"),
        "{{numero_escritura}}": obtener_valor("numero_escritura"),

        "{{ fecha_escritura }}": obtener_valor("fecha_escritura"),
        "{{fecha_escritura}}": obtener_valor("fecha_escritura"),

        "{{ notario_origen_completo }}": obtener_valor("notario_origen_completo"),
        "{{notario_origen_completo}}": obtener_valor("notario_origen_completo"),

        "{{ tiene_conyuge }}": obtener_valor("tiene_conyuge"),
        "{{tiene_conyuge}}": obtener_valor("tiene_conyuge"),
    }

    for p in doc.paragraphs:
        reemplazar_texto_en_parrafo(p, mapa_reemplazos)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    reemplazar_texto_en_parrafo(p, mapa_reemplazos)

    directorio_salida = os.path.dirname(ruta_salida)
    if directorio_salida:
        os.makedirs(directorio_salida, exist_ok=True)
        
    doc.save(ruta_salida)
    return True