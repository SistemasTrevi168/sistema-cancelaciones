import uuid
from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey, LargeBinary, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func, text
from database import Base

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    es_admin = Column(Boolean, default=False)
    # Un usuario desactivado no puede iniciar sesión, pero se conserva su historial
    activo = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    # Perfil (cada quien edita el suyo)
    nombre_mostrar = Column(String, nullable=True)
    foto = Column(Text, nullable=True)            # imagen recortada (data:image/jpeg;base64,...)
    color_acento = Column(String, nullable=True)  # color del sistema elegido por el usuario (#rrggbb)
    tema = Column(String, nullable=True)          # claro / oscuro / sistema
    # Tipo de usuario (además de es_admin): "operador" (hace expedientes) o "revisor"
    # (solo revisa, edita, cambia el estado y descarga los expedientes que le comparten)
    rol = Column(String, nullable=True)
    # El administrador le restableció la contraseña: al entrar debe cambiarla por una propia
    debe_cambiar_password = Column(Boolean, nullable=False, default=False, server_default=text("false"))

class Expediente(Base):
    __tablename__ = "expedientes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Columna que vincula el expediente al usuario
    usuario_propietario = Column(String, ForeignKey("usuarios.username"), nullable=False, default="admin")
    numero_credito = Column(String, index=True, nullable=False)
    manera = Column(String, default="MANERA_2")  # MANERA_1 o MANERA_2
    estado = Column(String, default="GENERADO")  # GENERADO, REVISADO, ENTREGADO (los antiguos PENDIENTE cuentan como GENERADO)
    datos_extraidos = Column(JSON, nullable=True)
    ruta_pdf_constancia = Column(String, nullable=True)
    ruta_pdf_carta = Column(String, nullable=True)
    ruta_word_generado = Column(String, nullable=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

class Sesion(Base):
    """Sesiones de login guardadas en la base de datos (sobreviven reinicios del servidor)."""
    __tablename__ = "sesiones"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, index=True, nullable=False)
    es_admin = Column(Boolean, default=False)
    role = Column(String, default="operador")
    creada_en = Column(DateTime(timezone=True), server_default=func.now())
    expira_en = Column(DateTime(timezone=True), nullable=False)
    user_agent = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    ultimo_uso = Column(DateTime(timezone=True), nullable=True)


class PlantillaSubida(Base):
    """Copia de las plantillas .docx subidas desde el panel de admin (para que no se pierdan al redesplegar)."""
    __tablename__ = "plantillas_subidas"

    nombre = Column(String, primary_key=True)
    contenido = Column(LargeBinary, nullable=False)
    subida_por = Column(String, nullable=True)
    actualizada_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Actividad(Base):
    """Bitácora de lo que hace cada usuario (para los KPIs del panel de administración)."""
    __tablename__ = "actividad"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, index=True, nullable=False)
    # login, leer, guardar, word, zip, manual, excel
    tipo = Column(String, index=True, nullable=False)
    expediente_id = Column(String, index=True, nullable=True)
    numero_credito = Column(String, nullable=True)
    detalle = Column(JSON, nullable=True)
    creado_en = Column(DateTime(timezone=True), index=True, server_default=func.now())


class PlantillaVersion(Base):
    """Copia de cada versión de plantilla con la que se generó algún Word (por su huella sha256)."""
    __tablename__ = "plantilla_versiones"

    huella = Column(String, primary_key=True)
    nombre = Column(String, nullable=True)
    contenido = Column(LargeBinary, nullable=False)
    creada_en = Column(DateTime(timezone=True), server_default=func.now())


class Respaldo(Base):
    """Respaldos (ZIP) de toda la información; el admin los descarga desde el sistema."""
    __tablename__ = "respaldos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    creado_en = Column(DateTime(timezone=True), index=True, server_default=func.now())
    automatico = Column(Boolean, default=True)
    creado_por = Column(String, nullable=True)
    tamano = Column(Integer, nullable=True)
    contenido = Column(LargeBinary, nullable=False)


class Compartido(Base):
    """
    Acceso a expedientes de otra persona.
    - expediente_id con valor: ese expediente en particular.
    - todos=True (expediente_id vacío): TODOS los expedientes del propietario, también los que haga después.
    """
    __tablename__ = "compartidos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    propietario = Column(String, index=True, nullable=False)   # quién hizo los expedientes
    con_usuario = Column(String, index=True, nullable=False)   # a quién se le da acceso
    expediente_id = Column(String, index=True, nullable=True)
    todos = Column(Boolean, nullable=False, default=False)
    creado_por = Column(String, nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
