import aiosqlite

DB_PATH = "registry.db"


async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
          CREATE TABLE IF NOT EXISTS sensor (
                name     TEXT PRIMARY KEY,
                type     TEXT NOT NULL,
                location TEXT NOT NULL,
                lastSeen DATETIME,
                enabled  BOOLEAN DEFAULT 1,
                interval INTEGER DEFAULT 1,
                mean     REAL NOT NULL,
                std      REAL NOT NULL
            );
        """)

        await db.commit()
