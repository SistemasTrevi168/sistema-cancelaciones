"""
Nombres de personas: orden (nombre(s) primero y después apellidos) y género.

La constancia del IFREM escribe a las personas con los apellidos primero ("PADILLA GUTIERREZ FERNANDO");
la escritura y las plantillas los llevan con el nombre primero ("FERNANDO PADILLA GUTIERREZ").
El género se decide por el nombre de pila (no por el apellido): "PADILLA" termina en A, pero es apellido.
"""
import re
import unicodedata

# Nombres de pila de hombre
NOMBRES_HOMBRE = set("""
AARON ABEL ABRAHAM ABRAM ADALBERTO ADAN ADOLFO ADRIAN AGUSTIN ALAN ALBERTO ALBINO ALEJANDRO ALEJO ALEXANDER ALEXIS
ALFONSO ALFREDO ALVARO AMADO AMADOR AMBROSIO AMERICO AMILCAR ANASTASIO ANDRES ANGEL ANIBAL ANSELMO ANTONIO ARIEL
ARMANDO ARNOLDO ARNULFO ARTURO AUGUSTO AURELIO BALTAZAR BARTOLO BARTOLOME BAUDELIO BAUTISTA BENITO BENJAMIN BERNABE
BERNARDINO BERNARDO BLAS BONIFACIO BRANDON BRAULIO BRAYAN BRIAN BRUNO CALEB CAMILO CANDIDO CARLOS CAYETANO CELSO
CESAR CIPRIANO CIRILO CIRO CLAUDIO CLEMENTE CONRADO CORNELIO CRESCENCIO CRISPIN CRISTIAN CRISTOBAL CRUZ CUAUHTEMOC
DAMIAN DANIEL DARIO DAVID DELFINO DEMETRIO DIEGO DIONISIO DOMINGO DONATO EDGAR EDGARDO EDMUNDO EDSON EDUARDO EDWIN
EFRAIN EFREN ELEAZAR ELIAS ELIGIO ELISEO ELOY EMANUEL EMETERIO EMILIANO EMILIO EMMANUEL ENRIQUE ERASMO ERICK ERIK
ERNESTO ESAU ESTEBAN EUGENIO EUSEBIO EVARISTO EZEQUIEL FABIAN FABIO FAUSTINO FAUSTO FEDERICO FELICIANO FELIPE FELIX
FERMIN FERNANDO FIDEL FILEMON FLAVIO FLORENCIO FLORENTINO FRANCISCO FROYLAN GABINO GABRIEL GAMALIEL GASPAR GENARO
GERARDO GERMAN GILBERTO GIOVANNI GONZALO GREGORIO GUADALUPE GUILLERMO GUSTAVO HECTOR HERIBERTO HERMENEGILDO HERMILO
HERNAN HILARIO HIPOLITO HOMERO HORACIO HUGO HUMBERTO IGNACIO ISAAC ISAIAS ISIDRO ISMAEL ISRAEL IVAN JACINTO JACOBO
JAIME JAVIER JEREMIAS JESUS JOAQUIN JOEL JONATHAN JONATAN JORGE JOSE JOSUE JUAN JULIAN JULIO JUSTINO JUVENAL KEVIN
LAURO LAZARO LEANDRO LEOBARDO LEON LEONARDO LEONEL LEOPOLDO LIBORIO LORENZO LUCAS LUCIANO LUCIO LUIS MACARIO MANUEL
MARCELINO MARCELO MARCIAL MARCO MARCOS MARGARITO MARIANO MARIO MARTIN MATEO MATIAS MAURICIO MAXIMILIANO MAXIMINO
MAXIMO MELQUIADES MIGUEL MISAEL MOISES NAHUM NARCISO NATALIO NAZARIO NESTOR NICOLAS NOE NORBERTO OCTAVIO ODILON
OMAR ORLANDO OSCAR OSVALDO OSWALDO OTONIEL PABLO PANTALEON PASCUAL PATRICIO PEDRO PORFIRIO PRIMITIVO PRISCILIANO
RAFAEL RAMIRO RAMON RAUL REFUGIO REYES REYNALDO REYNOL RICARDO RIGOBERTO ROBERTO RODOLFO RODRIGO ROGELIO
ROLANDO ROMAN ROMULO RUBEN RUFINO SABINO SALOMON SALVADOR SAMUEL SANTIAGO SANTOS SAUL SEBASTIAN SERAFIN SERGIO
SEVERIANO SILVESTRE SIMON SOCRATES TEODORO TEOFILO TIBURCIO TIMOTEO TOMAS TRINIDAD ULISES URIEL VALENTIN VICENTE
VICTOR VIRGILIO WALTER WILFRIDO WILLIAM YAHIR ZACARIAS ZEFERINO LUCA JOSHUA ELISEA
""".split())

