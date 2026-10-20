import os
import time
from pathlib import Path
from dotenv import load_dotenv

import cv2
from PIL import Image
import paho.mqtt.client as mqtt
import onnxruntime as ort
import numpy as np


from yolo_detection.inference import MobileNetClassifier
from yolo_detection.mqtt_output import publish_camera_output


# Configuration
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

RTSP_URL = os.environ["TAPO_RTSP_URL"]
MQTT_HOST = os.getenv("LOCAL_MQTT_BROKER", os.getenv("MQTT_HOST", "localhost"))
MQTT_PORT = int(os.getenv("LOCAL_MQTT_PORT", os.getenv("MQTT_PORT", "1883")))


DEVICE_ID = "ESP32_ROOM_01"
BILIK_ID = os.getenv("ROOM_ID", "1")
TOPIC = f"firebomba/room/{BILIK_ID}/yolo"

INTERVAL = 5.0
MIN_CONFIDENCE = 0.60  # Initial experimental threshold
YOLO_CONFIDENCE = 0.25
MODEL_DIR = Path(__file__).resolve().parent


class ONNXDetector:
    def __init__(self, model_path):
        self.session = ort.InferenceSession(
            str(model_path),
            providers=["CPUExecutionProvider"]
        )

        self.input_info = self.session.get_inputs()[0]
        self.input_name = self.input_info.name
        self.output_names = [
            output.name for output in self.session.get_outputs()
        ]

        shape = self.input_info.shape
        self.input_height = shape[2] if isinstance(shape[2], int) else 640
        self.input_width = shape[3] if isinstance(shape[3], int) else 640

        print(
            "ONNX detector loaded:",
            self.input_info.shape,
            flush=True
        )

    def preprocess(self, frame):
        height, width = frame.shape[:2]

        scale = min(
            self.input_width / width,
            self.input_height / height
        )

        new_width = round(width * scale)
        new_height = round(height * scale)

        resized = cv2.resize(
            frame,
            (new_width, new_height),
            interpolation=cv2.INTER_LINEAR
        )

        pad_width = self.input_width - new_width
        pad_height = self.input_height - new_height

        left = round(pad_width / 2 - 0.1)
        right = round(pad_width / 2 + 0.1)
        top = round(pad_height / 2 - 0.1)
        bottom = round(pad_height / 2 + 0.1)

        padded = cv2.copyMakeBorder(
            resized,
            top,
            bottom,
            left,
            right,
            cv2.BORDER_CONSTANT,
            value=(114, 114, 114)
        )

        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)

        tensor = np.ascontiguousarray(
            rgb.transpose(2, 0, 1)[None],
            dtype=np.float32
        ) / 255.0

        return tensor, scale, left, top

    def predict(self, frame, conf=0.25, iou=0.45):
        tensor, scale, pad_x, pad_y = self.preprocess(frame)

        outputs = self.session.run(
            self.output_names,
            {self.input_name: tensor}
        )

        predictions = outputs[0][0]

        # Standard Ultralytics detection output:
        # (4 + num_classes, num_predictions)
        if predictions.ndim != 2:
            raise ValueError(
                f"Unexpected ONNX output shape: {outputs[0].shape}"
            )

        if predictions.shape[0] < predictions.shape[1]:
            predictions = predictions.T

        if predictions.shape[1] < 5:
            raise ValueError(
                f"Invalid detection output: {predictions.shape}"
            )

        boxes_xywh = predictions[:, :4]
        class_scores = predictions[:, 4:]

        scores = np.max(class_scores, axis=1)
        class_ids = np.argmax(class_scores, axis=1)

        mask = scores >= conf

        boxes_xywh = boxes_xywh[mask]
        scores = scores[mask]
        class_ids = class_ids[mask]

        if len(boxes_xywh) == 0:
            return []

        # Convert center-x, center-y, width, height to xyxy
        boxes = np.empty_like(boxes_xywh)

        boxes[:, 0] = boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2
        boxes[:, 1] = boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2
        boxes[:, 2] = boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2
        boxes[:, 3] = boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2

        # Undo letterbox padding and scaling
        boxes[:, [0, 2]] -= pad_x
        boxes[:, [1, 3]] -= pad_y
        boxes /= scale

        height, width = frame.shape[:2]

        boxes[:, [0, 2]] = np.clip(boxes[:, [0, 2]], 0, width)
        boxes[:, [1, 3]] = np.clip(boxes[:, [1, 3]], 0, height)

        # Class-aware NMS, using OpenCV rather than torchvision
        final_detections = []

        for class_id in np.unique(class_ids):
            indices = np.where(class_ids == class_id)[0]
            class_boxes = boxes[indices]
            class_scores_filtered = scores[indices]

            nms_boxes = [
                [
                    float(x1),
                    float(y1),
                    float(x2 - x1),
                    float(y2 - y1)
                ]
                for x1, y1, x2, y2 in class_boxes
            ]

            kept = cv2.dnn.NMSBoxes(
                nms_boxes,
                class_scores_filtered.tolist(),
                score_threshold=conf,
                nms_threshold=iou
            )

            for index in np.asarray(kept).reshape(-1):
                original_index = indices[int(index)]

                final_detections.append({
                    "bbox": boxes[original_index].tolist(),
                    "confidence": float(scores[original_index]),
                    "class_id": int(class_ids[original_index])
                })

        return sorted(
            final_detections,
            key=lambda d: d["confidence"],
            reverse=True
        )


