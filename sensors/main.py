import os
import time
import json
import math
import random
import threading
import paho.mqtt.client as mqtt
import requests
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--id', required=True, help="Set sensor id", type=str)
args = parser.parse_args()

SENSOR_ID = args.id
API_URL = os.environ["CONTROL_API_URL"]

TOPIC_DATA = f"sensors/{SENSOR_ID}/data"
TOPIC_CMD = f"control/sensors/{SENSOR_ID}"

config_lock = threading.Lock()
config = None


def fetch_status():
    return requests.get(f"{API_URL}/sensors/{SENSOR_ID}/status").json()


def fetch_config():
    return requests.get(f"{API_URL}/sensors/{SENSOR_ID}/config").json()


def generate_value(dist, typ):
    if typ == "temperature":
        hour = time.localtime().tm_hour
        base = dist["mean"] + 4 * math.sin((hour - 6) * math.pi / 12)
        return round(random.gauss(base, dist["std"]), 2)

    elif typ == "humidity":
        return round(random.gauss(dist["mean"], dist["std"]), 1)

    elif typ == "motion":
        return int(random.random() < dist["mean"])

    elif typ == "co2":
        return int(random.gauss(dist["mean"], dist["std"]))

    return 0


def on_message(client, userdata, msg):
    global config

    cmd = json.loads(msg.payload)

    if cmd["command"] == "reloadConfig":
        new_config = fetch_config()
        with config_lock:
            config = new_config


def heartbeat_loop(client):
    while True:
        client.publish(f"{API_URL}/sensors/{SENSOR_ID}/heartbeat", qos=0)
        time.sleep(30)


def run():
    global config

    client = mqtt.Client()
    client.username_pw_set(os.environ["MQTT_USER"], os.environ["MQTT_PASS"])
    client.on_message = on_message

    client.connect(os.environ["MQTT_HOST"], int(
        os.environ.get("MQTT_PORT", 1883)))
    client.subscribe(TOPIC_CMD)

    client.loop_start()

    threading.Thread(target=heartbeat_loop, args=(
        client,), daemon=True).start()

    while True:
        with config_lock:
            local_config = config.copy()

        if not local_config.get("enabled", True):
            time.sleep(1)
            continue

        payload = json.dumps({
            "sensorID": SENSOR_ID,
            "value": generate_value(local_config["dist"], local_config["type"]),
            "unit": local_config["unit"],
            "timestamp": int(time.time())
        })

        client.publish(TOPIC_DATA, payload, qos=0)
        time.sleep(local_config["interval"])


def main():
    global config

    status = fetch_status()
    print(status)
    return
    if status["alreadyRun"]:
        print(f"Sensor {SENSOR_ID} already running. Exiting.")
        return

    with config_lock:
        config = fetch_config()

    run()


if __name__ == "__main__":
    main()