# Nombres de pila de mujer
NOMBRES_MUJER = set("""
ABIGAIL ADELA ADELAIDA ADELINA ADRIANA AGUSTINA AIDA ALBA ALEJANDRA ALEXA ALICIA ALMA AMALIA AMELIA AMPARO ANA ANABEL
ANAHI ANDREA ANEL ANGELA ANGELES ANGELICA ANTONIA ARACELI ARACELY ARELI ARELY ARIADNA ARIADNE ASUNCION AURORA
AZUCENA BEATRIZ BELEN BERENICE BERTHA BLANCA BRENDA BRISEIDA CARIDAD CARINA CARLA CARMEN CAROLINA CATALINA CECILIA
CELIA CINTHIA CINTIA CITLALI CLARA CLAUDIA CONCEPCION CONSUELO CRISTINA DALIA DANIELA DEBORA DELIA DENISE DENISSE
DIANA DOLORES DULCE EDITH ELENA ELIA ELISA ELIZABETH ELSA ELVIA ELVIRA EMILIA EMMA ENCARNACION ERIKA ESMERALDA
ESPERANZA ESTEFANI ESTEFANIA ESTELA ESTHER ESTER EUGENIA EVA EVANGELINA FABIOLA FATIMA FELICITAS FERNANDA FILOMENA
FLOR FLORA FLORENCIA FRANCISCA GABRIELA GEORGINA GISEL GISELA GISELLE GLADYS GLORIA GRACIELA GRISELDA GUADALUPE
HERMELINDA HILDA IMELDA INES INGRID IRAIS IRENE IRMA ISABEL ISELA ITZEL IVETTE IVONNE JANET JANETH JAQUELINE
JAZMIN JESSICA JOSEFINA JUANA JUDITH JULIA JULIETA KAREN KARINA KARLA LAURA LEONOR LETICIA LIDIA LILIA LILIAN
LILIANA LIZ LIZBETH LORENA LOURDES LUCIA LUISA LUZ MABEL MAGALI MAGALY MAGDALENA MANUELA MARCELA MARGARITA MARIA
MARIANA MARIBEL MARIBETH MARICELA MARICRUZ MARILU MARINA MARISOL MARTA MARTHA MAYRA MAYTE MELISSA MERCEDES MICHELLE
MIRIAM MIRYAM MIREYA MONICA MONSERRAT MONTSERRAT NADIA NANCY NATALIA NAYELI NELLY NICOLE NOEMI NOHEMI NORA NORMA
OFELIA OLGA OLIVIA PALOMA PAOLA PATRICIA PAULA PAULINA PERLA PETRA PILAR RAQUEL REBECA REGINA REYNA RITA ROCIO
ROSA ROSALBA ROSALIA ROSARIO ROSAURA ROSELIA ROXANA RUBI RUTH SANDRA SARA SARAHI SELENE SILVIA SOCORRO SOFIA
SOLEDAD SONIA STEPHANIE SUSANA TANIA TERESA TRINIDAD REMEDIOS REFUGIO VALERIA VANESSA VERONICA VICTORIA VIRGINIA VIVIANA XIMENA
YADIRA YANET YARELI YAZMIN YASMIN YESENIA YOLANDA ZOE ZULEMA MA XOCHITL MAGNOLIA NOELIA ODALYS JOCELYN
GRECIA ARLETTE MIRNA NIDIA NOHEMY YURIDIA ARIANA ANAYELI GENOVEVA TOMASA PASCUALA CRESCENCIA JUSTINA
""".split())

