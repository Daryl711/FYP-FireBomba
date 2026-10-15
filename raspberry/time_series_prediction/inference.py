import joblib
import numpy as np

class FireAnomalyDetector:
    def __init__(self, model_path):
        self.model_path = model_path
        self.model = joblib.load(model_path)

        self.directions = {
            "avg_temperature": 1,
            "avg_humidity": -1,
            "avg_smoke": 1,
            "avg_co": 1
        }

        self.weights = {
            "avg_temperature": 0.2,
            "avg_humidity": 0.05,
            "avg_smoke": 0.4,
            "avg_co": 0.35
        }

        self.update_threshold = 0.1716
        
        self.learning_rate = 0.01
        self.consecutive_safe_readings = 0
        self.required_safe_readings = 12
        self.adaptive_median = self.model["median"].copy()
        self.previous = None

    # def update_baseline(self, reading, anomaly_score, hard_sensor_alarm=False, yolo_fire_detected=False):
    #     """Adapt and save medians starting with the 12th consecutive safe reading.

    #     Scores at or below update_threshold qualify. A higher or non-finite
    #     score resets the streak. Returns True when the model was updated.
    #     """

    #     safe_to_update = (
    #         np.isfinite(anomaly_score)
    #         and anomaly_score <= self.update_threshold
    #         and not hard_sensor_alarm
    #         and not yolo_fire_detected
    #     )
    #     if not safe_to_update:
    #         self.consecutive_safe_readings = 0
    #         return False

    #     self.consecutive_safe_readings += 1
    #     if self.consecutive_safe_readings < self.required_safe_readings:
    #         return False

    #     lr = self.learning_rate

    #     for feature in self.model["features"]:
    #         original = self.model["median"][feature]
    #         scale = self.model["scale"][feature]
    
    #         maximum_drift = 0.5 * scale
            
    #         new_median = (
    #             lr * reading[feature]
    #             + (1 - lr) * self.adaptive_median[feature]
    #         )

    #         self.adaptive_median[feature] = float(
    #             np.clip(
    #                 new_median,
    #                 original - maximum_drift,
    #                 original + maximum_drift
    #             )
    #         )

    #     return True


    def validate_reading(self, reading):
        for feature in self.model["features"]:
            if feature not in reading:
                return False

            try:
                value = float(reading[feature])
            except (TypeError, ValueError):
                return False

            if not np.isfinite(value):
                return False

        return True

    def detect(self, reading):

        if not self.validate_reading(reading):
            self.consecutive_safe_readings = 0
            raise ValueError("Invalid sensor reading")
        
        value_scores = {}
        trend_scores = {}

        reading = {
            feature: float(reading[feature])
            for feature in self.model["features"]
        }

        for feature in self.model["features"]:
            direction = self.directions[feature]

            median = self.adaptive_median[feature]
            scale = max(self.model["scale"][feature], 1e-6)

            value_z = direction * (
                reading[feature] - median
            ) / scale

            value_scores[feature] = max(0.0, value_z)

            if self.previous is not None:
                delta = reading[feature] - self.previous[feature]

                delta_feature = f"{feature}_delta"

                delta_median = self.model["delta_median"][delta_feature]
                delta_scale = max(
                    self.model["delta_scale"][delta_feature],
                    1e-6
                )

                trend_z = direction * (
                    delta - delta_median
                ) / delta_scale

                trend_scores[feature] = max(0.0, trend_z)

        self.previous = reading.copy()

        value_risk = sum(
            self.weights[f] * value_scores[f]
            for f in self.model["features"]
        )

        trend_risk = sum(
            self.weights[f] * trend_scores.get(f, 0)
            for f in self.model["features"]
        )

        raw_score = 0.4 * value_risk + 0.6 * trend_risk

        # Temporary bounded anomaly index
        anomaly_score = 1 - np.exp(-raw_score / 3)
        # baseline_updated = self.update_baseline(reading, anomaly_score)

        return {
            "value_scores": value_scores,
            "trend_scores": trend_scores,
            "raw_score": float(raw_score),
            "anomaly_score": float(anomaly_score),
            # "baseline_updated": baseline_updated,
            # "consecutive_safe_readings": self.consecutive_safe_readings

        }