def generate_crops(frame, detector):
    height, width = frame.shape[:2]

    results = detector.predict(
        frame,
        conf=YOLO_CONFIDENCE
    )

    for result in results:
        x1, y1, x2, y2 = result["bbox"]

        pad_x = max(2, (x2 - x1) * 0.15)
        pad_y = max(2, (y2 - y1) * 0.15)

        x1 = max(0, int(x1 - pad_x))
        y1 = max(0, int(y1 - pad_y))
        x2 = min(width, int(x2 + pad_x))
        y2 = min(height, int(y2 + pad_y))

        if x2 <= x1 or y2 <= y1:
            continue

        crop = Image.fromarray(cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))
        yield crop, (x1, y1, x2, y2), result["confidence"]

def classify_frame(frame, classifier, detector):
    """Classify YOLO crops, annotate the frame, and return fire/smoke detections."""

    detections = []
    annotations = []

    for crop, bbox, yolo_confidence in generate_crops(frame, detector):
        result = classifier.predict(crop)
        annotations.append((bbox, result))

        if (
            result["class"] in ("fire", "smoke")
            and result["confidence"] >= MIN_CONFIDENCE
        ):
            detections.append({
                **result, "bbox": bbox, "yolo_confidence": yolo_confidence
            })

    # Draw only after all crops have been classified to keep overlapping ROIs clean.
    for (x1, y1, x2, y2), result in annotations:
        color = {"fire": (0, 0, 255), "smoke": (0, 165, 255)}.get(
            result["class"], (0, 255, 0)
        )
        cv2.rectangle(frame, (x1, y1), (x2 - 1, y2 - 1), color, 2)
        cv2.putText(
            frame,
            f'{result["class"]} {result["confidence"]:.2f}',
            (x1, max(15, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            2,
        )

    return detections


def main():
    detector = ONNXDetector(
        MODEL_DIR / "yolo_detector.onnx"
    )
    classifier = MobileNetClassifier(
        checkpoint=MODEL_DIR / "best_model.pth",
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
                publish_camera_output(client, TOPIC, DEVICE_ID, "disconnected")
                cap.release()
                time.sleep(INTERVAL)
                continue

            print("Tapo camera connected")
            last_inference = 0.0

            try:
                while True:
                    success, frame = cap.read()

                    if not success:
                        print("Camera disconnected")
                        publish_camera_output(client, TOPIC, DEVICE_ID, "disconnected")
                        break

                    now = time.monotonic()

                    if now - last_inference < INTERVAL:
                        continue

                    last_inference = now

                    detections = classify_frame(
                        frame, classifier, detector
                    )

                    publish_camera_output(
                        client, TOPIC, DEVICE_ID, "connected", detections
                    )

            finally:
                cap.release()

            time.sleep(INTERVAL)

    except KeyboardInterrupt:
        print("Stopping camera service")

    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()
