import uuid
from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey, LargeBinary
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

class Expediente(Base):
    __tablename__ = "expedientes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Columna que vincula el expediente al usuario
    usuario_propietario = Column(String, ForeignKey("usuarios.username"), nullable=False, default="admin")
    numero_credito = Column(String, index=True, nullable=False)
    manera = Column(String, default="MANERA_2")  # MANERA_1 o MANERA_2
    estado = Column(String, default="PENDIENTE")  # PENDIENTE, EN_REVISION, COMPLETADO, INCIDENCIA
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


class PlantillaSubida(Base):
    """Copia de las plantillas .docx subidas desde el panel de admin (para que no se pierdan al redesplegar)."""
    __tablename__ = "plantillas_subidas"

    nombre = Column(String, primary_key=True)
    contenido = Column(LargeBinary, nullable=False)
    subida_por = Column(String, nullable=True)
    actualizada_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
