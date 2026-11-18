"""Standalone latency-measurement risk engine for local MQTT experiments.

This intentionally does not import or modify the production risk engine.
Durations use a monotonic high-resolution clock and are calculated as
``after - before`` so wall-clock corrections cannot distort measurements.
"""

import math
import re
import time
from datetime import datetime, timezone
from decimal import Decimal


INPUT_TOPIC = re.compile(r"^firebomba/room/([^/]+)/(yolo|flame|anomaly)$")
INPUT_FIELDS = {
    "yolo": "yolo_confidence",
    "flame": "flame_detected",
    "anomaly": "anomaly_score",
}
WEIGHTS = {"yolo": 0.3, "flame": 0.4, "anomaly": 0.3}
REQUIRED_SOURCES = tuple(INPUT_FIELDS)
NANOSECONDS_PER_MILLISECOND = 1_000_000


def _validate(source, value):
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{INPUT_FIELDS[source]} must be a finite number")
    if source == "flame":
        if value not in (0, 1):
            raise ValueError("flame_detected must be 0 or 1")
    elif isinstance(value, bool) or not 0 <= value <= 1:
        raise ValueError(f"{INPUT_FIELDS[source]} must be between 0 and 1")
    return float(value)


def _calculate_score(values):
    return float(sum(
        Decimal(str(values[source])) * Decimal(str(WEIGHTS[source]))
        for source in REQUIRED_SOURCES
    ))


def _classify(score, flame_detected):
    if score > 0.75:
        return "Critical"
    if score >= 0.45 or flame_detected == 1:
        return "Warning"
    return "Normal"


def _milliseconds(after_ns, before_ns):
    return round((after_ns - before_ns) / NANOSECONDS_PER_MILLISECOND, 6)


def _record_duration(summary, duration_ms):
    summary["samples"] += 1
    summary["total"] += duration_ms
    summary["average"] = summary["total"] / summary["samples"]
    summary["minimum"] = (
        duration_ms if summary["minimum"] is None
        else min(summary["minimum"], duration_ms)
    )
    summary["maximum"] = (
        duration_ms if summary["maximum"] is None
        else max(summary["maximum"], duration_ms)
    )


def _empty_summary():
    return {"samples": 0, "total": 0.0, "average": 0.0, "minimum": None, "maximum": None}


class LatencyRiskEngine:
    """Collect fresh per-room inputs and emit one timed result per input set."""

    def __init__(self, max_age_seconds=30.0, clock_ns=time.perf_counter_ns):
        if not math.isfinite(max_age_seconds) or max_age_seconds <= 0:
            raise ValueError("max_age_seconds must be finite and positive")
        self.max_age_ns = int(max_age_seconds * 1_000_000_000)
        self.clock_ns = clock_ns
        self.rooms = {}

    def _room(self, room_id):
        return self.rooms.setdefault(room_id, {
            "readings": {},
            "sequence": 0,
            "last_processed": {source: 0 for source in REQUIRED_SOURCES},
            "processing_summary_ms": _empty_summary(),
            "end_to_end_summary_ms": _empty_summary(),
        })

    def update(self, topic, payload, received_ns=None, received_at=None):
        """Update an input and return a timed result once all three are fresh.

        A result is emitted only after each required source has sent a new
        reading since the previous result. Disconnected camera messages with
        no confidence are invalid for this fixed three-input latency trial.
        """
        match = INPUT_TOPIC.fullmatch(topic)
        if match is None:
            return None
        room_id, source = match.groups()
        if not isinstance(payload, dict):
            raise ValueError("Input payload must be a JSON object")

        field = INPUT_FIELDS[source]
        if field not in payload:
            raise ValueError(f"Missing {field}")
        value = _validate(source, payload[field])
        now_ns = self.clock_ns() if received_ns is None else received_ns

        room = self._room(room_id)
        room["sequence"] += 1
        room["readings"][source] = {
            "value": value,
            "received_ns": now_ns,
            "received_at": received_at or datetime.now(timezone.utc).isoformat(),
            "sequence": room["sequence"],
        }

        readings = room["readings"]
        if not all(source_name in readings for source_name in REQUIRED_SOURCES):
            return None
        if any(now_ns - readings[source_name]["received_ns"] > self.max_age_ns
               for source_name in REQUIRED_SOURCES):
            return None
        if any(readings[source_name]["sequence"] <= room["last_processed"][source_name]
               for source_name in REQUIRED_SOURCES):
            return None

        first_input_ns = min(readings[name]["received_ns"] for name in REQUIRED_SOURCES)
        last_input_ns = max(readings[name]["received_ns"] for name in REQUIRED_SOURCES)
        values = {name: readings[name]["value"] for name in REQUIRED_SOURCES}

        score_before_ns = self.clock_ns()
        risk_score = _calculate_score(values)
        score_after_ns = self.clock_ns()

        classification_before_ns = self.clock_ns()
        risk_level = _classify(risk_score, int(values["flame"]))
        classification_after_ns = self.clock_ns()

        # Freeze this input set. The next result waits for a new message from
        # every source, rather than recalculating the same cached readings.
        room["last_processed"] = {
            source_name: readings[source_name]["sequence"]
            for source_name in REQUIRED_SOURCES
        }

        score_calculation_ms = _milliseconds(score_after_ns, score_before_ns)
        classification_ms = _milliseconds(classification_after_ns, classification_before_ns)
        processing_ms = _milliseconds(classification_after_ns, score_before_ns)
        end_to_end_ms = _milliseconds(classification_after_ns, first_input_ns)
        summary = room["processing_summary_ms"]
        _record_duration(summary, processing_ms)
        end_to_end_summary = room["end_to_end_summary_ms"]
        _record_duration(end_to_end_summary, end_to_end_ms)

        return {
            "room_id": room_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "yolo_confidence": values["yolo"],
            "flame_detected": int(values["flame"]),
            "anomaly_score": values["anomaly"],
            "weights": dict(WEIGHTS),
            "latency_test": True,
            "timing_ms": {
                # Each duration below is measured directly as after - before.
                "input_collection": _milliseconds(last_input_ns, first_input_ns),
                "score_calculation": score_calculation_ms,
                "risk_classification": classification_ms,
                "processing": processing_ms,
                "end_to_end_from_first_input": end_to_end_ms,
            },
            "processing_summary_ms": {
                "samples": summary["samples"],
                "average": round(summary["average"], 6),
                "minimum": summary["minimum"],
                "maximum": summary["maximum"],
            },
            "end_to_end_summary_ms": {
                "samples": end_to_end_summary["samples"],
                "average": round(end_to_end_summary["average"], 6),
                "minimum": end_to_end_summary["minimum"],
                "maximum": end_to_end_summary["maximum"],
            },
            "input_received_at": {
                source_name: readings[source_name]["received_at"]
                for source_name in REQUIRED_SOURCES
            },
        }
