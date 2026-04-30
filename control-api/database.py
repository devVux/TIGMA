import aiosqlite

DB_PATH = "registry.db"


async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS sensor(
                sensorID INTEGER PRIMARY KEY AUTOINCREMENT,
                name     TEXT NOT NULL,
                type     TEXT NOT NULL,
                location TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sensorStatus (
                sensorID INTEGER PRIMARY KEY,
                lastSeen DATETIME,
                FOREIGN KEY(sensorID) REFERENCES sensor(sensorID)
            );

            CREATE TABLE IF NOT EXISTS config(
                configID INTEGER PRIMARY KEY AUTOINCREMENT,
                sensorID INTEGER NOT NULL,
                enabled  BOOLEAN DEFAULT 1,
                interval INTEGER DEFAULT 1,
                mean     REAL NOT NULL,
                std      REAL NOT NULL,
                unit     TEXT,
                FOREIGN KEY(sensorID) REFERENCES sensor(sensorID)
            );

            CREATE TABLE IF NOT EXISTS commandLog (
                cmdID    INTEGER PRIMARY KEY AUTOINCREMENT,
                sensorID INTEGER,
                command  TEXT NOT NULL,
                sentAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(sensorID) REFERENCES sensor(sensorID)
            );
        """)

        await db.commit()
