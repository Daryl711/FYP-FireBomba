"""Publish digital twin sensor readings onto the real FireBomba MQTT topics.

The payload shape matches exactly what raspberry/mqtt/mqtt.py already parses,
so the backend, the Pi and the mobile app need no changes to consume it. The
only addition is a "source": "sim" field, which exists so synthetic rows can
be filtered out of the database and out of model training data.

SAFETY
------
This publishes fire conditions that the real system will react to. On a
deployed longhouse that could trigger a real pump. Three guards:

  1. --dry-run is the default; you must pass --publish to emit anything.
  2. --confirm-not-deployed must be passed explicitly.
  3. Set TWIN_ALLOW_PUBLISH=1 in the environment.

All three are required together. Remove none of them.

Usage
-----
    python -m bridge.publisher --scenario ../scenarios/kitchen-timber.json
    python -m bridge.publisher --scenario ../scenarios/kitchen-timber.json \
        --publish --confirm-not-deployed --broker 127.0.0.1 --port 1883
"""

import argparse
import json
import os
import sys
import time
import uuid
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.simulation import Scenario, Simulation          # noqa: E402
from engine.longhouse import STATE_BURNING                  # noqa: E402

SENSOR_TOPIC = "firebomba/room/{room_id}/sensor-data"
ALERT_TOPIC = "firebomba/room/{room_id}/alerts"

# Map twin cells to the room ids your database actually uses.
# Edit this to match your Rooms table before running against a real broker.
CELL_TO_ROOM = {
    # bilik rooms
    "b0-dapur": 1,  "b0-tidur": 2,  "b0-ruang": 3,
    "b1-dapur": 4,  "b1-tidur": 5,  "b1-ruang": 6,
    "b2-dapur": 7,  "b2-tidur": 8,  "b2-ruang": 9,
    "b3-dapur": 10, "b3-tidur": 11, "b3-ruang": 12,
    "b4-dapur": 13, "b4-tidur": 14, "b4-ruang": 15,
    "b5-dapur": 16, "b5-tidur": 17, "b5-ruang": 18,
    # communal areas: one room id each, covering the whole space.
    # 19 and 20 are placeholders; set them to the real Rooms table ids.
    "ruai": 19,
    "tanju": 20,
}


def sensor_units(house):
    """Yield (key, reading) for every thing that reports as one sensor.

    Each bilik room reports on its own. The ruai and tanju are single communal
    spaces, so each reports once, with the worst reading across its bays.
    """
    for cell in house.cells:
        if cell.has_sensors and cell.place.startswith("bilik-"):
            yield cell.id, cell
    for place in ("ruai", "tanju"):
        cells = house.cells_of_place(place)
        if not cells:
            continue
        yield place, SimpleNamespace(
            temp=max(c.temp for c in cells),
            smoke=max(c.smoke for c in cells),
            co=max(c.co for c in cells),
            humidity=sum(c.humidity for c in cells) / len(cells),
            flame_detected=any(c.flame_detected for c in cells),
        )


def sensor_payload(cell, room_id, run_id):
    """Mirror the Arduino payload exactly, plus provenance fields."""
    return {
        "device_id": f"SIM-ROOM-{room_id}",
        "flame_detected": bool(cell.flame_detected),
        "temperature": round(cell.temp, 1),
        "humidity": round(cell.humidity, 1),
        "smoke": round(cell.smoke, 1),
        "co": round(cell.co, 1),
        "source": "sim",
        "run_id": run_id,
    }


def alert_payload(cell, room_id):
    titles = []
    if cell.flame_detected:
        titles.append("Flame detected")
    if cell.smoke > 38:
        titles.append("High smoke level")
    if cell.co > 60:
        titles.append("High carbon monoxide")
    if cell.temp > 57:
        titles.append("High temperature")
    if not titles:
        return None
    return {"roomId": room_id, "warningTitles": titles, "source": "sim"}


class Publisher:
    def __init__(self, client=None, dry_run=True):
        self.client = client
        self.dry_run = dry_run
        self.count = 0

    def send(self, topic, payload):
        body = json.dumps(payload)
        self.count += 1
        if self.dry_run or self.client is None:
            print(f"  [dry-run] {topic}\n            {body}")
        else:
            self.client.publish(topic, body, qos=1)


def build_client(broker, port, client_id, ca=None, cert=None, key=None):
    import paho.mqtt.client as mqtt  # imported lazily so dry-run needs no dep

    client = mqtt.Client(client_id=client_id)
    if ca and cert and key:
        client.tls_set(ca_certs=ca, certfile=cert, keyfile=key)
        print(f"  TLS enabled, connecting to {broker}:{port}")
    client.connect(broker, port, keepalive=60)
    client.loop_start()
    return client


def main(argv=None):
    p = argparse.ArgumentParser(prog="bridge.publisher")
    p.add_argument("--scenario", required=True)
    p.add_argument("--interval", type=float, default=5.0,
                   help="publish interval in simulated seconds (Arduino uses 5)")
    p.add_argument("--horizon", type=float, default=300.0)
    p.add_argument("--realtime", action="store_true",
                   help="sleep between publishes to run at wall-clock speed")
    p.add_argument("--publish", action="store_true",
                   help="actually publish (default is dry run)")
    p.add_argument("--confirm-not-deployed", action="store_true",
                   help="required acknowledgement that no live longhouse is connected")
    p.add_argument("--broker", default="127.0.0.1")
    p.add_argument("--port", type=int, default=1883)
    p.add_argument("--ca"), p.add_argument("--cert"), p.add_argument("--key")
    args = p.parse_args(argv)

    live = args.publish
    if live:
        if not args.confirm_not_deployed:
            p.error("--publish requires --confirm-not-deployed")
        if os.getenv("TWIN_ALLOW_PUBLISH") != "1":
            p.error("--publish requires TWIN_ALLOW_PUBLISH=1 in the environment")

    with open(args.scenario, "r", encoding="utf-8") as fh:
        scenario = Scenario.from_dict(json.load(fh))

    run_id = uuid.uuid4().hex[:8]
    sim = Simulation(scenario)

    client = None
    if live:
        client = build_client(args.broker, args.port,
                              f"firebomba-twin-{run_id}",
                              args.ca, args.cert, args.key)
    pub = Publisher(client, dry_run=not live)

    mode = "PUBLISHING" if live else "DRY RUN"
    print(f"\n  FireBomba twin bridge  [{mode}]  run_id={run_id}")
    print(f"  Scenario: {scenario.name}  ({scenario.fire_class}, "
          f"{scenario.nozzle})\n")

    next_pub = 0.0
    sent_alerts = set()
    while sim.t <= args.horizon:
        if sim.t >= next_pub:
            for key, cell in sensor_units(sim.house):
                room_id = CELL_TO_ROOM.get(key)
                if room_id is None:
                    continue
                pub.send(SENSOR_TOPIC.format(room_id=room_id),
                         sensor_payload(cell, room_id, run_id))
                alert = alert_payload(cell, room_id)
                if alert:
                    key = (room_id, tuple(alert["warningTitles"]))
                    if key not in sent_alerts:
                        sent_alerts.add(key)
                        pub.send(ALERT_TOPIC.format(room_id=room_id), alert)
            next_pub += args.interval
            if args.realtime and live:
                time.sleep(args.interval)
        sim.step(0.5)

    if client is not None:
        time.sleep(1.0)
        client.loop_stop()
        client.disconnect()

    print(f"\n  Done. {pub.count} messages "
          f"{'published' if live else 'would be published'}.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
