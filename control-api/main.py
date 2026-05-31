from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import init_db
from routers import sensors, commands


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    print("app shutting down")


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(sensors.router)
app.include_router(commands.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
