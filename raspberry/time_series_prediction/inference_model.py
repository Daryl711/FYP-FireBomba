import json
import os

import joblib
import numpy as np
import torch
import torch.nn as nn


RISK_NAMES = {0: "NORMAL", 1: "WARNING", 2: "ALERT"}

MIN_STD = {
    "avg_temperature": 1.4,
    "avg_humidity": 3.5,
    "avg_smoke": 0.012,
    "avg_co": 0.014,
}


class FireLSTM(nn.Module):
    """V5 model: config-driven inputs, four output sensors."""

    def __init__(
        self,
        input_size,
        output_features,
        hidden_size,
        num_layers,
        horizon,
        dropout,
        head_size,
    ):
        super().__init__()
        self.output_features = output_features
        self.horizon = horizon
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.norm = nn.LayerNorm(hidden_size)
        self.head = nn.Sequential(
            nn.Linear(hidden_size, head_size),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(head_size, horizon * output_features),
        )

    def forward(self, x):
        _, (h_n, _) = self.lstm(x)
        h = self.norm(h_n[-1])
        out = self.head(h)
        return out.view(-1, self.horizon, self.output_features)


def risk_score_batch(
    baseline_windows_raw,
    forecasts_raw,
    feature_cols,
    danger_directions,
    min_std,
    risk_sensor_weights,
    risk_z_floor,
    risk_support_z,
    risk_support_bonus,
    risk_smoke_co_bonus,
    risk_temporal_blend,
):
    """Calculate weighted fire-risk scores from forecasts and recent readings."""
    baseline_mean = baseline_windows_raw.mean(axis=1)
    baseline_std = baseline_windows_raw.std(axis=1)

    for j, col in enumerate(feature_cols):
        baseline_std[:, j] = np.maximum(
            baseline_std[:, j], float(min_std.get(col, 1e-6))
        )

    z_scores = (
        forecasts_raw - baseline_mean[:, None, :]
    ) / baseline_std[:, None, :]

    signed = np.zeros_like(z_scores)
    for j, col in enumerate(feature_cols):
        direction = danger_directions.get(col, "high")
        signed[:, :, j] = (
            z_scores[:, :, j]
            if direction == "high"
            else -z_scores[:, :, j]
        )

    weights = np.array(
        [float(risk_sensor_weights.get(c, 1.0)) for c in feature_cols],
        dtype=np.float64,
    )

    evidence = np.maximum(signed - float(risk_z_floor), 0.0)
    score = (evidence * weights[None, None, :]).sum(axis=2)

    support_count = (signed >= float(risk_support_z)).sum(axis=2)
    score += float(risk_support_bonus) * np.maximum(support_count - 1, 0)

    idx = {c: i for i, c in enumerate(feature_cols)}
    smoke_i = idx.get("avg_smoke")
    co_i = idx.get("avg_co")
    if smoke_i is not None and co_i is not None:
        both = (
            (signed[:, :, smoke_i] >= float(risk_support_z))
            & (signed[:, :, co_i] >= float(risk_support_z))
        )
        score += float(risk_smoke_co_bonus) * both.astype(np.float64)

    blend = float(risk_temporal_blend)
    if score.shape[1] > 1 and blend > 0:
        blended = score.copy()
        blended[:, 1:] = (
            (1.0 - blend) * score[:, 1:]
            + blend * score[:, :-1]
        )
        score = blended

    return signed, score


def classify_scores_batch(scores, warning_threshold, alert_threshold):
    risk = np.zeros_like(scores, dtype=np.int8)
    risk[scores >= float(warning_threshold)] = 1
    risk[scores >= float(alert_threshold)] = 2
    return risk


