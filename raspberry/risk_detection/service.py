"""Run with python -m risk_detection.service from the raspberry directory."""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Event

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

from risk_detection.engine import INPUT_FIELDS, RiskEngine


INTERVAL_SECONDS = 5.0
logger = logging.getLogger(__name__)


def create_client(engine):
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=os.getenv("RISK_MQTT_CLIENT_ID", "FireBomba-RiskEngine"),
    )
    if os.getenv("MQTT_USERNAME"):
        client.username_pw_set(os.environ["MQTT_USERNAME"], os.getenv("MQTT_PASSWORD"))

    def on_connect(client, userdata, flags, reason_code, properties):
        if reason_code != 0:
            logger.error("Risk engine MQTT connection failed: %s", reason_code)
            return
        client.subscribe([(f"firebomba/room/+/{source}", 1) for source in INPUT_FIELDS])
        logger.info("Subscribed to YOLO, flame and anomaly topics")

    def on_message(client, userdata, message):
        try:
            # Retained readings have an unknown age and may predate a restart.
            if message.retain:
                return
            engine.update(message.topic, json.loads(message.payload.decode("utf-8")))
        except (ValueError, UnicodeError) as error:
            logger.warning("Ignoring invalid input on %s: %s", message.topic, error)

    client.on_connect = on_connect
    client.on_message = on_message
    return client


def publish_risks(client, engine):
    for room_id, result in engine.evaluate().items():
        result.update(room_id=room_id, timestamp=datetime.now(timezone.utc).isoformat())
        topic = f"firebomba/room/{room_id}/risk"
        info = client.publish(topic, json.dumps(result), qos=1, retain=False)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.error("Risk publish failed on %s: %s", topic, info.rc)
        else:
            logger.info("%s: %s", topic, result)


def main():
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    engine = RiskEngine(float(os.getenv("RISK_MAX_INPUT_AGE_SECONDS", "30")))
    client = create_client(engine)
    host = os.getenv("LOCAL_MQTT_BROKER", os.getenv("MQTT_HOST", "localhost"))
    port = int(os.getenv("LOCAL_MQTT_PORT", os.getenv("MQTT_PORT", "1883")))
    client.connect(host, port, keepalive=60)
    client.loop_start()
    stop = Event()
    try:
        # MQTT receives continuously; fusion and output happen every five seconds.
        while not stop.wait(INTERVAL_SECONDS):
            if client.is_connected():
                publish_risks(client, engine)
    except KeyboardInterrupt:
        logger.info("Stopping risk engine")
    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()
