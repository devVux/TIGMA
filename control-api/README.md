## Control API Design

### Endpoints

```

GET    /sensors
POST   /sensors
GET    /sensors/{name}
PUT    /sensors/{name}
DELETE /sensors/{name}

POST   /sensors/{name}/heartbeat
GET    /statuses

POST   /sensors/{name}/command

````

---

## Database (SQLite)

```sql
CREATE TABLE sensor (
    name TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    location TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    interval INTEGER DEFAULT 10,
    mean REAL NOT NULL,
    std REAL NOT NULL,
    lastSeen INTEGER
);
````

---

## Core Rules

* `name` is global ID (MQTT + API + DB)
* `lastSeen` updated via heartbeat
* `alive = now - lastSeen <= threshold`
* PUT updates config + sends MQTT `reloadConfig`
* no separate status service (computed on demand)

---

## Flow

### Heartbeat

```
POST /sensors/{name}/heartbeat
→ updates lastSeen
```

### Update

```
PUT /sensors/{name}
→ DB update
→ MQTT reloadConfig
```

### Status

```
GET /statuses
→ computes alive/dead from lastSeen
```

---

## Notes

* async SQLite (`aiosqlite`)
* minimal schema on purpose
* MQTT only used for runtime control
* scalable later to Postgres without changes in logic

```
