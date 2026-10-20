"""Exercise cloud configuration and publication without a broker or certificates."""

import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from risk_detection.engine import RiskEngine


class CloudPublicationTests(unittest.TestCase):
    def setUp(self):
        self.mqtt = MagicMock()
        self.mqtt.MQTT_ERR_SUCCESS = 0
        modules = {
            "paho": MagicMock(), "paho.mqtt": MagicMock(),
            "paho.mqtt.client": self.mqtt, "dotenv": MagicMock(),
        }
        modules["paho"].mqtt = modules["paho.mqtt"]
        modules["paho.mqtt"].client = self.mqtt
        spec = importlib.util.spec_from_file_location(
            "risk_service_under_test", Path(__file__).with_name("service.py")
        )
        self.service = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", modules):
            spec.loader.exec_module(self.service)

    def test_cloud_client_uses_tls_and_distinct_id(self):
        with patch.dict(os.environ, {
            "AWS_IOT_RISK_CLIENT_ID": "test-risk-engine",
            "AWS_IOT_ROOT_CA_PATH": "certs/root.pem",
            "AWS_IOT_CERTIFICATE_PATH": "certs/device.pem",
            "AWS_IOT_PRIVATE_KEY_PATH": "certs/key.pem",
        }):
            client = self.service.create_cloud_client()
        self.assertEqual(self.mqtt.Client.call_args.kwargs["client_id"], "test-risk-engine")
        paths = client.tls_set.call_args.kwargs
        self.assertTrue(Path(paths["ca_certs"]).is_absolute())
        self.assertEqual(Path(paths["keyfile"]).name, "key.pem")

    def test_publishes_weighted_result_to_given_cloud_client(self):
        engine = RiskEngine()
        for source, field, value in [
            ("yolo", "yolo_confidence", 0.8),
            ("flame", "flame_detected", 1),
            ("anomaly", "anomaly_score", 0.6),
        ]:
            engine.update(f"firebomba/room/1/{source}", {field: value})
        client = MagicMock()
        client.publish.return_value.rc = 0
        self.service.publish_risks(client, engine)
        args, kwargs = client.publish.call_args
        self.assertEqual(args[0], "firebomba/room/1/risk")
        result = json.loads(args[1])
        self.assertEqual(result["risk_score"], 0.82)
        self.assertEqual(result["risk_level"], "Critical")
        self.assertIn("timestamp", result)
        self.assertEqual(kwargs, {"qos": 1, "retain": False})


if __name__ == "__main__":
    unittest.main()
