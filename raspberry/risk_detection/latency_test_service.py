"""Run the standalone latency test on the Pi's LOCAL MQTT broker.

From the ``raspberry`` directory run:
    python -m risk_detection.latency_test_service

The service subscribes to the normal YOLO, flame, and anomaly input topics,
but publishes only to ``firebomba/room/<id>/risk/latency-test``. It does not
publish to AWS IoT or the production ``/risk`` topic, so it cannot feed the
backend's live risk stream or trigger production alerts.
"""

import json
import logging
import os
from pathlib import Path
from datetime import datetime, timezone
from time import perf_counter_ns

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

from risk_detection.latency_test_engine import INPUT_FIELDS, LatencyRiskEngine


logger = logging.getLogger("risk_latency_test")
INPUT_TOPICS = [
    (f"firebomba/room/+/{source}", 1)
    for source in ("yolo", "flame", "anomaly")
]
TEST_OUTPUT_TOPIC = "firebomba/room/{room_id}/risk/latency-test"


def subscribe_inputs(client):
    """Subscribe to the same three inputs used by the production risk model."""
    client.subscribe(INPUT_TOPICS)


def handle_message(engine, message, publisher):
    """Consume a sensor message and publish a timed result when a set is ready."""
    if getattr(message, "retain", False):
        logger.info("Ignoring retained input with unknown age: %s", message.topic)
        return None

    received_ns = perf_counter_ns()
    received_at = datetime.now(timezone.utc).isoformat()
    try:
        payload = json.loads(message.payload.decode("utf-8"))
        result = engine.update(
            message.topic,
            payload,
            received_ns=received_ns,
            received_at=received_at,
        )
    except (ValueError, UnicodeError) as error:
        logger.warning("Ignoring invalid input on %s: %s", message.topic, error)
        return None

    if result is None:
        return None

    topic = TEST_OUTPUT_TOPIC.format(room_id=result["room_id"])
    info = publisher.publish(topic, json.dumps(result), qos=1, retain=False)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        logger.error("Latency result publish failed on %s: %s", topic, info.rc)
    else:
        logger.info("Published latency result on %s: %s", topic, result)
    return result


def main():
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    logging.basicConfig(
        level=os.getenv("RISK_LATENCY_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    broker = os.getenv("LOCAL_MQTT_BROKER", "127.0.0.1")
    port = int(os.getenv("LOCAL_MQTT_PORT", "1883"))
    max_age = float(os.getenv("RISK_MAX_INPUT_AGE_SECONDS", "30"))
    username = os.getenv("LOCAL_MQTT_USERNAME")
    password = os.getenv("LOCAL_MQTT_PASSWORD")

    engine = LatencyRiskEngine(max_age_seconds=max_age)
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id="FireBomba-Risk-Latency-Test",
    )
    if username:
        client.username_pw_set(username, password)

    def on_connect(connected_client, _userdata, _flags, reason_code, _properties):
        if reason_code != 0:
            logger.error("Local MQTT connection failed: %s", reason_code)
            return
        logger.info("Connected to local MQTT broker %s:%s", broker, port)
        subscribe_inputs(connected_client)
        logger.info("Subscribed to test inputs: %s", INPUT_FIELDS)
        logger.info(
            "Timed results publish to firebomba/room/<room_id>/risk/latency-test"
        )

    def on_message(connected_client, _userdata, message):
        handle_message(engine, message, connected_client)

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(broker, port, keepalive=60)
    try:
        client.loop_forever()
    except KeyboardInterrupt:
        logger.info("Stopping risk latency test service")
    finally:
        client.disconnect()


if __name__ == "__main__":
    main()