class LoadedModel:
    def __init__(self, model_dir):
        cfg_path = os.path.join(model_dir, "model_config.json")
        model_path = os.path.join(model_dir, "best_model.pt")
        scaler_path = os.path.join(model_dir, "scaler.pkl")
        for path in (cfg_path, model_path, scaler_path):
            if not os.path.exists(path):
                raise FileNotFoundError(f"Missing required model artifact:\n{path}")

        with open(cfg_path, "r", encoding="utf-8") as file:
            self.config = json.load(file)

        self.feature_cols = self.config["feature_cols"]
        self.seq_len = int(self.config["seq_len"])
        self.horizon = int(self.config["horizon"])
        self.hidden_size = int(self.config["hidden_size"])
        self.num_layers = int(self.config["num_layers"])
        self.dropout = float(self.config["dropout"])
        self.head_size = int(self.config.get("head_size", 128))
        self.model_input_dim = int(
            self.config.get("model_input_dim", len(self.feature_cols) * 3)
        )
        self.trend_lag = int(self.config.get("trend_lag", 6))

        self.danger_directions = self.config.get(
            "danger_directions",
            {
                "avg_temperature": "high",
                "avg_humidity": "low",
                "avg_smoke": "high",
                "avg_co": "high",
            },
        )
        self.min_std = self.config.get("min_std", MIN_STD)
        self.risk_sensor_weights = self.config.get(
            "risk_sensor_weights",
            {
                "avg_temperature": 0.90,
                "avg_humidity": 0.70,
                "avg_smoke": 1.35,
                "avg_co": 1.35,
            },
        )
        self.risk_z_floor = float(self.config.get("risk_z_floor", 0.80))
        self.risk_support_z = float(self.config.get("risk_support_z", 1.40))
        self.risk_support_bonus = float(
            self.config.get("risk_support_bonus", 0.35)
        )
        self.risk_smoke_co_bonus = float(
            self.config.get("risk_smoke_co_bonus", 0.55)
        )
        self.risk_temporal_blend = float(
            self.config.get("risk_temporal_blend", 0.25)
        )
        self.warning_score = float(
            self.config.get("risk_warning_score", 2.25)
        )
        self.alert_score = float(self.config.get("risk_alert_score", 4.50))

        self.device = torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        self.model = FireLSTM(
            input_size=self.model_input_dim,
            output_features=len(self.feature_cols),
            hidden_size=self.hidden_size,
            num_layers=self.num_layers,
            horizon=self.horizon,
            dropout=self.dropout,
            head_size=self.head_size,
        ).to(self.device)

        state = torch.load(model_path, map_location=self.device)
        self.model.load_state_dict(state)
        self.model.eval()
        self.scaler = joblib.load(scaler_path)

    def _make_model_input(self, windows_raw):
        """Convert raw (N, seq, features) windows into V5 model inputs."""
        windows_raw = windows_raw.astype(np.float64)
        n, seq_len, n_feat = windows_raw.shape

        flat = windows_raw.reshape(-1, n_feat)
        raw_scaled = self.scaler.transform(flat).reshape(
            n, seq_len, n_feat
        )

        delta = np.zeros_like(windows_raw, dtype=np.float64)
        delta[:, 1:, :] = (
            windows_raw[:, 1:, :] - windows_raw[:, :-1, :]
        )
        delta_scaled = delta / self.scaler.scale_[None, None, :]

        trend = np.zeros_like(windows_raw, dtype=np.float64)
        lag = min(self.trend_lag, seq_len - 1)
        if lag > 0:
            trend[:, lag:, :] = (
                windows_raw[:, lag:, :] - windows_raw[:, :-lag, :]
            )
        trend_scaled = trend / self.scaler.scale_[None, None, :]

        model_input = np.concatenate(
            [raw_scaled, delta_scaled, trend_scaled],
            axis=2,
        ).astype(np.float32)

        if model_input.shape[2] != self.model_input_dim:
            raise ValueError(
                f"Inference produced {model_input.shape[2]} input channels "
                f"but model_config expects {self.model_input_dim}."
            )
        return model_input

    def forecast_batch(self, windows_raw, batch_size=1024):
        model_input = self._make_model_input(windows_raw)
        outputs = []

        with torch.no_grad():
            for start in range(0, len(model_input), batch_size):
                xb = torch.from_numpy(
                    model_input[start:start + batch_size]
                ).to(self.device)

                if self.device.type == "cuda":
                    with torch.amp.autocast(
                        "cuda", enabled=True, dtype=torch.float16
                    ):
                        out = self.model(xb)
                    outputs.append(out.float().cpu().numpy())
                else:
                    outputs.append(self.model(xb).cpu().numpy())

        pred_residual_scaled = np.concatenate(outputs, axis=0)
        last_raw = windows_raw[:, -1, :].astype(np.float64)
        return (
            last_raw[:, None, :]
            + pred_residual_scaled * self.scaler.scale_[None, None, :]
        )

    def forecast_one(self, window_raw):
        return self.forecast_batch(
            window_raw[None, :, :], batch_size=1
        )[0]

    def predict_values(self, window_raw):
        """Return forecast sensor values without risk scores or classifications."""
        window_raw = np.asarray(window_raw, dtype=np.float32)
        expected_shape = (self.seq_len, len(self.feature_cols))
        if window_raw.shape != expected_shape:
            raise ValueError(
                f"Inference window has shape {window_raw.shape}; "
                f"expected {expected_shape}."
            )
        if not np.isfinite(window_raw).all():
            raise ValueError("Inference window contains non-finite sensor values.")

        forecast = self.forecast_one(window_raw)
        if not np.isfinite(forecast).all():
            raise ValueError("Inference produced non-finite prediction values.")
        return [
            {
                feature: float(value)
                for feature, value in zip(self.feature_cols, prediction)
            }
            for prediction in forecast
        ]

    def classify_batch(self, windows_raw, forecasts_raw):
        signed_z, scores = risk_score_batch(
            windows_raw,
            forecasts_raw,
            self.feature_cols,
            self.danger_directions,
            self.min_std,
            self.risk_sensor_weights,
            self.risk_z_floor,
            self.risk_support_z,
            self.risk_support_bonus,
            self.risk_smoke_co_bonus,
            self.risk_temporal_blend,
        )
        risks = classify_scores_batch(
            scores,
            self.warning_score,
            self.alert_score,
        )
        return signed_z, scores, risks
