from fastapi import APIRouter, Depends, HTTPException, status
from database import get_db
from models import SensorCreate, SensorUpdate

router = APIRouter(prefix="/sensors", tags=["sensors"])


@router.get("/")
async def list_sensors(location: str = None, type: str = None, db=Depends(get_db)):
    query = "SELECT * FROM sensor WHERE 1=1"

    params = []
    if location:
        query += " AND location = ?"
        params.append(location)
    if type:
        query += " AND type = ?"
        params.append(type)

    async with db.execute(query, params) as cur:
        return [dict(r) for r in await cur.fetchall()]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def register_sensor(body: SensorCreate, db=Depends(get_db)):
    cur = await db.execute(
        "INSERT INTO sensor(name, type, location) VALUES (?, ?, ?)",
        (body.name, body.type, body.location)
    )
    await db.commit()

    if cur.rowcount == 0:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sensor not found")

    return {"sensorID": cur.lastrowid}


@router.get("/{sensor_id}")
async def get_sensor(sensor_id: str, db=Depends(get_db)):
    async with db.execute("SELECT * FROM sensor WHERE sensorID = ?", (sensor_id,)) as cur:
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sensor not found")

    return dict(row)


@router.put("/{sensor_id}")
async def update_sensor(sensor_id: str, body: SensorUpdate, db=Depends(get_db)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}

    # same thing as before
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    cur = await db.execute(
        f"UPDATE sensor SET {set_clause} WHERE sensorID = ?",
        (*fields.values(), sensor_id)
    )
    await db.commit()

    if cur.rowcount == 0:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sensor not found")

    return {"updated": sensor_id}


@router.delete("/{sensor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sensor(sensor_id: str, db=Depends(get_db)):
    await db.execute("DELETE FROM sensor WHERE sensorID = ?", (sensor_id,))
    await db.commit()


@router.get("/{sensor_id}/status")
async def get_status(sensor_id: str, db=Depends(get_db)):
    async with db.execute("SELECT * FROM sensorStatus WHERE sensorID = ?", (sensor_id,)) as cur:
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No status available")

    return dict(row)


@router.get("/{sensor_id}/config")
async def get_config(sensor_id: str, db=Depends(get_db)):
    async with db.execute("SELECT * FROM config WHERE sensorID = ?", (sensor_id,)) as cur:
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No config available")

    return dict(row)
