from fastapi import APIRouter, Depends, HTTPException, status
from database import get_db
from models import Sensor, SensorUpdate
from time import time
import json
from mqtt import publish_command

router = APIRouter(prefix="/sensors", tags=["sensors"])


@router.get("")
@router.get("/")
async def list_sensors(location: str = None, type: str = None, db=Depends(get_db)):
    now = int(time())
    timeout = 30

    query = """
        SELECT *,
            CASE
                WHEN lastSeen IS NULL THEN 'dead'
                WHEN (? - lastSeen) > ? THEN 'dead'
                ELSE 'alive'
            END as status
        FROM sensor
        WHERE 1=1
    """

    params = [now, timeout]

    if location:
        query += " AND s.location = ?"
        params.append(location)
    if type:
        query += " AND s.type = ?"
        params.append(type)

    async with db.execute(query, params) as cur:
        return [dict(r) for r in await cur.fetchall()]


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_sensor(body: Sensor, db=Depends(get_db)):
    try:
        await db.execute(
            "INSERT INTO sensor(name, type, location, interval, mean, std) VALUES (?, ?, ?, ?, ?, ?)",
            (body.name, body.type, body.location,
             body.interval, body.mean, body.std)
        )
        await db.commit()

    except Exception:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sensor already exists")

    return {"name": body.name}


@router.get("/{sensor_name}")
async def get_sensor(sensor_name: str, db=Depends(get_db)):
    async with db.execute("SELECT * FROM sensor WHERE name = ?", (sensor_name,)) as cur:
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sensor not found")

    return dict(row)


@router.put("/{sensor_name}")
async def update_sensor(sensor_name: str, body: SensorUpdate, db=Depends(get_db)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")

    set_clause = ", ".join(f"{k} = ?" for k in fields)

    cur = await db.execute(
        f"UPDATE sensor SET {set_clause} WHERE name = ?",
        (*fields.values(), sensor_name)
    )
    await db.commit()

    if cur.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sensor not found")

    publish_command(sensor_name, json.dumps({
        "command": "reloadConfig",
        "config": fields
    }))

    return {"updated": sensor_name}


@router.delete("/{sensor_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sensor(sensor_name: str, db=Depends(get_db)):
    await db.execute("DELETE FROM sensor WHERE name = ?", (sensor_name,))
    await db.commit()


@router.post("/{sensor_name}/heartbeat", status_code=204)
async def send_heartbeat(sensor_name: str, db=Depends(get_db)):
    async with db.execute("SELECT 1 FROM sensor WHERE name = ?", (sensor_name,)) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "Sensor not found")

    now = int(time())

    await db.execute("UPDATE sensor SET lastSeen = ? WHERE name = ?", (now, sensor_name))

    await db.commit()
