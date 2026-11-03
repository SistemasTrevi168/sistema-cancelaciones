"""
Redacción notarial de los datos del inmueble a partir del desglose de la constancia (los 19 puntos).

Ejemplo (desglose -> texto):
  Vivienda 12-B, Uso de suelo HABITACIONAL, Lote 8-B, Manzana X, Calle AVENIDA HACIENDA GERANIOS,
  Denominación FRACCIONAMIENTO HABITACIONAL POPULAR, Colonia HACIENDA REAL DE TULTEPEC II,
  Municipio TULTEPEC, Estado ESTADO DE MÉXICO
  ->
  LA VIVIENDA HABITACIONAL MARCADA CON EL NÚMERO Y LETRA DOCE GUION "B", CONSTRUIDA SOBRE EL LOTE OCHO GUION "B",
  MANZANA DIEZ ROMANO, UBICADA EN AVENIDA HACIENDA GERANIOS, DEL FRACCIONAMIENTO HABITACIONAL POPULAR DENOMINADO
  "HACIENDA REAL DE TULTEPEC II", EN EL MUNICIPIO DE TULTEPEC, ESTADO DE MÉXICO

Lo que no viene en la constancia simplemente no se escribe. El texto se puede corregir a mano en pantalla.
"""
import re
from typing import Dict, Optional

import services

_ROMANO = re.compile(r"^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")
# Tipo de inmueble que puede venir al inicio del dato «Vivienda»: (palabra, femenino)
_TIPOS = [("DEPARTAMENTO", False), ("CASA", True), ("VIVIENDA", True), ("LOCAL", False), ("DÚPLEX", False), ("DUPLEX", False),
          ("TRIPLEX", False), ("CUADRUPLEX", False), ("TERRENO", False), ("PREDIO", False), ("LOTE", False)]
_VIAS = ("CALLE", "AVENIDA", "PRIVADA", "CERRADA", "BOULEVARD", "BULEVAR", "ANDADOR", "CIRCUITO", "PROLONGACIÓN", "PROLONGACION",
         "CALZADA", "RETORNO", "PASEO", "CAMINO", "CARRETERA", "CALLEJÓN", "CALLEJON", "EJE", "VIADUCTO", "PERIFÉRICO", "PERIFERICO",
         "GLORIETA", "PLAZA", "AUTOPISTA", "BOSQUES", "CORREDOR")
_DESARROLLOS = ("FRACCIONAMIENTO", "CONJUNTO", "UNIDAD", "DESARROLLO", "RESIDENCIAL", "COLONIA", "BARRIO", "PUEBLO", "BARRIO",
                "LOCALIDAD", "EJIDO", "RANCHERÍA", "RANCHERIA", "VILLA", "CONDOMINIO")
_SIN_DATO = {"", "NO CONSTA", "NO_ENCONTRADO", "N/A", "NA", "-", "--", "---", "NINGUNO", "NINGUNA", "SIN DATO", "NULL", "NONE", "S/N"}


def _limpio(v) -> str:
    t = " ".join(str(v or "").split()).strip(" :,;-")
    t = t.rstrip(".") if not re.search(r"\b[A-Z]\.$", t) else t
    if t.upper() in _SIN_DATO:
        return ""
    return services.expandir_abreviaturas(t).upper()


def _palabras(n: int) -> str:
    return " ".join(str(services.numero_a_palabras_generico(n)).upper().split())


