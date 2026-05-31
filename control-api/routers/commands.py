from fastapi import APIRouter, Depends
from database import get_db
from time import time

router = APIRouter(tags=["commands"])


@router.get("/statuses")
async def sensor_status(threshold: int = 30, db=Depends(get_db)):
    now = int(time())

    query = """
        SELECT name,
            CASE
                WHEN lastSeen IS NOT NULL AND (? - lastSeen) <= ? THEN 'alive'
                ELSE 'dead'
            END as status
        FROM sensor
    """

    async with db.execute(query, (now, threshold)) as cur:
        res = await cur.fetchall()
        print([dict(r) for r in res])
        return [dict(r) for r in res]
