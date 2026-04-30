# TIGMA — Sensor Design

## Overview

Sensors are lightweight containerized processes that generate time-series data according to a statistical distribution, publish it over MQTT, and receive control commands via a reverse MQTT channel.
All configuration is owned by the Control API registry; sensors are stateless beyond their ID.

---

## Architecture

```
[Control API / Registry]
        │
        │  GET /sensors/{id}/status  (on startup)
        │  GET /sensors/{id}/config  (on startup)
        ▼
[Sensor Process]
        │
        ├──publish──► sensors/{id}/data       ──► [Telegraf] ──► [InfluxDB]
        ├──publish──► heartbeat/{id}          ──► [Telegraf] ──► [InfluxDB]
        └──subscribe─ control/sensors/{id}    ◄── [Control API]
```

---

## Sensor Identity

Each sensor is assigned a unique ID at launch via named CLI argument:

```bash
python sensor.py temp-01
```

In real-world production, this ID is equivalent to a hardware-burned identifier such as a LoRaWAN `DevEUI`, tied to a user account on a cloud service (e.g. The Things Network). The container replaces the physical device; the ID replaces the burned-in address.

---

## Configuration — Registry as Single Source of Truth

No sensor-specific configuration lives in `docker-compose.yml` or environment variables.
On startup, the sensor queries the Control API using its ID and receives its full configuration:

**Example registry response:**

```json
{
  "sensor_id": "temp-01",
  "type": "temperature",
  "unit": "°C",
  "publish_interval": 10,
  "already_run": false,
  "distribution": {
    "mean": 20,
    "std": 0.5
  }
}
```

This allows multiple sensors of the same type with different parameters (e.g. two temperature sensors with different means) to share a single Docker image — only the ID differs between containers.

---

## Singleton Enforcement

To prevent the same sensor from running as multiple concurrent processes, the registry queries InfluxDB for the last heartbeat.

On startup:
1. Sensor queries the control api if another instance is already running.
2. If `true` the process exits without calling `run()`.
3. If `false`, the sensor fetches its config.

---

## Value Generation — Distributions

Each sensor type encapsulates its own statistical model. The distribution parameters (mean, std, etc.) come from the registry config.

```python
class TemperatureSensor:
    def __init__(self, mean, std):
        self.mean = mean
        self.std  = std

    def read(self):
        hour = time.localtime().tm_hour
        base = self.mean + 4 * math.sin((hour - 6) * math.pi / 12)  # diurnal cycle
        return round(random.gauss(base, self.std), 2)

class HumiditySensor:
    def read(self):
        return round(random.gauss(self.mean, self.std), 1)

class MotionSensor:
    def read(self):
        return int(random.random() < self.mean)  # mean = probability of motion

class CO2Sensor:
    def read(self):
        return int(random.gauss(self.mean, self.std))
```

Sensor type is resolved from the registry `type` field to the appropriate class at runtime.

---

## MQTT Topics

| Topic | Direction | Purpose |
|---|---|---|
| `sensors/{id}/data` | publish | Sensor readings |
| `heartbeat/{id}` | publish | Liveness signal |
| `control/sensors/{id}` | subscribe | Commands from Control API |

---

## Heartbeats & Liveness

Sensors publish a Unix timestamp to `heartbeat/{id}` every 30 seconds on a background thread. Telegraf consumes this topic and writes `last_seen` per sensor into InfluxDB.

The Control API uses this data to detect dead sensors. Two options:

**Option A — On-demand check (simpler):**  
On `GET /sensors/{id}`, the API queries InfluxDB for `last_seen`. If `now - last_seen > threshold`, it clears `already_run`.

**Option B — Background polling (more robust for large fleets):**

```python
def check_heartbeats():
    for sensor in db.get_all_sensors():
        last_seen = influx.query_last_heartbeat(sensor.id)
        if time.time() - last_seen > HEARTBEAT_TIMEOUT:
            sensor.already_run = False
            db.save(sensor)
```

Recommended timeout: `3 × heartbeat_interval` (e.g. 90s for a 30s interval) to tolerate transient drops.

---

## Control Commands

Sensors subscribe to `control/sensors/{id}` and handle commands at runtime without restarting:

```python
def on_message(client, userdata, msg):
    global interval, config, dist
    cmd = json.loads(msg.payload)

    if cmd["command"] == "reload_config":
        config   = fetch_config()
        dist     = config["distribution"]
        interval = config["publish_interval"]

    elif cmd["command"] == "set_interval":
        interval = cmd["value"]
```

