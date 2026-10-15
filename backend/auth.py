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


LONGITUD_MINIMA_PASSWORD = 6


def validar_password_nueva(password: str):
    """Reglas mínimas para una contraseña nueva."""
    if not password or len(password) < LONGITUD_MINIMA_PASSWORD:
        raise HTTPException(status_code=400, detail=f"La contraseña debe tener al menos {LONGITUD_MINIMA_PASSWORD} caracteres.")
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="La contraseña es demasiado larga (máximo 72 caracteres).")


def cerrar_sesiones_de(db: Session, username: str, excepto: str = None):
    """Cierra todas las sesiones abiertas de un usuario (opcionalmente menos una)."""
    q = db.query(Sesion).filter(Sesion.username == username)
    if excepto:
        q = q.filter(Sesion.id != excepto)
    q.delete(synchronize_session=False)


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


class CambiarPasswordRequest(BaseModel):
    password_actual: str
    password_nueva: str


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

def session_id_de(request: Request):
    """
    Identificador de la sesión: de la cookie o del encabezado "Authorization: Bearer ...".
    El encabezado es necesario en iPhone/Safari, que bloquea las cookies entre
    sitios distintos (el frontend está en vercel.app y el backend en railway.app).
    """
    cookie = request.cookies.get("session_id")
    if cookie:
        return cookie
    encabezado = request.headers.get("authorization") or ""
    if encabezado.lower().startswith("bearer "):
        token = encabezado[7:].strip()
        return token or None
    return None


def obtener_sesion(request: Request, db: Session) -> dict:
    session_id = session_id_de(request)
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
    if not user or getattr(user, "activo", True) is False:
        # El usuario fue eliminado o desactivado: la sesión deja de valer
        db.delete(sesion)
        db.commit()
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada")

    # Último uso de la sesión (se actualiza como máximo cada 5 minutos)
    try:
        ultimo = getattr(sesion, "ultimo_uso", None)
        if ultimo is None or _a_utc(ultimo) < _ahora() - timedelta(minutes=5):
            sesion.ultimo_uso = _ahora()
            db.commit()
    except Exception:
        db.rollback()

    return {
        "id": str(user.id),
        "username": user.username,
        "es_admin": bool(sesion.es_admin),
        "role": sesion.role,
        "sesion_id": sesion.id,
        "nombre_mostrar": getattr(user, "nombre_mostrar", None) or "",
        "color_acento": getattr(user, "color_acento", None) or "",
        "tema": getattr(user, "tema", None) or "",
    }


def con_foto(usuario: dict, db: Session) -> dict:
    """Agrega la foto de perfil (solo en las respuestas que la necesitan)."""
    user = db.query(Usuario).filter(Usuario.username == usuario.get("username")).first()
    datos = {k: v for k, v in usuario.items() if k != "sesion_id"}
    datos["foto"] = getattr(user, "foto", None) or ""
    return datos


def datos_del_dispositivo(request: Request) -> dict:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "")
    return {"user_agent": (request.headers.get("user-agent") or "")[:300], "ip": ip[:60]}


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
def login(data: LoginRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    # Inserta el usuario admin por defecto si la tabla está vacía
    inicializar_usuarios_default(db)

    user = db.query(Usuario).filter(Usuario.username == data.username).first()

    if not user or not comprobar_password(user, data.password, db):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    # Solo se avisa que está desactivado si la contraseña era correcta
    if getattr(user, "activo", True) is False:
        raise HTTPException(status_code=403, detail="Tu usuario está desactivado. Contacta al administrador.")

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
        ultimo_uso=_ahora(),
        **datos_del_dispositivo(request),
    ))
    db.commit()
    try:
        import kpis
        kpis.registrar(user.username, "login")
    except Exception:
        pass

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
        # El frontend lo guarda y lo manda en "Authorization" (para iPhone/Safari)
        "token": session_id,
        "user": {
            "id": str(user.id),
            "username": user.username,
            "es_admin": es_administrador,
            "role": rol_nombre,
            "nombre_mostrar": getattr(user, "nombre_mostrar", None) or "",
            "color_acento": getattr(user, "color_acento", None) or "",
            "tema": getattr(user, "tema", None) or "",
            "foto": getattr(user, "foto", None) or "",
        }
    }


@router.get("/me")
def me(usuario: dict = Depends(require_user), db: Session = Depends(get_db)):
    return {"user": con_foto(usuario, db)}


@router.get("/sesion")
def estado_sesion(request: Request, db: Session = Depends(get_db)):
    """
    Igual que /me, pero responde 200 aunque no haya sesión.
    Lo usa el frontend al abrir la página para no llenar la consola de errores 401.
    """
    try:
        return {"autenticado": True, "user": con_foto(obtener_sesion(request, db), db)}
    except HTTPException:
        return {"autenticado": False, "user": None}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    session_id = session_id_de(request)
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


@router.post("/cambiar-password")
def cambiar_password(
    data: CambiarPasswordRequest,
    request: Request,
    usuario: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    """El usuario cambia su propia contraseña (debe escribir la actual)."""
    user_db = db.query(Usuario).filter(Usuario.username == usuario["username"]).first()
    if not user_db or not comprobar_password(user_db, data.password_actual, db):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")

    validar_password_nueva(data.password_nueva)
    if data.password_nueva == data.password_actual:
        raise HTTPException(status_code=400, detail="La contraseña nueva debe ser diferente a la actual.")

    user_db.password_hash = hash_password(data.password_nueva)
    # Por seguridad se cierran sus otras sesiones abiertas (otras computadoras)
    cerrar_sesiones_de(db, user_db.username, excepto=session_id_de(request))
    db.commit()
    return {"status": "exito", "mensaje": "Contraseña actualizada correctamente."}
