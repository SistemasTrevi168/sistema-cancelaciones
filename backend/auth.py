from fastapi import APIRouter, Response, Request, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
import uuid

from database import get_db
from models import Usuario, Sesion

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

# Duración de la sesión (igual que la cookie: 24 horas)
DURACION_SESION = timedelta(hours=24)


def hash_password(password: str) -> str:
    # Truncar a 72 bytes si excede el límite estricto de bcrypt
    pwd_bytes = password.encode('utf-8')[:72]
    return pwd_context.hash(pwd_bytes.decode('utf-8', errors='ignore'))


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _a_utc(fecha: datetime) -> datetime:
    """Normaliza fechas sin zona horaria (algunas BD las regresan así) a UTC."""
    if fecha.tzinfo is None:
        return fecha.replace(tzinfo=timezone.utc)
    return fecha


def comprobar_password(user: Usuario, password: str, db: Session) -> bool:
    """
    Verifica la contraseña contra el hash bcrypt.
    Si en la BD quedó una contraseña en texto plano (insertada a mano), se acepta
    UNA vez y se reemplaza de inmediato por su versión encriptada, para que deje
    de existir en texto plano sin dejar fuera al usuario.
    """
    try:
        return pwd_context.verify(password, user.password_hash)
    except Exception:
        pass

    if user.password_hash and user.password_hash == password:
        user.password_hash = hash_password(password)
        db.commit()
        return True
    return False


router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


# Schemas de Pydantic
class LoginRequest(BaseModel):
    username: str
    password: str


class VerifyPasswordRequest(BaseModel):
    password: str


# --- SEMILLERO: CREAR USUARIOS INICIALES SI LA TABLA ESTÁ VACÍA ---
def inicializar_usuarios_default(db: Session):
    if db.query(Usuario).count() == 0:
        nuevo_admin = Usuario(
            username="admin",
            password_hash=hash_password("admin123"),
            es_admin=True
        )
        if hasattr(Usuario, "role"):
            setattr(nuevo_admin, "role", "admin")
        db.add(nuevo_admin)
        db.commit()


# --- DEPENDENCIAS DE SEGURIDAD (usar con Depends en los endpoints) ---

def obtener_sesion(request: Request, db: Session) -> dict:
    session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada")

    sesion = db.query(Sesion).filter(Sesion.id == session_id).first()
    if not sesion:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada")

    if _a_utc(sesion.expira_en) < _ahora():
        db.delete(sesion)
        db.commit()
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada")

    user = db.query(Usuario).filter(Usuario.username == sesion.username).first()
    if not user:
        # El usuario fue eliminado: la sesión deja de valer
        db.delete(sesion)
        db.commit()
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada")

    return {
        "id": str(user.id),
        "username": user.username,
        "es_admin": bool(sesion.es_admin),
        "role": sesion.role,
    }


def require_user(request: Request, db: Session = Depends(get_db)) -> dict:
    """Exige que haya una sesión iniciada. Regresa los datos del usuario."""
    return obtener_sesion(request, db)


def require_admin(usuario: dict = Depends(require_user)) -> dict:
    """Exige que el usuario de la sesión sea administrador."""
    if not usuario.get("es_admin"):
        raise HTTPException(status_code=403, detail="No tienes permisos de administrador")
    return usuario


# Se mantiene por compatibilidad con código anterior
get_current_user = require_user


# --- ENDPOINTS ---

@router.post("/login")
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    # Inserta el usuario admin por defecto si la tabla está vacía
    inicializar_usuarios_default(db)

    query = db.query(Usuario).filter(Usuario.username == data.username)
    if hasattr(Usuario, "activo"):
        query = query.filter(Usuario.activo == True)
    user = query.first()

    if not user or not comprobar_password(user, data.password, db):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    es_administrador = bool(getattr(user, "es_admin", False)) or getattr(user, "role", "") == "admin"
    rol_nombre = "admin" if es_administrador else getattr(user, "role", "operador")

    # Limpieza de sesiones vencidas
    db.query(Sesion).filter(Sesion.expira_en < _ahora()).delete(synchronize_session=False)

    session_id = str(uuid.uuid4())
    db.add(Sesion(
        id=session_id,
        username=user.username,
        es_admin=es_administrador,
        role=rol_nombre,
        expira_en=_ahora() + DURACION_SESION,
    ))
    db.commit()

    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,       # Protege la cookie contra JS malicioso (XSS)
        samesite="none",     # OBLIGATORIO: Permite compartir cookies entre Vercel y Railway
        secure=True,         # OBLIGATORIO: Requerido cuando samesite="none" (HTTPS)
        max_age=int(DURACION_SESION.total_seconds())
    )

    return {
        "status": "ok",
        "user": {
            "id": str(user.id),
            "username": user.username,
            "es_admin": es_administrador,
            "role": rol_nombre
        }
    }


@router.get("/me")
def me(usuario: dict = Depends(require_user)):
    return {"user": usuario}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    session_id = request.cookies.get("session_id")
    if session_id:
        db.query(Sesion).filter(Sesion.id == session_id).delete(synchronize_session=False)
        db.commit()

    response.delete_cookie("session_id", samesite="none", secure=True)
    return {"status": "sesion_cerrada"}


@router.post("/verify-password")
def verify_password_endpoint(
    data: VerifyPasswordRequest,
    usuario: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_db = db.query(Usuario).filter(Usuario.username == usuario["username"]).first()
    if not user_db or not comprobar_password(user_db, data.password, db):
        raise HTTPException(status_code=400, detail="Contraseña incorrecta")

    return {"status": "autorizado"}
