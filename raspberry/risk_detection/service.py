"""Risk MQTT handlers run by the existing Raspberry Pi bridge in mqtt.mqtt."""

import json
import logging
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from risk_detection.engine import INPUT_FIELDS


INTERVAL_SECONDS = 5.0
logger = logging.getLogger(__name__)


def subscribe_inputs(client):
    client.subscribe([(f"firebomba/room/+/{source}", 1) for source in INPUT_FIELDS])
    logger.info("Subscribed to YOLO, flame and anomaly topics")


def handle_message(engine, message):
    try:
        # Retained readings have an unknown age and may predate a restart.
        if message.retain:
            return
        engine.update(message.topic, json.loads(message.payload.decode("utf-8")))
    except (ValueError, UnicodeError) as error:
        logger.warning("Ignoring invalid input on %s: %s", message.topic, error)


def publish_risks(client, engine, alarm_client=None):
    for room_id, result in engine.evaluate().items():
        result.update(room_id=room_id, timestamp=datetime.now(timezone.utc).isoformat())
        # Local alarms must keep working while AWS IoT is unreachable. Refresh
        # the state each cycle so an ESP32 reconnect receives the current state.
        if alarm_client is not None:
            alarm_topic = f"firebomba/room/{room_id}/alarm/command"
            command = {
                "room_id": room_id,
                "command": "ON" if result["risk_level"] == "Critical" else "OFF",
                "risk_level": result["risk_level"],
                "timestamp": result["timestamp"],
            }
            info = alarm_client.publish(alarm_topic, json.dumps(command), qos=1, retain=False)
            if info.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.error("Alarm publish failed on %s: %s", alarm_topic, info.rc)
        if client is None:
            continue
        topic = f"firebomba/room/{room_id}/risk"
        info = client.publish(topic, json.dumps(result), qos=1, retain=False)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.error("Risk publish failed on %s: %s", topic, info.rc)
        else:
            logger.info("%s: %s", topic, result)


def run_risk_detection(local_client, cloud_client, engine, stop):
    """Use the bridge's connected clients; the bridge owns their lifecycle."""
    while not stop.wait(INTERVAL_SECONDS):
        if local_client.is_connected():
            publish_risks(
                cloud_client if cloud_client.is_connected() else None,
                engine,
                alarm_client=local_client,
            )


