# Risk detection engine

Run this service on the Raspberry Pi alongside the existing MQTT bridge and
camera service. All three publishers and the risk engine must use the same
local MQTT broker and room ID. `+` is a subscription wildcard; publishers use
an actual room ID such as `1`.

| Pipeline | Topic | Required JSON field |
| --- | --- | --- |
| Camera (YOLO + MobileNet) | `firebomba/room/1/yolo` | `{"yolo_confidence": 0.8}` |
| ESP32 flame sensor | `firebomba/room/1/flame` | `{"flame_detected": 1}` |
| Anomaly detector in MQTT bridge | `firebomba/room/1/anomaly` | `{"anomaly_score": 0.6}` |

Camera confidence is the highest YOLO detector confidence among crops confirmed
as fire or smoke by MobileNet at its existing 0.60 threshold. It is zero when
there are no confirmed detections. The classifier confidence remains in each
detection's `confidence` field; detector confidence is `yolo_confidence`.

The risk engine subscribes to `firebomba/room/+/yolo`,
`firebomba/room/+/flame`, and `firebomba/room/+/anomaly`.
MQTT delivers messages continuously into a per-room cache. Every **5 seconds**,
the engine reads the latest values and publishes one result per ready room to
`firebomba/room/<room_id>/risk` with QoS 1 and no retention.

```text
risk_score = 0.3 * yolo_confidence + 0.4 * flame_detected + 0.3 * anomaly_score
```

- `< 0.45`: `Normal`
- `0.45 <= score <= 0.75`: `Warning`
- `> 0.75`: `Critical`
- `flame_detected == 1` enforces at least `Warning`, preserving the weighted score.

YOLO and anomaly inputs must be finite numbers in `[0, 1]`; flame must be `0`
or `1`. Invalid messages are logged and ignored. Rooms are evaluated independently.
The engine waits until all three inputs exist, and skips rooms if any input is
older than 30 seconds (measured from receipt). It does not substitute zero for
missing inputs. Retained input messages are ignored because their age is unknown.
Consumers should use the output timestamp to identify an interrupted output stream.

Example output with the inputs above:

```json
{
  "room_id": "1",
  "timestamp": "2026-10-17T12:00:00+00:00",
  "risk_score": 0.82,
  "risk_level": "Critical",
  "yolo_confidence": 0.8,
  "flame_detected": 1,
  "anomaly_score": 0.6
}
```

From the repository root:

```powershell
cd raspberry
python -m pip install -r risk_detection/requirements.txt
python -m risk_detection.service
```

Configuration is loaded from `raspberry/.env`:

```dotenv
LOCAL_MQTT_BROKER=127.0.0.1
LOCAL_MQTT_PORT=1883
# Optional broker authentication (also used by the camera)
MQTT_USERNAME=
MQTT_PASSWORD=
RISK_MAX_INPUT_AGE_SECONDS=30
RISK_MQTT_CLIENT_ID=FireBomba-RiskEngine
# Camera room; match the ESP32 topic and the database's device-to-room mapping
ROOM_ID=1
```

`MQTT_HOST` and `MQTT_PORT` are supported as fallback broker settings. The anomaly
publisher runs within the existing `python -m mqtt.mqtt` bridge, which still needs
its database, model dependencies and AWS IoT configuration. Flash the updated
ESP32 sketch to enable the separate flame topic. Its configured room `1` must match
the database mapping and camera room.

Run the calculation/cache tests from `raspberry`:

```powershell
python -B -m unittest risk_detection.test_engine -v
```
