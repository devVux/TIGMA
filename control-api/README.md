## Control API Design

### REST Endpoints

```
# Device Registry
GET    /sensors              # list all sensors (filterable by location, type, owner)
POST   /sensors              # register new sensor
GET    /sensors/{id}         # get sensor metadata
PUT    /sensors/{id}         # update metadata
DELETE /sensors/{id}         # deregister sensor

# Control
POST   /sensors/{id}/command # send command → publishes to control/sensors/{id}
GET    /sensors/{id}/status  # last known status (heartbeat from sensor)

# Locations
GET    /locations
POST   /locations
GET    /locations/{id}/sensors

# Health
GET    /health
```

### SQLite Schema

```sql
CREATE TABLE locations (
    id          TEXT PRIMARY KEY,  -- e.g. "house-a"
    name        TEXT NOT NULL,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sensors (
    id          TEXT PRIMARY KEY,  -- matches MQTT client ID and topic segment
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,     -- e.g. "temperature", "humidity", "multi"
    owner       TEXT,
    location_id TEXT REFERENCES locations(id),
    mqtt_topic  TEXT NOT NULL,     -- publish topic, e.g. "sensors/house-a/temp-01"
    enabled     BOOLEAN DEFAULT 1,
    metadata    TEXT,              -- JSON blob for type-specific config
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sensor_status (
    sensor_id   TEXT PRIMARY KEY REFERENCES sensors(id),
    last_seen   DATETIME,
    last_payload TEXT,             -- JSON of last heartbeat
    updated_at  DATETIME
);

CREATE TABLE command_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id   TEXT REFERENCES sensors(id),
    command     TEXT NOT NULL,     -- JSON payload sent
    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    status      TEXT DEFAULT 'sent'  -- sent | acked | failed
);
```

### Key Design Decisions

- **`sensor.id` is the single source of truth** — used as MQTT topic segment, registry key, and InfluxDB tag. No ID translation needed across layers.
- **`metadata` JSON blob** keeps the schema stable while allowing type-specific fields (e.g. sampling interval, unit, thresholds) without extra tables.
- **`sensor_status`** is updated by sensors publishing heartbeats to `sensors/{id}/status`; Telegraf or the API subscribes to that topic.
- **`command_log`** gives you an audit trail. `acked` status requires sensors to publish a confirmation back.
- **SQLite** is sufficient here — single-writer, low concurrency. Swap to Postgres if the API scales horizontally.