Supported commands:

| Command | Effect |
|---|---|
| `reload_config` | Re-fetches full config from registry |
| `set_interval` | Updates publish interval in-process |

---

## Full Sensor Implementation

```python
import os, sys, time, json, math, random, threading
import paho.mqtt.client as mqtt
import requests

SENSOR_ID = sys.argv[1]
API_URL   = os.environ["CONTROL_API_URL"]
interval  = 10
dist      = {}

TOPIC_DATA = f"sensors/{SENSOR_ID}/data"
TOPIC_CMD  = f"control/sensors/{SENSOR_ID}"
TOPIC_HB   = f"heartbeat/{SENSOR_ID}"

def fetch_config():
    r = requests.get(f"{API_URL}/sensors/{SENSOR_ID}/config")
    r.raise_for_status()
    return r.json()

def generate_value(config):
    d = config["distribution"]
    t = config["type"]
    if t == "temperature":
        hour = time.localtime().tm_hour
        base = d["mean"] + 4 * math.sin((hour - 6) * math.pi / 12)
        return round(random.gauss(base, d["std"]), 2)
    elif t == "humidity":
        return round(random.gauss(d["mean"], d["std"]), 1)
    elif t == "motion":
        return int(random.random() < d["mean"])
    elif t == "co2":
        return int(random.gauss(d["mean"], d["std"]))
    return 0

def on_message(client, userdata, msg):
    global interval, config
    cmd = json.loads(msg.payload)
    if cmd["command"] == "reload_config":
        config   = fetch_config()
        interval = config["publish_interval"]
    elif cmd["command"] == "set_interval":
        interval = cmd["value"]

def heartbeat_loop(client):
    while True:
        client.publish(TOPIC_HB, int(time.time()), qos=0)
        time.sleep(30)

def run(config):
    global interval
    interval = config["publish_interval"]

    client = mqtt.Client()
    client.username_pw_set(os.environ["MQTT_USER"], os.environ["MQTT_PASS"])
    client.on_message = on_message
    client.connect(os.environ["MQTT_HOST"], int(os.environ.get("MQTT_PORT", 1883)))
    client.subscribe(TOPIC_CMD)
    client.loop_start()

    threading.Thread(target=heartbeat_loop, args=(client,), daemon=True).start()

    while True:
        payload = json.dumps({
            "sensor_id": SENSOR_ID,
            "value":     generate_value(config),
            "unit":      config["unit"],
            "timestamp": int(time.time())
        })
        client.publish(TOPIC_DATA, payload, qos=0)
        time.sleep(interval)

def main():
    status = requests.get(f"{API_URL}/sensors/{SENSOR_ID}/status")

    if status["already_run"]:
        print(f"Sensor {SENSOR_ID} already running. Exiting.")
        return

    # No need for the following, we will send heartbeats as soon as we run
    # requests.patch(f"{API_URL}/sensors/{SENSOR_ID}", json={"already_run": True})
    run(status)

if __name__ == "__main__":
    main()
```

---

## Docker Compose

All sensor containers share the same image. The only difference between them is the `command` argument — the sensor ID.

```yaml
sensor-temp-01:
  image: sensor
  command: ["python", "sensor.py", "temp-01"]
  environment:
    CONTROL_API_URL: http://control-api:8080
    MQTT_HOST: mosquitto
    MQTT_USER: sensor
    MQTT_PASS: secret

sensor-temp-02:
  image: sensor
  command: ["python", "sensor.py", "temp-02"]
  environment:
    CONTROL_API_URL: http://control-api:8080
    MQTT_HOST: mosquitto
    MQTT_USER: sensor
    MQTT_PASS: secret
```

Distribution parameters, intervals, units, and types all live in the registry — not here.

---

## Dockerfile

```dockerfile
FROM python:3.11-slim
RUN pip install paho-mqtt requests
COPY sensor.py .
CMD ["python", "sensor.py"]
```

---

## Design Principles Summary

| Concern | Solution |
|---|---|
| Sensor config | Owned entirely by Control API registry |
| Sensor identity | CLI argument (mirrors hardware DevEUI pattern) |
| Multi-instance prevention | `already_run` flag in registry |
| Dead sensor detection | Heartbeat via MQTT → InfluxDB, registry resets flag on expiry |
| Runtime reconfiguration | `reload_config` command via MQTT control topic |
| Heterogeneous sensors | Same image, different IDs and registry entries |
| Scaling | Add registry entry + compose service; no infra changes |