def numero_con_letra(valor: str, permitir_romano: bool = True) -> (str, bool):
    """
    '12-B' -> ('DOCE GUION "B"', True)    '2' -> ('DOS', False)    'X' -> ('DIEZ ROMANO', False)
    '12B' -> ('DOCE "B"', True)           'A' -> ('"A"', True)     '8-1' -> ('OCHO GUION UNO', False)
    Devuelve el texto y si lleva letra (para escribir «NÚMERO Y LETRA»).
    """
    v = _limpio(valor)
    v = re.sub(r"^(?:N[UÚ]MERO|N[UÚ]M\.?|NO\.?|#)\s*", "", v)
    if not v:
        return "", False
    if permitir_romano and re.fullmatch(r"[IVXL]{1,6}", v) and _ROMANO.match(v):
        n = services.romano_a_entero(v)
        if n:
            return f"{_palabras(n)} ROMANO", False
    partes = []
    letra = False
    for i, trozo in enumerate(re.split(r"\s*([\-/])\s*|\s+", v)):
        if trozo is None or trozo == "":
            continue
        if trozo == "-":
            partes.append("GUION"); continue
        if trozo == "/":
            partes.append("DIAGONAL"); continue
        # «12B» -> 12 y B
        for pieza in re.findall(r"\d+|[A-ZÁÉÍÓÚÑ]+|[^\dA-ZÁÉÍÓÚÑ]+", trozo):
            if pieza.isdigit():
                partes.append(_palabras(int(pieza)))
            elif re.fullmatch(r"[A-ZÑ]{1,2}", pieza):
                partes.append(f'"{pieza}"'); letra = True
            else:
                partes.append(pieza)
    return " ".join(partes), letra


def _tipo_y_numero(vivienda: str):
    """'DEPARTAMENTO 2' -> ('DEPARTAMENTO', False, '2');  '12-B' -> ('VIVIENDA', True, '12-B')."""
    v = _limpio(vivienda)
    for palabra, fem in _TIPOS:
        m = re.match(rf"^(?:{palabra})\b\s*(.*)$", v)
        if m:
            return palabra, fem, m.group(1).strip()
    return "VIVIENDA", True, v


def _entre_comillas(nombre: str) -> str:
    n = nombre.strip().strip('"“”').strip()
    return f'"{n}"' if n else ""


def _estado(valor: str) -> str:
    e = _limpio(valor).replace("MEXICO", "MÉXICO")
    if e in ("MÉXICO", "EDO. DE MÉXICO", "EDO DE MÉXICO", "EDOMEX"):
        return "ESTADO DE MÉXICO"
    if e in ("DISTRITO FEDERAL", "D.F.", "DF", "CDMX", "CIUDAD DE MÉXICO"):
        return "CIUDAD DE MÉXICO"
    return e


