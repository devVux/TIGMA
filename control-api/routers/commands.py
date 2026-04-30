from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from models import CommandCreate
from mqtt import publish_command
from time import time

router = APIRouter(prefix="/sensors", tags=["commands"])


@router.post("/{sensor_id}/command", status_code=202)
async def send_command(sensor_id: int, body: CommandCreate, db=Depends(get_db)):
    async with db.execute("SELECT sensorID FROM sensor WHERE sensorID = ?", (sensor_id,)) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Sensor not found")

    publish_command(sensor_id, body.command)

    cur = await db.execute(
        "INSERT INTO commandLog (sensorID, command) VALUES (?, ?)",
        (sensor_id, body.command)
    )
    await db.commit()

    return {"cmdID": cur.lastrowid}


@router.post("/{sensor_id}/heartbeat", status_code=204)
async def send_heartbeat(sensor_id: int, db=Depends(get_db)):
    async with db.execute("SELECT 1 FROM sensor WHERE sensorID = ?", (sensor_id,)) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Sensor not found")

    now = int(time())

    await db.execute("""
        INSERT INTO sensorStatus(sensorID, lastSeen)
        VALUES (?, ?)
        ON CONFLICT(sensorID) DO UPDATE SET
            lastSeen=excluded.lastSeen
    """, (sensor_id, now))

    await db.commit()
