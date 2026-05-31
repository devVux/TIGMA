import os
import time
import json
import math
import random
import threading
import paho.mqtt.client as mqtt
import requests

API_URL = os.environ["CONTROL_API_URL"]
SENSOR_NAME = os.getenv("SENSOR_NAME", "sensor")
TOPIC_DATA = f"sensors/{SENSOR_NAME}/data"
TOPIC_CMD = f"control/sensors/{SENSOR_NAME}"

config_lock = threading.Lock()
config = {}


def fetch_config():
    r = requests.get(f"{API_URL}/sensors/{SENSOR_NAME}")
    r.raise_for_status()
    return r.json()


def generate_value(typ: str, mean: float, std: float = None):
    if typ == "temperature":
        hour = time.localtime().tm_hour
        base = mean + 4 * math.sin((hour - 6) * math.pi / 12)
        return round(random.gauss(base, std), 2)
    if typ == "humidity":
        return round(random.gauss(mean, std), 1)
    if typ == "motion":
        return int(random.random() < mean)
    if typ == "co2":
        return int(random.gauss(mean, std))
    return 0


def on_message(client, userdata, msg):
    global config

    cmd = json.loads(msg.payload.decode())

    if cmd.get("command") == "reloadConfig":
        new_config = fetch_config()

        with config_lock:
            config = new_config

        print(f"New config: {config}")


def heartbeat_loop():
    while True:
        try:
            requests.post(f"{API_URL}/sensors/{SENSOR_NAME}/heartbeat")
        except Exception as e:
            print(f"Heartbeat error: {e}")

        time.sleep(30)


def run():
    global config

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

    client.on_message = on_message

    client.connect(
        os.environ["MQTT_DATA_HOST"],
        int(os.environ.get("MQTT_DATA_PORT", 1883))
    )

    client.subscribe(TOPIC_CMD)
    client.loop_start()

    threading.Thread(target=heartbeat_loop, daemon=True).start()
    config = fetch_config()

    print(f"Started with config: {config}")

    while True:

        with config_lock:
            local_config = config.copy()

        payload = {
            "sensor_name": SENSOR_NAME,
            "value": generate_value(
                local_config["type"],
                local_config["mean"],
                local_config["std"],
            ),
            "timestamp": int(time.time())
        }
        print(f"payload={payload}")

        if local_config["enabled"]:
            client.publish(TOPIC_DATA, json.dumps(payload), qos=0)

        time.sleep(local_config["interval"])


if __name__ == "__main__":

    r = requests.post(
        f"{API_URL}/sensors",
        json={
            "name": SENSOR_NAME,
            "type": os.getenv("SENSOR_TYPE", "temperature"),
            "location": os.getenv("SENSOR_LOCATION", "lab"),
            "enabled": True,
            "interval": float(os.getenv("SENSOR_INTERVAL", "20")),
            "mean": float(os.getenv("SENSOR_MEAN", "20")),
            "std": float(os.getenv("SENSOR_STD", "1"))
        }
    )
    if r.status_code not in (201, 409):
        r.raise_for_status()

    print(f"Starting {SENSOR_NAME}...")
    run()
