# Risk detection engine

Run this service on the Raspberry Pi alongside the existing MQTT bridge and
camera service. All three publishers and the risk engine must use the same
local MQTT broker and room ID for inputs. Risk output goes directly to AWS IoT
Core over TLS using a separate MQTT client. `+` is a subscription wildcard; publishers use
an actual room ID such as `1`.

| Pipeline | Topic | Required JSON field |
| --- | --- | --- |
| Camera (YOLO + MobileNet) | `firebomba/room/1/yolo` | `{"status": "connected", "yolo_confidence": 0.8}` |
| ESP32 flame sensor | `firebomba/room/1/flame` | `{"flame_detected": 1}` |
| Anomaly detector in MQTT bridge | `firebomba/room/1/anomaly` | `{"anomaly_score": 0.6}` |

Camera confidence is the highest YOLO detector confidence among crops confirmed
as fire or smoke by MobileNet at its existing 0.60 threshold. It is zero when
there are no confirmed detections. The classifier confidence remains in each
detection's `confidence` field; detector confidence is `yolo_confidence`.

Each normal camera prediction includes `status: "connected"`. When opening the
camera fails or frame reading fails, it publishes `status: "disconnected"` on the
same `/yolo` topic, with device ID, source and a fresh UTC timestamp. Disconnected
messages have no predictions or confidence. Failed opens are retried after five
seconds and publish another disconnected update on each failed attempt; camera
open/read timeouts can add to that interval.

Per room, **five consecutive disconnected messages** switch the engine to
`sensor_only` mode:

```text
risk_score = 0.6 * flame_detected + 0.4 * anomaly_score
```

YOLO has zero weight in this mode. **Five consecutive connected prediction
messages** restore the normal weights (YOLO 0.3, flame 0.4, anomaly 0.3).
An opposite status resets the streak. Evaluating the cache repeatedly does not
count as additional frames. Duplicate or older camera timestamps are ignored.
A gap longer than `RISK_MAX_INPUT_AGE_SECONDS` starts a new streak. Legacy
predictions without a status remain accepted but interrupt the streak and cannot
restore normal mode. The cloud risk payload includes `mode`, `weights` and
`camera_status` for inspection.

The risk engine subscribes to `firebomba/room/+/yolo`,
`firebomba/room/+/flame`, and `firebomba/room/+/anomaly`.
MQTT delivers messages continuously into a per-room cache. Every **5 seconds**,
the engine reads the latest values and publishes one result per ready room to
`firebomba/room/<room_id>/risk` on AWS IoT Core with QoS 1 and no retention.
The backend subscribes to this cloud topic and sends `risk-status` events through
the existing authenticated `/api/room-detail/sensor-readings/stream?roomId=1`
SSE endpoint after checking room access. The latest fresh result is replayed on
connection. SSE includes `score` scaled to 0–100 (one decimal place), `severity`,
the original `risk_score`, `room_id`, and `timestamp`.

The room details screen keeps a coloured score square visible directly below
the header: green for Normal, orange for Warning, and red for Critical. It uses
the engine's severity, including the flame override. Missing, disconnected SSE or
30-second-old results appear grey with an unavailable/waiting state.

```text
risk_score = 0.3 * yolo_confidence + 0.4 * flame_detected + 0.3 * anomaly_score
```

- `< 0.45`: `Normal`
- `0.45 <= score <= 0.75`: `Warning`
- `> 0.75`: `Critical`
- `flame_detected == 1` enforces at least `Warning`, preserving the weighted score.

YOLO and anomaly inputs must be finite numbers in `[0, 1]`; flame must be `0`
or `1`. Invalid messages are logged and ignored. Rooms are evaluated independently.
In normal mode, the engine waits for all three inputs and skips rooms if any
prediction/sensor input is older than 30 seconds (measured from receipt).
Before the fifth disconnected status, the last fresh YOLO prediction remains in
use; disconnected messages do not overwrite it with zero. In sensor-only mode,
only fresh flame and anomaly readings are required. This mode remains active
until the fifth connected prediction, even if camera updates stop. It does not
substitute zero for missing flame/anomaly readings. Retained input messages are
ignored because their age is unknown.
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
AWS_IOT_RISK_CLIENT_ID=firebomba-risk-engine
AWS_IOT_ENDPOINT=your-iot-endpoint
AWS_IOT_PORT=8883
AWS_IOT_ROOT_CA_PATH=certs/AmazonRootCA1.pem
AWS_IOT_CERTIFICATE_PATH=certs/device-certificate.pem.crt
AWS_IOT_PRIVATE_KEY_PATH=certs/device-private.pem.key
# Camera room; match the ESP32 topic and the database's device-to-room mapping
ROOM_ID=1
```

`MQTT_HOST` and `MQTT_PORT` are supported as fallback broker settings. The anomaly
publisher runs within the existing `python -m mqtt.mqtt` bridge, which still needs
its database, model dependencies and AWS IoT configuration. Flash the updated
ESP32 sketch to enable the separate flame topic. Its configured room `1` must match
the database mapping and camera room.

The risk engine uses the existing Raspberry Pi AWS IoT certificate configuration;
relative certificate paths resolve from `raspberry`. Its client ID must be distinct
from the pump bridge. Configure the device's AWS IoT policy to allow this client
to connect and publish to `firebomba/room/*/risk`; allow the backend client to
subscribe to `firebomba/room/+/risk` and receive `firebomba/room/*/risk`.

Run the calculation/cache tests from `raspberry`:

```powershell
python -B -m unittest risk_detection.test_engine risk_detection.test_service yolo_detection.test_mqtt_output -v
```

Run the backend MQTT/SSE tests from the repository root:

```powershell
node --test backend/test/riskStatusStream.test.js
```
