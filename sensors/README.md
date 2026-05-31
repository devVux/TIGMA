# TIGMA — Sensor Design

## Overview

Each sensor is a lightweight process that:
- generates synthetic time-series data
- publishes it via MQTT
- receives runtime control commands via MQTT
- fetches its configuration from a central Control API

Sensors are stateless except for their in-memory config.

---

## Runtime Behavior

On startup the process:

1. Registers itself in the Control API (`POST /sensors`)
2. Fetches initial config (`GET /sensors/{id}`)
3. Starts MQTT client
4. Starts heartbeat thread
5. Enters publish loop

If registration returns `409`, the sensor continues (already exists).

---

## Identity

Each sensor is identified by:

- `SENSOR_NAME` env var (default: `"sensor"`)

---

## MQTT Topics

| Topic                    | Direction | Purpose          |
| ------------------------ | --------- | ---------------- |
| `sensors/{name}/data`    | publish   | sensor readings  |
| `control/sensors/{name}` | subscribe | runtime commands |

---

## Heartbeat

Every 30 seconds:

```http
POST /sensors/{name}/heartbeat
```

Used by Control API to detect liveness and reset state.

---

## Runtime Config Updates

MQTT control messages:

### Reload config

```json
{ "command": "reloadConfig" }
```

Action:

* re-fetches config from API
* replaces local config atomically

---

## Publish Loop

Every `interval` seconds:

* generate value from config
* publish only if `enabled = true`

Payload:

```json
{
  "sensor_name": "...",
  "value": 0,
  "timestamp": 1234567890
}
```

---

## Concurrency Model

* main thread: publish loop
* thread 1: heartbeat loop
* MQTT thread: command handling

Shared config is protected by a lock.

---

## MQTT Client

Uses:

* `paho-mqtt` v2 callback API
* QoS 0
* auto reconnect handled by library loop

---

## Docker Usage

All sensors share the same image:

```dockerfile
FROM python:3.11-slim
RUN pip install paho-mqtt requests
COPY sensor.py .
CMD ["python", "sensor.py"]
```

Example:

```yaml
sensor-temp-01:
  image: sensor
  environment:
    SENSOR_NAME: temp-01
    SENSOR_TYPE: temperature
    SENSOR_LOCATION: lab
    CONTROL_API_URL: http://control-api:8080
    MQTT_DATA_HOST: mosquitto
    MQTT_DATA_PORT: 1883
    SENSOR_INTERVAL: 20
    SENSOR_MEAN: 20
    SENSOR_STD: 1
```

---

## Dynamic Sensor Creation

New sensors can be created on-demand by launching a container with a new `SENSOR_NAME`.

Example:

```bash
docker run --rm \
  --network tigma_app-net \
  -e SENSOR_NAME=co2 \
  -e CONTROL_API_URL=http://api:8000 \
  -e MQTT_DATA_HOST=mqtt \
  tigma-sensor
```

---

## Key Design Points

* configuration is pulled, never hardcoded
* sensor identity = environment variable
* runtime updates via MQTT command channel
* heartbeat-based liveness tracking
* stateless containers (except runtime config)
* multi-sensor scaling via env vars only

