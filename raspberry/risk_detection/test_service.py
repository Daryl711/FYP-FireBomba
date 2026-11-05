"""Exercise publication using shared MQTT clients without a broker."""

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

    def test_old_entry_point_does_not_launch_another_bridge(self):
        bridge = MagicMock()
        with patch.dict("sys.modules", {"mqtt.mqtt": bridge}), patch("builtins.print") as output:
            self.service.main()
        bridge.main.assert_not_called()
        self.mqtt.Client.assert_not_called()
        self.assertIn("Disable the standalone risk service", output.call_args.args[0])

    def test_subscribes_using_existing_client(self):
        client = MagicMock()
        self.service.subscribe_inputs(client)
        client.subscribe.assert_called_once_with([
            ("firebomba/room/+/yolo", 1),
            ("firebomba/room/+/flame", 1),
            ("firebomba/room/+/anomaly", 1),
        ])
        self.mqtt.Client.assert_not_called()

    def test_handler_updates_cache_and_ignores_retained_or_invalid_inputs(self):
        from types import SimpleNamespace
        engine = RiskEngine()
        for source, field, value in [
            ("yolo", "yolo_confidence", 0.8),
            ("flame", "flame_detected", 1),
            ("anomaly", "anomaly_score", 0.6),
        ]:
            self.service.handle_message(engine, SimpleNamespace(
                topic=f"firebomba/room/1/{source}", retain=False,
                payload=json.dumps({field: value}).encode(),
            ))
        for payload, retained in [(b'{"flame_detected": 0}', True), (b'{', False)]:
            self.service.handle_message(engine, SimpleNamespace(
                topic="firebomba/room/1/flame", payload=payload, retain=retained,
            ))
        self.assertEqual(engine.evaluate()["1"]["risk_score"], 0.82)

    def test_bridge_reuses_clients_and_routes_risk_inputs(self):
        from types import SimpleNamespace
        modules = {
            "paho": MagicMock(), "paho.mqtt": MagicMock(),
            "paho.mqtt.client": self.mqtt, "dotenv": MagicMock(),
            "mqtt.database": MagicMock(), "sync.sync": MagicMock(),
            "anomaly_detection.inference": MagicMock(),
            "risk_detection.service": self.service,
        }
        modules["paho"].mqtt = modules["paho.mqtt"]
        modules["paho.mqtt"].client = self.mqtt
        spec = importlib.util.spec_from_file_location(
            "mqtt_bridge_under_test", Path(__file__).parents[1] / "mqtt" / "mqtt.py"
        )
        bridge = importlib.util.module_from_spec(spec)
        env = {key: "test" for key in (
            "AWS_IOT_ENDPOINT", "AWS_IOT_ROOT_CA_PATH",
            "AWS_IOT_CERTIFICATE_PATH", "AWS_IOT_PRIVATE_KEY_PATH",
        )}
        with patch.dict("sys.modules", modules), patch.dict(os.environ, env):
            spec.loader.exec_module(bridge)
        client = MagicMock()
        bridge.on_local_connect(client, None, None, 0)
        client.subscribe.assert_any_call("firebomba/room/+/sensor-data", qos=1)
        client.subscribe.assert_any_call("firebomba/room/+/pump/status", qos=1)
        self.assertEqual(client.subscribe.call_count, 3)
        for source, field, value in [
            ("yolo", "yolo_confidence", 0.8),
            ("flame", "flame_detected", 1),
            ("anomaly", "anomaly_score", 0.6),
        ]:
            bridge.on_local_message(client, None, SimpleNamespace(
                topic=f"firebomba/room/1/{source}", retain=False,
                payload=json.dumps({field: value}).encode(),
            ))
        self.assertEqual(bridge.risk_engine.evaluate()["1"]["risk_score"], 0.82)
        self.assertEqual(self.mqtt.Client.call_count, 2)
        bridge.insert_sensor_reading.assert_not_called()

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

    def critical_engine(self, clock=None):
        engine = RiskEngine(**({"clock": clock} if clock else {}))
        for source, field, value in [
            ("yolo", "yolo_confidence", 0.8),
            ("flame", "flame_detected", 1),
            ("anomaly", "anomaly_score", 0.6),
        ]:
            engine.update("firebomba/room/1/" + source, {field: value})
        return engine

    def test_local_alarm_turns_on_for_critical_and_clears_on_lower_risk(self):
        engine = self.critical_engine()
        local = MagicMock()
        local.publish.return_value.rc = 0
        self.service.publish_risks(None, engine, local)
        self.service.publish_risks(None, engine, local)
        self.assertEqual(local.publish.call_count, 2)
        topic, payload = local.publish.call_args.args
        self.assertEqual(topic, "firebomba/room/1/alarm/command")
        self.assertEqual(json.loads(payload)["command"], "ON")
        self.assertEqual(local.publish.call_args.kwargs, {"qos": 1, "retain": False})
        engine.update("firebomba/room/1/flame", {"flame_detected": 0})
        self.service.publish_risks(None, engine, local)
        self.assertEqual(json.loads(local.publish.call_args.args[1])["command"], "OFF")

    def test_stale_inputs_do_not_clear_a_previously_triggered_alarm(self):
        now = [0.0]
        engine = self.critical_engine(clock=lambda: now[0])
        local = MagicMock()
        local.publish.return_value.rc = 0
        self.service.publish_risks(None, engine, local)
        now[0] = 31.0
        self.service.publish_risks(None, engine, local)
        self.assertEqual(local.publish.call_count, 1)
        self.assertEqual(json.loads(local.publish.call_args.args[1])["command"], "ON")

    def test_shared_clients_send_local_alarm_while_cloud_is_disconnected(self):
        engine = self.critical_engine()
        local, cloud = MagicMock(), MagicMock()
        local.is_connected.return_value = True
        local.publish.return_value.rc = 0
        cloud.is_connected.return_value = False
        stop = MagicMock()
        stop.wait.side_effect = [False, True]
        self.service.run_risk_detection(local, cloud, engine, stop)
        cloud.publish.assert_not_called()
        self.assertEqual(local.publish.call_args.args[0], "firebomba/room/1/alarm/command")
        for client in (local, cloud):
            client.connect.assert_not_called()
            client.disconnect.assert_not_called()
            client.loop_start.assert_not_called()
            client.loop_stop.assert_not_called()
        self.mqtt.Client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
