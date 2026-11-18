"""Simulate a critical fire on the Pi's LOCAL MQTT broker.

From the ``raspberry`` directory run:
    python -m risk_detection.simulate_critical_fire
    python -m risk_detection.simulate_critical_fire --room 1 --duration 30
    python -m risk_detection.simulate_critical_fire --alarm-only
    python -m risk_detection.simulate_critical_fire --clear
    python -m risk_detection.simulate_critical_fire --dry-run

Every interval it publishes, for the chosen room:

1. Risk-engine inputs that score Critical (YOLO 0.95, flame 1, anomaly 0.95)
   on ``firebomba/room/<id>/yolo``, ``/flame`` and ``/anomaly``. When the
   bridge (``python -m mqtt.mqtt``) is running, its risk engine evaluates them,
   publishes ``/risk`` to AWS IoT (backend Critical alert + push notification)
   and its own alarm command.
2. ``{"command": "ON", ...}`` on ``firebomba/room/<id>/alarm/command`` directly,
   so the ESP32 forwards ``Risk:CRITICAL`` to the Uno and the LED and buzzer
   sound even if the bridge is not running.

On exit (duration elapsed or Ctrl+C) it sends ``command: "OFF"`` so the alarm
does not stay latched, unless ``--keep-on`` is given.
"""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DEFAULT_BROKER = os.getenv("LOCAL_MQTT_BROKER", "127.0.0.1")
DEFAULT_PORT = int(os.getenv("LOCAL_MQTT_PORT", "1883"))
DEFAULT_ROOM = os.getenv("ROOM_ID", "1")

CRITICAL_YOLO = 0.95
CRITICAL_FLAME = 1
CRITICAL_ANOMALY = 0.95


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def input_messages(room_id):
    """Inputs that score Critical in normal, sensor-only and camera-only modes."""
    timestamp = now_iso()  # fresh per frame: the engine drops repeated timestamps
    return [
        (f"firebomba/room/{room_id}/yolo", {
            "status": "connected",
            "device_id": "SIMULATED_CAMERA",
            "source": "simulate_critical_fire",
            "yolo_confidence": CRITICAL_YOLO,
            "timestamp": timestamp,
        }),
        (f"firebomba/room/{room_id}/flame", {"flame_detected": CRITICAL_FLAME}),
        (f"firebomba/room/{room_id}/anomaly", {
            "anomaly_score": CRITICAL_ANOMALY,
            "timestamp": timestamp,
        }),
    ]


def alarm_message(room_id, on):
    return (f"firebomba/room/{room_id}/alarm/command", {
        "room_id": str(room_id),
        "command": "ON" if on else "OFF",
        "risk_level": "Critical" if on else "Normal",
        "timestamp": now_iso(),
        "simulated": True,
    })


def make_client(client_id):
    # paho-mqtt 2.x requires a callback API version; 1.x does not accept one.
    if hasattr(mqtt, "CallbackAPIVersion"):
        return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    return mqtt.Client(client_id=client_id)


def publish(client, topic, payload, dry_run):
    body = json.dumps(payload)
    print(f"  -> {topic} {body}")
    if dry_run:
        return
    info = client.publish(topic, body, qos=1, retain=False)
    info.wait_for_publish(timeout=5)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        print(f"     publish failed: rc={info.rc}")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Simulate a critical fire over MQTT.")
    parser.add_argument("--room", default=DEFAULT_ROOM, help="room ID (ESP32 listens on room 1)")
    parser.add_argument("--broker", default=DEFAULT_BROKER, help="local MQTT broker host")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="local MQTT broker port")
    parser.add_argument("--username", default=os.getenv("LOCAL_MQTT_USERNAME"))
    parser.add_argument("--password", default=os.getenv("LOCAL_MQTT_PASSWORD"))
    parser.add_argument("--duration", type=float, default=20.0,
                        help="seconds to keep the fire going (0 = until Ctrl+C)")
    parser.add_argument("--interval", type=float, default=1.0,
                        help="seconds between publishes (keep below the ESP32's 5 s)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--alarm-only", action="store_true",
                      help="only send the buzzer/LED command, skip risk-engine inputs")
    mode.add_argument("--no-alarm", action="store_true",
                      help="only send risk-engine inputs; let the bridge drive the alarm")
    mode.add_argument("--clear", action="store_true",
                      help="send a single alarm OFF command and exit")
    parser.add_argument("--keep-on", action="store_true",
                        help="do not send alarm OFF on exit")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the messages without connecting")
    args = parser.parse_args(argv)
    if args.interval <= 0:
        parser.error("--interval must be positive")
    if args.duration < 0:
        parser.error("--duration must be zero or positive")
    return args


def main(argv=None):
    args = parse_args(argv)
    client = None
    if not args.dry_run:
        client = make_client(f"FireBomba-CriticalFireSim-{os.getpid()}")
        if args.username:
            client.username_pw_set(args.username, args.password)
        client.connect(args.broker, args.port, keepalive=60)
        client.loop_start()
        print(f"Connected to {args.broker}:{args.port}")

    try:
        if args.clear:
            print(f"Clearing alarm for room {args.room}")
            publish(client, *alarm_message(args.room, on=False), args.dry_run)
            return

        print(f"Simulating CRITICAL fire in room {args.room} "
              f"({'until Ctrl+C' if not args.duration else f'{args.duration:g}s'})")
        deadline = time.monotonic() + args.duration if args.duration else None
        cycle = 0
        try:
            while deadline is None or time.monotonic() < deadline:
                cycle += 1
                print(f"[{cycle}] {now_iso()}")
                if not args.alarm_only:
                    for topic, payload in input_messages(args.room):
                        publish(client, topic, payload, args.dry_run)
                if not args.no_alarm:
                    publish(client, *alarm_message(args.room, on=True), args.dry_run)
                if args.dry_run:
                    break
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nStopped by user")

        if not args.keep_on:
            print("Fire over: sending alarm OFF")
            publish(client, *alarm_message(args.room, on=False), args.dry_run)
    finally:
        if client is not None:
            client.loop_stop()
            client.disconnect()


if __name__ == "__main__":
    main()