# Nombres de pila que también son apellidos comunes ("GARCIA CRUZ MARIA", "REYES SANTOS LUIS")
TAMBIEN_APELLIDO = {"CRUZ", "REYES", "SANTOS", "LEON", "ROMAN", "MARTIN", "TOMAS", "MARCOS", "LUCAS", "LORENZO",
                    "SALOMON", "BAUTISTA", "GASPAR", "DOMINGO", "ANGELES", "SALVADOR", "BENITO", "ESTEBAN",
                    "CRISTOBAL", "PASCUAL", "CLEMENTE", "SIMON", "FELIX", "ANDRES", "VICENTE", "MATEO", "MARINA",
                    "FLORES", "ROSALES", "ROSA", "PAZ", "LUNA", "DIAZ", "ISIDRO", "VALENTIN", "AMADOR", "ALEJO",
                    "BARTOLO", "MAXIMO", "MANUEL", "NICOLAS", "JACINTO", "GABINO", "OLIVIA"}
# Apellidos muy comunes (para saber el orden cuando el nombre de pila no está en las listas)
APELLIDOS = set("""
HERNANDEZ GARCIA MARTINEZ LOPEZ GONZALEZ PEREZ RODRIGUEZ SANCHEZ RAMIREZ CRUZ FLORES GOMEZ MORALES VAZQUEZ JIMENEZ
REYES DIAZ TORRES GUTIERREZ RUIZ MENDOZA AGUILAR ORTIZ MORENO CASTILLO ROMERO ALVAREZ MENDEZ CHAVEZ RIVERA JUAREZ
RAMOS DOMINGUEZ HERRERA MEDINA CASTRO VARGAS GUZMAN VELAZQUEZ MUNOZ ROJAS SALAZAR CONTRERAS ORTEGA
GUERRERO ESTRADA BAUTISTA CORTES SOTO ALVARADO ESPINOZA LARA AVILA RIOS CERVANTES SILVA DELGADO VEGA MARQUEZ
SANDOVAL CARRILLO FERNANDEZ LEON MEJIA SOLIS NAVARRO IBARRA ROSAS CAMACHO VALDEZ OROZCO PENA ACOSTA SANTIAGO
NUNEZ MOLINA ZUNIGA CAMPOS PADILLA CABRERA FUENTES MIRANDA TREJO CORONA MALDONADO ROSALES PACHECO MARIN ANGELES
VALENCIA ESPINOSA MONTES ROBLES GALLEGOS BECERRA FIGUEROA OSORIO LUNA ARELLANO SALINAS VELASCO ZAMORA ROSAS
NAVA PINEDA AGUIRRE CARDENAS RANGEL TAPIA GALVAN BELTRAN VILLANUEVA SANTOS ESCOBAR MACIAS ZARATE OCHOA VILLA
DURAN SOLANO PALACIOS BARRERA LOZANO HUERTA CISNEROS CORDOVA SERRANO CALDERON QUINTERO MORA PONCE VALENZUELA
GALINDO TELLEZ MEZA ARIAS ROMAN MATA BRAVO ROBLEDO OLVERA VELAZCO ESQUIVEL TOLEDO OLIVARES TREVINO VERA
""".split())
# Palabras que unen nombres compuestos ("MARIA DE LOS ANGELES", "JOSE DE JESUS")
UNIONES = {"DE", "DEL", "LA", "LAS", "LOS", "Y"}
# Abreviaturas que se usan como nombre: MA. = MARÍA, J. = JOSÉ
ABREVIATURAS = {"MA": "F", "MA.": "F", "MARIA.": "F", "J": "M", "J.": "M", "JMA.": "M"}
# Tratamientos que a veces vienen pegados al nombre
TRATAMIENTOS = {"C.", "C", "SR.", "SRA.", "SR", "SRA", "SRITA.", "LIC.", "ING."}


