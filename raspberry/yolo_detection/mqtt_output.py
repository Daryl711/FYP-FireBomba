"""Camera status and prediction payloads without model dependencies."""

import json
from datetime import datetime, timezone


def publish_camera_output(client, topic, device_id, status, detections=None):
    if status not in ("connected", "disconnected"):
        raise ValueError("Camera status must be connected or disconnected")
    payload = {
        "device_id": device_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "source": "yolo_mobilenet",
    }
    if status == "connected":
        detections = detections or []
        payload.update(
            fire_detected=any(d["class"] == "fire" for d in detections),
            smoke_detected=any(d["class"] == "smoke" for d in detections),
            detections=detections,
            yolo_confidence=max((d["yolo_confidence"] for d in detections), default=0.0),
        )
    result = client.publish(topic, json.dumps(payload), qos=1, retain=False)
    if result.rc != 0:
        print("MQTT publish failed:", result.rc)
    print(json.dumps(payload), flush=True)
    return payload
