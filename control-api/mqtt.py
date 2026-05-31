import paho.mqtt.client as mqtt
import os

_client: mqtt.Client = None


def get_mqtt_client() -> mqtt.Client:
    global _client

    if _client is None:
        _client = mqtt.Client()

        _client.connect(os.environ.get("MQTT_HOST"), 1883)
        _client.loop_start()

    return _client


def publish_command(sensor_name: str, payload: str):
    client = get_mqtt_client()
    client.publish(f"control/sensors/{sensor_name}", payload, qos=1)