def redactar_inmueble(puntos: Dict[str, str]) -> str:
    """Texto notarial del inmueble con los puntos que sí vienen. Vacío si no hay datos."""
    g = lambda k: _limpio(puntos.get(k))
    if not any(g(k) for k in puntos):
        return ""
    tipo, femenino, numero = _tipo_y_numero(g("1_vivienda"))
    articulo = "LA" if femenino else "EL"
    o_a = "A" if femenino else "O"
    uso = g("2_uso_de_suelo")
    partes = []

    if g("1_vivienda"):
        num, letra = numero_con_letra(numero, permitir_romano=False)
        inicio = f"{articulo} {tipo}" + (f" {uso}" if uso else "")
        if num and re.search(r"\d|\"", num + numero):
            inicio += f" MARCAD{o_a} CON EL NÚMERO{' Y LETRA' if letra else ''} {num}"
        elif numero:
            inicio += f" {numero}"
        partes.append(inicio)
    else:
        femenino, o_a = False, "O"
        partes.append("EL INMUEBLE" + (f" DE USO {uso}" if uso else ""))

    if g("3_no_interior"):
        partes.append(f"INTERIOR {numero_con_letra(g('3_no_interior'), False)[0]}")
    sector = g("14_sector")
    if sector:
        m = re.match(r"^(EDIFICIO|TORRE|BLOQUE|M[OÓ]DULO)\s+(.+)$", sector)
        if m:
            partes.append(f"DEL {m.group(1)} {_valor_letra(m.group(2))}")
        else:
            partes.append(f"SECTOR {_valor_letra(sector)}")
    if g("4_lote"):
        lote = f"CONSTRUID{o_a} SOBRE EL LOTE {numero_con_letra(g('4_lote'))[0]}"
        if not g("1_vivienda") and len(partes) == 1:
            partes[0] += " " + lote  # «EL INMUEBLE CONSTRUIDO SOBRE EL LOTE …»
        else:
            partes.append(lote)
    if g("5_manzana"):
        partes.append(f"MANZANA {numero_con_letra(g('5_manzana'))[0]}")
    if g("6_supermanzana"):
        partes.append(f"SUPERMANZANA {numero_con_letra(g('6_supermanzana'))[0]}")
    if g("7_etapa"):
        partes.append(f"ETAPA {numero_con_letra(g('7_etapa'))[0]}")
    if g("12_seccion"):
        partes.append(f"SECCIÓN {numero_con_letra(g('12_seccion'))[0]}")
    if g("8_condominio"):
        c = g("8_condominio")
        partes.append(f"DEL CONDOMINIO {_valor_letra(c) if re.fullmatch(r'[\dA-Z\-]{1,6}', c) else _entre_comillas(c)}")

    calle = g("9_calle")
    if calle:
        via = calle if calle.split(" ")[0] in _VIAS else f"CALLE {calle}"
        texto = f"UBICAD{o_a} EN {via}"
        if g("10_no_exterior"):
            num, letra = numero_con_letra(g("10_no_exterior"), False)
            texto += f" NÚMERO{' Y LETRA' if letra else ''} {num}"
        partes.append(texto)
    elif g("10_no_exterior"):
        num, letra = numero_con_letra(g("10_no_exterior"), False)
        partes.append(f"NÚMERO{' Y LETRA' if letra else ''} EXTERIOR {num}")

    denominacion = g("11_denominacion_del_inmueble")
    colonia = g("13_colonia")
    condominio_regimen = bool(re.search(r"R[EÉ]GIMEN|PROPIEDAD\s+EN\s+CONDOMINIO", denominacion))
    if condominio_regimen:
        partes.append(f"SUJET{o_a} AL RÉGIMEN DE PROPIEDAD EN CONDOMINIO")
        denominacion = ""
    if denominacion and colonia:
        partes.append(f"DEL {denominacion} DENOMINADO {_entre_comillas(colonia)}")
    elif colonia:
        primera = colonia.split(" ")[0]
        if primera in _DESARROLLOS:
            # «FRACCIONAMIENTO LAS FLORES» -> DEL FRACCIONAMIENTO DENOMINADO "LAS FLORES"
            resto = colonia[len(primera):].strip()
            art = "DE LA" if primera in ("COLONIA", "UNIDAD", "LOCALIDAD", "RANCHERÍA", "RANCHERIA", "VILLA") else "DEL"
            partes.append(f"{art} {primera} {_entre_comillas(resto)}" if primera == "COLONIA" else f"{art} {primera} DENOMINAD{'A' if art == 'DE LA' else 'O'} {_entre_comillas(resto)}")
        else:
            partes.append(f"DE LA COLONIA {_entre_comillas(colonia)}")
    elif denominacion:
        partes.append(f"DEL {denominacion}")

    estado = _estado(g("17_estado"))
    municipio = g("15_municipio")
    if municipio:
        cdmx = estado == "CIUDAD DE MÉXICO"
        lugar = f"EN LA ALCALDÍA {municipio}" if cdmx else f"EN EL MUNICIPIO DE {municipio}"
        partes.append(lugar + (f", {estado}" if estado else ""))
    elif estado:
        partes.append(f"EN EL {estado}" if estado.startswith("ESTADO") else f"EN {estado}")

    texto = ", ".join(p for p in partes if p)
    return re.sub(r"\s{2,}", " ", texto).strip()


def _valor_letra(valor: str) -> str:
    """'J' -> '"J"';  '3' -> 'TRES';  'NORTE' -> 'NORTE'."""
    v = _limpio(valor)
    if re.fullmatch(r"[\d\-A-Z/]{1,6}", v) and (re.search(r"\d", v) or len(v) <= 2):
        return numero_con_letra(v, permitir_romano=False)[0]
    return v
