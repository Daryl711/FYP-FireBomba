"""Risk calculation and per-room input cache, independent of MQTT."""

import math
import re
import time
from decimal import Decimal
from threading import Lock


INPUT_TOPIC = re.compile(r"^firebomba/room/([^/]+)/(yolo|flame|anomaly)$")
INPUT_FIELDS = {
    "yolo": "yolo_confidence",
    "flame": "flame_detected",
    "anomaly": "anomaly_score",
}


def validate_input(source, value):
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{INPUT_FIELDS[source]} must be a finite number")
    if source == "flame":
        if value not in (0, 1):
            raise ValueError("flame_detected must be 0 or 1")
    elif isinstance(value, bool) or not 0 <= value <= 1:
        raise ValueError(f"{INPUT_FIELDS[source]} must be between 0 and 1")
    return float(value)


def calculate_risk(yolo_confidence, flame_detected, anomaly_score):
    inputs = {
        "yolo": validate_input("yolo", yolo_confidence),
        "flame": validate_input("flame", flame_detected),
        "anomaly": validate_input("anomaly", anomaly_score),
    }
    # Decimal preserves the inclusive 0.45 and 0.75 boundaries.
    score = sum(
        Decimal(str(inputs[source])) * Decimal(weight)
        for source, weight in (("yolo", "0.3"), ("flame", "0.4"), ("anomaly", "0.3"))
    )
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
    }


class RiskEngine:
    def __init__(self, max_age_seconds=30.0, clock=time.monotonic):
        if not math.isfinite(max_age_seconds) or max_age_seconds <= 0:
            raise ValueError("max_age_seconds must be finite and positive")
        self.max_age_seconds = max_age_seconds
        self.clock = clock
        self.rooms = {}
        self.lock = Lock()

    def update(self, topic, payload):
        match = INPUT_TOPIC.fullmatch(topic)
        if match is None:
            return False
        room_id, source = match.groups()
        if not isinstance(payload, dict):
            raise ValueError("Input payload must be a JSON object")
        field = INPUT_FIELDS[source]
        if field not in payload:
            raise ValueError(f"Missing {field}")
        value = validate_input(source, payload[field])
        with self.lock:
            self.rooms.setdefault(room_id, {})[source] = (value, self.clock())
        return True

    def evaluate(self):
        results = {}
        with self.lock:
            now = self.clock()
            for room_id, readings in self.rooms.items():
                if not all(source in readings for source in INPUT_FIELDS):
                    continue
                if any(now - received > self.max_age_seconds for _, received in readings.values()):
                    continue
                results[room_id] = calculate_risk(
                    readings["yolo"][0], readings["flame"][0], readings["anomaly"][0]
                )
        return results
