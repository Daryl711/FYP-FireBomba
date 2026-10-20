import unittest

from risk_detection.engine import RiskEngine, calculate_risk


class RiskCalculationTests(unittest.TestCase):
    def test_weights_and_thresholds(self):
        for inputs, score, level in [
            ((0, 0, 0), 0, "Normal"),
            ((0.7, 0, 0.7), 0.42, "Normal"),
            ((0.75, 0, 0.75), 0.45, "Warning"),
            ((1, 0, 1), 0.6, "Warning"),
            ((1, 1, 1 / 6), 0.75, "Warning"),
            ((1, 1, 0.17), 0.751, "Critical"),
            ((1, 1, 1), 1, "Critical"),
        ]:
            with self.subTest(inputs=inputs):
                result = calculate_risk(*inputs)
                self.assertAlmostEqual(result["risk_score"], score)
                self.assertEqual(result["risk_level"], level)

    def test_exact_upper_boundary(self):
        result = calculate_risk(0.6, 1, 17 / 30)
        self.assertEqual(result["risk_score"], 0.75)
        self.assertEqual(result["risk_level"], "Warning")

    def test_flame_override_preserves_score(self):
        result = calculate_risk(0, 1, 0)
        self.assertEqual(result["risk_score"], 0.4)
        self.assertEqual(result["risk_level"], "Warning")

    def test_invalid_inputs(self):
        for inputs in [(None, 0, 0), (-0.1, 0, 0), (1.1, 0, 0),
                       (0, 2, 0), (0, 0, float("nan")),
                       (0, 0, float("inf")), ("0.5", 0, 0), (True, 0, 0)]:
            with self.subTest(inputs=inputs), self.assertRaises(ValueError):
                calculate_risk(*inputs)


class RoomCacheTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.engine = RiskEngine(clock=lambda: self.now)

    def feed(self, room, yolo=0, flame=0, anomaly=0):
        for source, field, value in [
            ("yolo", "yolo_confidence", yolo),
            ("flame", "flame_detected", flame),
            ("anomaly", "anomaly_score", anomaly),
        ]:
            self.engine.update(f"firebomba/room/{room}/{source}", {field: value})

    def test_waits_for_all_inputs_and_keeps_rooms_independent(self):
        self.engine.update("firebomba/room/1/flame", {"flame_detected": 1})
        self.assertEqual(self.engine.evaluate(), {})
        self.feed("2")
        self.assertEqual(set(self.engine.evaluate()), {"2"})
        self.feed("1", flame=1)
        results = self.engine.evaluate()
        self.assertEqual(results["1"]["risk_level"], "Warning")
        self.assertEqual(results["2"]["risk_level"], "Normal")

    def test_latest_reading_replaces_previous(self):
        self.feed("1", 1, 1, 1)
        self.assertEqual(self.engine.evaluate()["1"]["risk_level"], "Critical")
        self.feed("1")
        self.assertEqual(self.engine.evaluate()["1"]["risk_level"], "Normal")

    def test_expired_input_requires_refresh(self):
        self.feed("1")
        self.now += 31
        self.engine.update("firebomba/room/1/flame", {"flame_detected": 1})
        self.assertEqual(self.engine.evaluate(), {})
        self.feed("1", flame=1)
        self.assertEqual(self.engine.evaluate()["1"]["risk_level"], "Warning")

    def test_bad_payload_does_not_replace_valid_value(self):
        self.feed("1", flame=1)
        for payload in [[], {}, {"flame_detected": 2}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.engine.update("firebomba/room/1/flame", payload)
        self.assertEqual(self.engine.evaluate()["1"]["flame_detected"], 1)
        self.assertFalse(self.engine.update("firebomba/room/1/risk", {}))


class CameraAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.engine = RiskEngine(clock=lambda: self.now)
        self.sensors()

    def sensors(self, room="1", flame=1, anomaly=0.5):
        self.engine.update(f"firebomba/room/{room}/flame", {"flame_detected": flame})
        self.engine.update(f"firebomba/room/{room}/anomaly", {"anomaly_score": anomaly})

    def camera(self, status, room="1", **extra):
        payload = {"status": status}
        if status == "connected":
            payload["yolo_confidence"] = 0.2
        payload.update(extra)
        return self.engine.update(f"firebomba/room/{room}/yolo", payload)

    def result(self):
        return self.engine.evaluate()["1"]

    def test_fifth_disconnect_switches_weights_without_a_prediction(self):
        for _ in range(4):
            self.camera("disconnected")
            self.assertEqual(self.engine.evaluate(), {})
        self.camera("disconnected")
        result = self.result()
        self.assertEqual(result["risk_score"], 0.8)
        self.assertEqual(result["risk_level"], "Critical")
        self.assertEqual(result["mode"], "sensor_only")
        self.assertEqual(result["weights"], {"yolo": 0, "flame": 0.6, "anomaly": 0.4})

    def test_four_disconnects_keep_normal_weights_and_latest_prediction(self):
        self.camera("connected")
        for _ in range(4):
            self.camera("disconnected")
            self.assertEqual(self.result()["risk_score"], 0.61)
        self.camera("disconnected")
        self.assertEqual(self.result()["risk_score"], 0.8)

    def test_requires_five_connected_updates_to_restore(self):
        for _ in range(5):
            self.camera("disconnected")
        for _ in range(4):
            self.camera("connected")
            self.assertEqual(self.result()["mode"], "sensor_only")
        self.camera("connected")
        self.assertEqual(self.result()["mode"], "normal")
        self.assertEqual(self.result()["risk_score"], 0.61)

    def test_opposite_status_resets_each_streak(self):
        self.camera("connected")
        for _ in range(4):
            self.camera("disconnected")
        self.camera("connected")
        self.camera("disconnected")
        self.assertEqual(self.result()["mode"], "normal")
        for _ in range(4):
            self.camera("disconnected")
        for _ in range(4):
            self.camera("connected")
        self.camera("disconnected")
        self.camera("connected")
        self.assertEqual(self.result()["mode"], "sensor_only")

    def test_fallback_ignores_camera_age_but_requires_fresh_sensors(self):
        for _ in range(5):
            self.camera("disconnected")
        self.now += 31
        self.assertEqual(self.engine.evaluate(), {})
        self.sensors()
        self.assertEqual(self.result()["mode"], "sensor_only")

    def test_status_streaks_are_independent_between_rooms(self):
        self.sensors("2")
        self.camera("connected", room="2")
        for _ in range(5):
            self.camera("disconnected")
        result = self.engine.evaluate()
        self.assertEqual(result["1"]["mode"], "sensor_only")
        self.assertEqual(result["2"]["mode"], "normal")

    def test_duplicate_and_older_timestamps_do_not_count(self):
        for _ in range(5):
            self.camera("disconnected", timestamp="2026-10-20T12:00:00+00:00")
        self.camera("disconnected", timestamp="2026-10-20T11:59:59+00:00")
        self.assertEqual(self.engine.camera_states["1"]["count"], 1)
        for second in range(1, 5):
            self.camera("disconnected", timestamp=f"2026-10-20T12:00:0{second}+00:00")
        self.assertEqual(self.result()["mode"], "sensor_only")

    def test_missing_status_and_long_gaps_interrupt_a_streak(self):
        for _ in range(4):
            self.camera("disconnected")
        self.engine.update("firebomba/room/1/yolo", {"yolo_confidence": 0.2})
        self.camera("disconnected")
        self.assertEqual(self.result()["mode"], "normal")
        for _ in range(3):
            self.camera("disconnected")
        self.now += 31
        self.sensors()
        self.camera("disconnected")
        self.assertFalse(self.engine.camera_states["1"]["sensor_only"])

    def test_invalid_camera_message_does_not_change_streak(self):
        self.camera("disconnected")
        for payload in [{"status": "offline"}, {"status": "connected"},
                        {"status": "connected", "yolo_confidence": float("nan")},
                        {"status": "disconnected", "timestamp": "invalid"}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.engine.update("firebomba/room/1/yolo", payload)
        self.assertEqual(self.engine.camera_states["1"]["count"], 1)

    def test_repeated_evaluation_does_not_count_as_new_frames(self):
        self.camera("connected")
        self.camera("disconnected")
        for _ in range(10):
            self.assertEqual(self.result()["mode"], "normal")
        self.assertEqual(self.engine.camera_states["1"]["count"], 1)

    def test_fallback_thresholds(self):
        for anomaly, score, severity in [(0, 0.6, "Warning"), (0.375, 0.75, "Warning"),
                                         (0.4, 0.76, "Critical"), (1, 1, "Critical")]:
            with self.subTest(anomaly=anomaly):
                result = calculate_risk(0, 1, anomaly, sensor_only=True)
                self.assertEqual(result["risk_score"], score)
                self.assertEqual(result["risk_level"], severity)
        self.assertEqual(calculate_risk(0, 0, 1, sensor_only=True)["risk_level"], "Normal")


if __name__ == "__main__":
    unittest.main()
