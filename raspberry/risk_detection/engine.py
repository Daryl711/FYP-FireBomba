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
NORMAL_WEIGHTS = {"yolo": 0.3, "flame": 0.4, "anomaly": 0.3}
SENSOR_ONLY_WEIGHTS = {"yolo": 0.0, "flame": 0.6, "anomaly": 0.4}
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


def calculate_risk(yolo_confidence, flame_detected, anomaly_score, *, sensor_only=False):
    inputs = {
        "yolo": validate_input("yolo", yolo_confidence),
        "flame": validate_input("flame", flame_detected),
        "anomaly": validate_input("anomaly", anomaly_score),
    }
    # Decimal preserves the inclusive 0.45 and 0.75 boundaries.
    weights = SENSOR_ONLY_WEIGHTS if sensor_only else NORMAL_WEIGHTS
    score = sum(Decimal(str(inputs[source])) * Decimal(str(weight))
                for source, weight in weights.items())
    score = float(score)
    if score > 0.75:
        level = "Critical"
    elif score >= 0.45 or inputs["flame"] == 1:
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
        "mode": "sensor_only" if sensor_only else "normal",
    }


class RiskEngine:
    def __init__(self, max_age_seconds=30.0, clock=time.monotonic):
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
                sensor_only = state.get("sensor_only", False)
                required = ("flame", "anomaly") if sensor_only else INPUT_FIELDS
                if not all(source in readings for source in required):
                    continue
                if any(now - readings[source][1] > self.max_age_seconds for source in required):
                    continue
                results[room_id] = calculate_risk(
                    0.0 if sensor_only else readings["yolo"][0],
                    readings["flame"][0], readings["anomaly"][0],
                    sensor_only=sensor_only,
                )
                results[room_id]["camera_status"] = state.get("status")
        return results
