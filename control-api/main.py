from fastapi import FastAPI
from contextlib import asynccontextmanager
from database import init_db
from routers import sensors, commands


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(lifespan=lifespan)
app.include_router(sensors.router)
app.include_router(commands.router)
# TODO: add the locations router


@app.get("/health")
async def health():
    print("asdsa")
    return {"status": "ok"}
