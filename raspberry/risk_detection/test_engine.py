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


if __name__ == "__main__":
    unittest.main()