def _sin_acentos(texto):
    t = unicodedata.normalize("NFD", str(texto or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn" or c == "̃")  # conserva la Ñ
    return unicodedata.normalize("NFC", t).upper()


def _clave(palabra):
    return _sin_acentos(palabra).replace("Ñ", "N")


def es_nombre_de_pila(palabra):
    k = _clave(palabra)
    return k in NOMBRES_HOMBRE or k in NOMBRES_MUJER or k in ABREVIATURAS


def _palabras(nombre):
    return [p for p in str(nombre or "").split() if p.upper() not in TRATAMIENTOS]


def ordenar_nombre(nombre, referencia=""):
    """
    Regresa el nombre con el nombre de pila primero: "PADILLA GUTIERREZ FERNANDO" -> "FERNANDO PADILLA GUTIERREZ".
    - Si la carta trae a la misma persona (mismas palabras), se usa el orden de la carta.
    - Si ya empieza con un nombre de pila, se deja igual.
    - Si termina con nombres de pila, esos pasan al principio (se suponen dos apellidos cuando se puede).
    Si no se puede saber, se deja como venía.
    """
    texto = " ".join(str(nombre or "").split())
    if not texto or texto.upper() == "NO_ENCONTRADO":
        return nombre
    palabras = _palabras(texto)
    if len(palabras) < 2:
        return texto

    # 1) El orden de la carta (misma persona, mismas palabras)
    ref = _palabras(referencia)
    if ref and sorted(map(_clave, ref)) == sorted(map(_clave, palabras)):
        pendientes = list(palabras)
        ordenado = []
        for r in ref:
            i = next(k for k, p in enumerate(pendientes) if _clave(p) == _clave(r))
            ordenado.append(pendientes.pop(i))
        return " ".join(ordenado)

    # 2) Ya empieza con un nombre de pila (que no sea también apellido común)
    if es_nombre_de_pila(palabras[0]) and _clave(palabras[0]) not in TAMBIEN_APELLIDO:
        return " ".join(palabras)

    # 3) Apellidos primero: desde dónde todo lo que sigue son nombres de pila.
    #    En el segundo lugar, un nombre que también es apellido común ("GARCIA CRUZ MARIA") se toma como apellido.
    cortes = []
    for k in range(1, len(palabras)):
        resto = palabras[k:]
        if es_nombre_de_pila(resto[0]) and all(es_nombre_de_pila(p) or _clave(p) in UNIONES for p in resto):
            cortes.append(k)
    if not cortes:
        # Nombre de pila desconocido: si empieza con apellidos conocidos y termina con palabras que no lo son
        claves = [_clave(p) for p in palabras]
        if claves[0] in APELLIDOS and claves[-1] not in APELLIDOS:
            k = 1
            while k < len(palabras) - 1 and (claves[k] in APELLIDOS or claves[k] in UNIONES):
                k += 1
            if all(c not in APELLIDOS for c in claves[k:]):
                return " ".join(palabras[k:] + palabras[:k])
        return " ".join(palabras)
    preferidos = [k for k in cortes if not (k == 1 and _clave(palabras[1]) in TAMBIEN_APELLIDO)]
    k = min(preferidos) if preferidos else min(cortes)
    return " ".join(palabras[k:] + palabras[:k])


def genero(nombre):
    """'FEMENINO' / 'MASCULINO' según el nombre de pila ('' si no hay nombre)."""
    palabras = [p for p in _palabras(ordenar_nombre(nombre)) if p.upper() != "NO_ENCONTRADO"]
    if not palabras:
        return ""
    # El primer nombre de pila conocido decide ("JOSE GUADALUPE" es hombre; "MARIA DE JESUS" es mujer)
    for p in palabras:
        k = _clave(p)
        if k in ABREVIATURAS:
            return "FEMENINO" if ABREVIATURAS[k] == "F" else "MASCULINO"
        en_h, en_m = k in NOMBRES_HOMBRE, k in NOMBRES_MUJER
        if en_h and not en_m:
            return "MASCULINO"
        if en_m and not en_h:
            return "FEMENINO"
        if en_h and en_m:  # GUADALUPE, TRINIDAD, CRUZ...: decide el nombre que sigue, si lo hay
            continue
        if k in UNIONES:
            continue
        break  # primera palabra desconocida: se decide abajo por la terminación
    # Nombres compartidos o desconocidos: por la terminación del primer nombre
    primero = _clave(palabras[0])
    if primero in APELLIDOS:  # no se pudo ordenar: se usa la última palabra (nombre de pila en la constancia)
        primero = _clave(palabras[-1])
    if primero in NOMBRES_HOMBRE and primero in NOMBRES_MUJER:
        return "FEMENINO" if primero in ("GUADALUPE", "ROSARIO") else "MASCULINO"
    return "FEMENINO" if primero.endswith("A") else "MASCULINO"
