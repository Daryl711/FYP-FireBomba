import os
import json
import re
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from mqtt.database import get_room_id, insert_sensor_reading


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

CLOUD_ENDPOINT = os.environ["AWS_IOT_ENDPOINT"]
CLOUD_PORT = int(os.getenv("AWS_IOT_PORT", "8883"))
CLOUD_CLIENT_ID = os.getenv("AWS_IOT_CLIENT_ID", "firebomba-pump-bridge")
CLOUD_ROOT_CA = os.environ["AWS_IOT_ROOT_CA_PATH"]
CLOUD_CERTIFICATE = os.environ["AWS_IOT_CERTIFICATE_PATH"]
CLOUD_PRIVATE_KEY = os.environ["AWS_IOT_PRIVATE_KEY_PATH"]

LOCAL_BROKER = os.getenv("LOCAL_MQTT_BROKER", "127.0.0.1")
LOCAL_PORT = int(os.getenv("LOCAL_MQTT_PORT", "1883"))

PUMP_COMMAND_TOPIC = re.compile(r"^firebomba/room/[^/]+/pump/command$")
PUMP_STATUS_TOPIC = re.compile(r"^firebomba/room/[^/]+/pump/status$")
SENSOR_DATA_TOPIC = re.compile(r"^firebomba/room/[^/]+/sensor-data$")


local_client = mqtt.Client(client_id="FireBomba-RaspberryPi-Local")
cloud_client = mqtt.Client(client_id=CLOUD_CLIENT_ID)


def on_local_connect(client, userdata, flags, rc):
	if rc == 0:
		print(f"Connected to local MQTT broker at {LOCAL_BROKER}:{LOCAL_PORT}")
		client.subscribe("firebomba/room/+/sensor-data", qos=1)
		client.subscribe("firebomba/room/+/pump/status", qos=1)
		print("Subscribed to: firebomba/room/+/sensor-data")
		print("Subscribed to: firebomba/room/+/pump/status")
	else:
		print(f"Local MQTT connection failed: {rc}")


def on_cloud_connect(client, userdata, flags, rc):
	if rc != 0:
		print(f"AWS IoT Core connection failed: {rc}")
		return

	topic = "firebomba/room/+/pump/command"
	client.subscribe(topic, qos=1)
	print(f"Connected to AWS IoT Core at {CLOUD_ENDPOINT}")
	print(f"Subscribed to: {topic}")


def on_cloud_message(client, userdata, message):
	if not PUMP_COMMAND_TOPIC.fullmatch(message.topic):
		return

	result = local_client.publish(
		message.topic,
		payload=message.payload,
		qos=message.qos,
		retain=message.retain,
	)

	if result.rc == mqtt.MQTT_ERR_SUCCESS:
		print(f"Forwarded AWS IoT command: {message.topic}")
	else:
		print(f"Failed to forward command {message.topic}: {result.rc}")


def on_local_message(client, userdata, message):
	if PUMP_STATUS_TOPIC.fullmatch(message.topic):
		result = cloud_client.publish(
			message.topic,
			payload=message.payload,
			qos=message.qos,
			retain=message.retain,
		)

		if result.rc == mqtt.MQTT_ERR_SUCCESS:
			print(f"Forwarded pump status to AWS IoT: {message.topic}")
		else:
			print(f"Failed to forward pump status {message.topic}: {result.rc}")
		return

	if not SENSOR_DATA_TOPIC.fullmatch(message.topic):
		return

	try:
		data = json.loads(message.payload.decode("utf-8"))
		device_id = data.get("device_id")

		if not device_id:
			print(f"Ignoring sensor reading without device_id: {message.topic}")
			return

		room_id = get_room_id(device_id)
		if room_id is None:
			print(f"Ignoring sensor reading from unknown device: {device_id}")
			return

		insert_sensor_reading(
			room_id,
			data.get("flame_detected"),
			data.get("temperature"),
			data.get("humidity"),
			data.get("smoke"),
			data.get("co"),
		)
		print(f"Sensor reading stored for room {room_id}")
	except json.JSONDecodeError:
		print(f"Ignoring invalid sensor JSON: {message.topic}")
	except Exception as error:
		print(f"Failed to store sensor reading: {error}")


def configure_clients():
	local_client.on_connect = on_local_connect
	local_client.on_message = on_local_message
	cloud_client.on_connect = on_cloud_connect
	cloud_client.on_message = on_cloud_message

	cloud_client.tls_set(
		ca_certs=CLOUD_ROOT_CA,
		certfile=CLOUD_CERTIFICATE,
		keyfile=CLOUD_PRIVATE_KEY,
	)


def main():
	configure_clients()
	connect_clients()

	local_client.loop_start()
	try:
		print("Waiting for AWS IoT pump commands...")
		cloud_client.loop_forever()
	finally:
		local_client.loop_stop()
		local_client.disconnect()
		cloud_client.disconnect()


def connect_clients():
	local_client.connect(LOCAL_BROKER, LOCAL_PORT, keepalive=60)
	cloud_client.connect(CLOUD_ENDPOINT, CLOUD_PORT, keepalive=60)


if __name__ == "__main__":
	main()
