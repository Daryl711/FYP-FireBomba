import os
import time
import json
from datetime import datetime, timezone
from dotenv import load_dotenv

import cv2
import numpy as np
from PIL import Image
import paho.mqtt.client as mqtt

from inference import YoloClassifier


# Configuration
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

RTSP_URL = os.environ["TAPO_RTSP_URL"]
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))


DEVICE_ID = "ESP32_ROOM_01"
BILIK_ID = 1
TOPIC = f"firebomba/room/{BILIK_ID}/yolo/detection"

INTERVAL = 5.0
MIN_CONFIDENCE = 0.60  # Initial experimental threshold


def generate_crops(frame):
    """Generate overlapping image regions for MobileNet."""

    height, width = frame.shape[:2]

    # Full frame + overlapping 2x2 regions
    regions = [(0, 0, width, height)]

    crop_width = int(width * 0.65)
    crop_height = int(height * 0.65)

    for y in [0, height - crop_height]:
        for x in [0, width - crop_width]:
            regions.append(
                (x, y, x + crop_width, y + crop_height)
            )

    for x1, y1, x2, y2 in regions:
        crop = frame[y1:y2, x1:x2]

        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)

        yield Image.fromarray(rgb)


def classify_frame(frame, classifier):
    """Classify all regions and return candidate detections."""

    detections = []

    for crop in generate_crops(frame):
        result = classifier.predict(crop)

        if (
            result["class"] in ("fire", "smoke")
            and result["confidence"] >= MIN_CONFIDENCE
        ):
            detections.append(result)

    return detections


def main():
    classifier = YoloClassifier(
        checkpoint="best_model.pth",
        device="cpu"
    )

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id="FireBomba-Camera"
    )

    if os.getenv("MQTT_USERNAME"):
        client.username_pw_set(
            os.environ["MQTT_USERNAME"],
            os.getenv("MQTT_PASSWORD")
        )

    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.loop_start()

    try:
        while True:
            cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

            if not cap.isOpened():
                print("Camera unavailable; retrying in 5 seconds")
                cap.release()
                time.sleep(5)
                continue

            print("Tapo camera connected")
            last_inference = 0.0

            try:
                while True:
                    success, frame = cap.read()

                    if not success:
                        print("Camera disconnected")
                        break

                    now = time.monotonic()

                    if now - last_inference < INTERVAL:
                        continue

                    last_inference = now

                    detections = classify_frame(
                        frame, classifier
                    )

                    payload = {
                        "device_id": DEVICE_ID,
                        "timestamp": datetime.now(
                            timezone.utc
                        ).isoformat(),
                        "fire_detected": any(
                            d["class"] == "fire"
                            for d in detections
                        ),
                        "smoke_detected": any(
                            d["class"] == "smoke"
                            for d in detections
                        ),
                        "detections": detections,
                        "source": "mobilenet_tiles",
                    }

                    result = client.publish(
                        TOPIC,
                        json.dumps(payload),
                        qos=1
                    )

                    if result.rc != mqtt.MQTT_ERR_SUCCESS:
                        print("MQTT publish failed:", result.rc)

                    print(json.dumps(payload), flush=True)

            finally:
                cap.release()

            time.sleep(5)

    except KeyboardInterrupt:
        print("Stopping camera service")

    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()