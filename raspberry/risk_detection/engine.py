"""Risk calculation and per-room input cache, independent of MQTT."""

import math
import re
import time
from decimal import Decimal
from datetime import datetime
from threading import Lock


INPUT_TOPIC = re.compile(r"^firebomba/room/([^/]+)/(yolo|flame|anomaly)$")
INPUT_FIELDS = {
    "yolo": "yolo_confidence",
    "flame": "flame_detected",
    "anomaly": "anomaly_score",
}
NORMAL_WEIGHTS = {"yolo": 0.5, "flame": 0.3, "anomaly": 0.2}
SENSOR_ONLY_WEIGHTS = {"yolo": 0.0, "flame": 0.6, "anomaly": 0.4}
CAMERA_ONLY_WEIGHTS = {"yolo": 1.0, "flame": 0.0, "anomaly": 0.0}
CAMERA_STATUS_THRESHOLD = 5


def validate_input(source, value):
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{INPUT_FIELDS[source]} must be a finite number")
    if source == "flame":
        if value not in (0, 1):
            raise ValueError("flame_detected must be 0 or 1")
    elif isinstance(value, bool) or not 0 <= value <= 1:
        raise ValueError(f"{INPUT_FIELDS[source]} must be between 0 and 1")
    return float(value)


def calculate_risk(yolo_confidence, flame_detected, anomaly_score, *,
                   sensor_only=False, camera_only=False):
    if sensor_only and camera_only:
        raise ValueError("sensor_only and camera_only are mutually exclusive")
    inputs = {
        "yolo": validate_input("yolo", yolo_confidence),
        "flame": validate_input("flame", flame_detected),
        "anomaly": validate_input("anomaly", anomaly_score),
    }
    if sensor_only:
        weights, mode = SENSOR_ONLY_WEIGHTS, "sensor_only"
    elif camera_only:
        weights, mode = CAMERA_ONLY_WEIGHTS, "camera_only"
    else:
        weights, mode = NORMAL_WEIGHTS, "normal"
    score = sum(Decimal(str(inputs[source])) * Decimal(str(weight))
                for source, weight in weights.items())
    score = float(score)
    if score > 0.75:
        level = "Critical"
    elif score >= 0.45 or (inputs["flame"] == 1 and not camera_only):
        level = "Warning"
    else:
        level = "Normal"
    return {
        "risk_score": score,
        "risk_level": level,
        "yolo_confidence": inputs["yolo"],
        "flame_detected": int(inputs["flame"]),
        "anomaly_score": inputs["anomaly"],
        "weights": dict(weights),
        "mode": mode,
    }


class RiskEngine:
    def __init__(self, max_age_seconds=30.0, clock=time.monotonic, force_mode=None):
        if force_mode not in (None, "normal", "sensor_only", "camera_only"):
            raise ValueError("invalid force_mode")
        self.force_mode = force_mode
        if not math.isfinite(max_age_seconds) or max_age_seconds <= 0:
            raise ValueError("max_age_seconds must be finite and positive")
        self.max_age_seconds = max_age_seconds
        self.clock = clock
        self.rooms = {}
        self.camera_states = {}
        self.lock = Lock()

    def update(self, topic, payload):
        match = INPUT_TOPIC.fullmatch(topic)
        if match is None:
            return False
        room_id, source = match.groups()
        if not isinstance(payload, dict):
            raise ValueError("Input payload must be a JSON object")
        field = INPUT_FIELDS[source]
        status = payload.get("status") if source == "yolo" else None
        if source == "yolo" and "status" in payload and status not in ("connected", "disconnected"):
            raise ValueError("Camera status must be connected or disconnected")
        if status == "disconnected":
            value = None  # A lost camera is not a zero-confidence prediction.
        elif field not in payload:
            raise ValueError(f"Missing {field}")
        else:
            value = validate_input(source, payload[field])
        sample_time = None
        if source == "yolo" and "timestamp" in payload:
            try:
                sample_time = datetime.fromisoformat(payload["timestamp"].replace("Z", "+00:00")).timestamp()
            except (AttributeError, TypeError, ValueError, OverflowError) as error:
                raise ValueError("Invalid camera timestamp") from error
        with self.lock:
            now = self.clock()
            readings = self.rooms.setdefault(room_id, {})
            if source == "yolo":
                state = self.camera_states.setdefault(room_id, {
                    "sensor_only": False, "status": None, "count": 0,
                    "received": None, "sample_time": None,
                })
                # QoS 1 may redeliver a frame; count each timestamp only once.
                if (sample_time is not None and state["sample_time"] is not None
                        and sample_time <= state["sample_time"]):
                    return False
                consecutive = (status is not None and status == state["status"]
                               and state["received"] is not None
                               and now - state["received"] <= self.max_age_seconds)
                state["count"] = (
                    min(state["count"] + 1, CAMERA_STATUS_THRESHOLD)
                    if consecutive else int(status is not None)
                )
                state.update(status=status, received=now, sample_time=sample_time)
                if state["count"] >= CAMERA_STATUS_THRESHOLD:
                    state["sensor_only"] = status == "disconnected"
            if value is not None:
                readings[source] = (value, now)
        return True

    def evaluate(self):
        results = {}
        with self.lock:
            now = self.clock()
            for room_id, readings in self.rooms.items():
                state = self.camera_states.get(room_id, {})

                def fresh(source):
                    return (source in readings
                            and now - readings[source][1] <= self.max_age_seconds)

                sensors_ok = fresh("flame") and fresh("anomaly")
                camera_ok = fresh("yolo") and not state.get("sensor_only", False)

                if self.force_mode == "sensor_only":
                    if not sensors_ok:
                        continue
                    sensor_only, camera_only = True, False
                elif self.force_mode == "camera_only":
                    if not camera_ok:
                        continue
                    sensor_only, camera_only = False, True
                elif self.force_mode == "normal":
                    if not (sensors_ok and camera_ok):
                        continue  # no silent fallback during experiments
                    sensor_only, camera_only = False, False
                elif sensors_ok:
                    sensor_only, camera_only = not camera_ok, False
                elif camera_ok:
                    sensor_only, camera_only = False, True
                else:
                    continue

                result = calculate_risk(
                    0.0 if sensor_only else readings["yolo"][0],
                    readings["flame"][0] if sensors_ok else 0.0,
                    readings["anomaly"][0] if sensors_ok else 0.0,
                    sensor_only=sensor_only,
                    camera_only=camera_only,
                )
                result["camera_status"] = state.get("status")
                result["sensor_only_reason"] = (
                    "forced" if self.force_mode and sensor_only
                    else None if not sensor_only
                    else "camera_disconnected" if state.get("sensor_only", False)
                    else "camera_no_data"
                )
                result["camera_only_reason"] = (
                    "forced" if self.force_mode and camera_only
                    else "sensors_no_data" if camera_only else None
                )
                results[room_id] = result
        return results
