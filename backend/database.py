from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
DATABASE_URL = os.getenv("DATABASE_URL")

# Leer la URL dinámica desde las variables de entorno de Railway
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
# pool_pre_ping: si la base cerró una conexión que llevaba rato sin usarse, se abre otra en lugar de dar error
engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True, pool_recycle=1800, pool_size=10, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()