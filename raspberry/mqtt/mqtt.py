import os
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
import csv
from threading import Thread

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from mqtt.database import (
	aggregate_sensor_readings,
	ensure_aggregate_sync_columns,
	get_room_id,
	insert_sensor_reading,
)
from sync.sync import AGGREGATE_RETRY_INTERVAL_SECONDS, sync_aggregates
from anomaly_detection.inference import FireAnomalyDetector


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
room_detectors = {}
ANOMALY_MODEL_PATH = (
	Path(__file__).resolve().parents[1]
	/ "anomaly_detection"
	/ "firebomba_baseline.pkl"
)
ANOMALY_RESULTS_PATH = Path(__file__).resolve().parent / "anomaly_results.csv"


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

	# Relay the live reading to AWS IoT so the cloud digital twin can show it.
	# Best effort: a failed relay must never block storing the reading locally.
	relay = cloud_client.publish(message.topic, payload=message.payload, qos=0)
	if relay.rc != mqtt.MQTT_ERR_SUCCESS:
		print(f"Failed to forward sensor reading to AWS IoT: {message.topic}: {relay.rc}")

	try:
		data = json.loads(message.payload.decode("utf-8"))
		device_id = data.get("deviceId")

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
		try:
			result = detect_room_reading(room_id, data)
			print(f"Fire anomaly detection for room {room_id}: {json.dumps(result)}")
		except Exception as error:
			print(f"Failed to detect fire anomaly for room {room_id}: {error}")
		else:
			client.publish(
				f"firebomba/room/{room_id}/anomaly",
				json.dumps({
					"anomaly_score": result["anomaly_score"],
					"timestamp": datetime.now(timezone.utc).isoformat(),
				}),
				qos=1,
			)
			try:
				save_anomaly_result(room_id, result, data)
			except Exception as error:
				print(f"Failed to save anomaly result for room {room_id}: {error}")
	except json.JSONDecodeError:
		print(f"Ignoring invalid sensor JSON: {message.topic}")
	except Exception as error:
		print(f"Failed to store sensor reading: {error}")


def detect_room_reading(room_id, data):
	"""Keep each room's trend history and adaptive baseline independent."""
	detector = room_detectors.get(room_id)
	if detector is None:
		detector = FireAnomalyDetector(ANOMALY_MODEL_PATH)
		room_detectors[room_id] = detector

	# The model retains its training feature names; these are raw readings,
	# evaluated on arrival rather than five-minute averages.
	return detector.detect({
		"avg_temperature": data.get("temperature"),
		"avg_humidity": data.get("humidity"),
		"avg_smoke": data.get("smoke"),
		"avg_co": data.get("co"),
	})


def save_anomaly_result(room_id, result, data):
    file_exists = ANOMALY_RESULTS_PATH.exists()

    with open(ANOMALY_RESULTS_PATH, "a", newline="") as file:
        writer = csv.writer(file)

        if not file_exists or ANOMALY_RESULTS_PATH.stat().st_size == 0:
            writer.writerow([
                "timestamp",
                "room_id",
                "temperature",
                "humidity",
                "smoke",
                "co",
                "raw_score",
                "anomaly_score",
                "value_scores",
                "trend_scores"
            ])

        writer.writerow([
            datetime.now(timezone.utc).isoformat(),
            room_id,
            data.get("temperature"),
            data.get("humidity"),
            data.get("smoke"),
            data.get("co"),
            result["raw_score"],
            result["anomaly_score"],
            json.dumps(result["value_scores"]),
            json.dumps(result["trend_scores"])
        ])

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
	ensure_aggregate_sync_columns()
	configure_clients()
	Thread(target=run_sensor_aggregation, daemon=True).start()
	Thread(target=run_aggregate_sync, daemon=True).start()
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


def run_sensor_aggregation():
	while True:
		now = datetime.now()
		seconds_until_next_window = (
			(5 - now.minute % 5) * 60
			- now.second
			- now.microsecond / 1_000_000
		)
		time.sleep(seconds_until_next_window)

		try:
			aggregate_sensor_readings()
			print("Completed five-minute sensor aggregation")
		except Exception as error:
			print(f"Failed to aggregate sensor readings: {error}")
			continue

		try:
			sync_aggregates()
		except Exception as error:
			print(f"Failed to sync sensor aggregates: {error}")


def run_aggregate_sync():
	while True:
		try:
			sync_aggregates()
		except Exception as error:
			print(f"Failed to sync sensor aggregates: {error}")
		time.sleep(AGGREGATE_RETRY_INTERVAL_SECONDS)


if __name__ == "__main__":
	main()
