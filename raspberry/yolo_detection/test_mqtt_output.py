import json
import unittest
from unittest.mock import MagicMock, patch

from yolo_detection.mqtt_output import publish_camera_output


class CameraOutputTests(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        self.client.publish.return_value.rc = 0

    def publish(self, status, detections=None):
        with patch("builtins.print"):
            payload = publish_camera_output(
                self.client, "firebomba/room/1/yolo", "camera-1", status, detections
            )
        args, kwargs = self.client.publish.call_args
        self.assertEqual(args[0], "firebomba/room/1/yolo")
        self.assertEqual(json.loads(args[1]), payload)
        self.assertEqual(kwargs, {"qos": 1, "retain": False})
        self.assertIn("timestamp", payload)
        return payload

    def test_disconnected_status_does_not_claim_clear_predictions(self):
        payload = self.publish("disconnected")
        self.assertEqual(payload["status"], "disconnected")
        self.assertNotIn("yolo_confidence", payload)
        self.assertNotIn("detections", payload)

    def test_connected_status_includes_predictions(self):
        detections = [{"class": "fire", "confidence": 0.9, "yolo_confidence": 0.85}]
        payload = self.publish("connected", detections)
        self.assertEqual(payload["status"], "connected")
        self.assertTrue(payload["fire_detected"])
        self.assertFalse(payload["smoke_detected"])
        self.assertEqual(payload["yolo_confidence"], 0.85)
        self.assertEqual(payload["detections"], detections)

    def test_connected_without_detections_publishes_zero(self):
        payload = self.publish("connected", [])
        self.assertEqual(payload["yolo_confidence"], 0)
        self.assertEqual(payload["detections"], [])


if __name__ == "__main__":
    unittest.main()
