"""Classify an image/ROI using the exported MobileNet ONNX model."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps


DEFAULT_MODEL = Path(__file__).resolve().parent / "onnx" / "best_model.onnx"


class MobileNetClassifier:
    """Load once, then call predict() for each image or detector ROI crop."""

    def __init__(self, model_path: str | Path = DEFAULT_MODEL) -> None:
        model_path = Path(model_path)
        with model_path.with_suffix(".json").open(encoding="utf-8") as file:
            metadata = json.load(file)
        self.class_names = metadata["class_names"]
        if (
            not isinstance(self.class_names, list)
            or not self.class_names
            or not all(isinstance(name, str) and name for name in self.class_names)
            or len(set(self.class_names)) != len(self.class_names)
        ):
            raise ValueError("Model metadata must contain unique, nonempty class_names.")
        shape = metadata["input_shape"]
        if (len(shape) != 4 or shape[:2] != [1, 3]
                or not all(isinstance(size, int) and size > 0 for size in shape[2:])):
            raise ValueError("Expected input_shape [1, 3, height, width].")
        self.input_height, self.input_width = shape[2:]
        self.mean = np.asarray(metadata["mean"], dtype=np.float32).reshape(3, 1, 1)
        self.std = np.asarray(metadata["std"], dtype=np.float32).reshape(3, 1, 1)
        if not np.all(np.isfinite(self.mean)) or not np.all(np.isfinite(self.std)) or np.any(self.std <= 0):
            raise ValueError("Normalization mean/std must be finite with positive std.")

        self.session = ort.InferenceSession(
            str(model_path), providers=["CPUExecutionProvider"]
        )
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def predict(self, image: str | Path | Image.Image) -> dict[str, str | float]:
        if isinstance(image, (str, Path)):
            with Image.open(image) as source:
                rgb = ImageOps.exif_transpose(source).convert("RGB")
        elif isinstance(image, Image.Image):
            rgb = ImageOps.exif_transpose(image).convert("RGB")
        else:
            raise TypeError("image must be a file path or PIL.Image.Image")

        width, height = rgb.size
        side = max(width, height)
        square = Image.new("RGB", (side, side), (114, 114, 114))
        square.paste(rgb, ((side - width) // 2, (side - height) // 2))
        resized = square.resize(
            (self.input_width, self.input_height), Image.Resampling.BICUBIC
        )
        pixels = np.asarray(resized, dtype=np.float32).transpose(2, 0, 1) / 255.0
        tensor = np.ascontiguousarray(((pixels - self.mean) / self.std)[None])
        # The exported graph already includes softmax; applying it again would
        # change confidence values and break the camera's detection threshold.
        probabilities = self.session.run(
            [self.output_name], {self.input_name: tensor}
        )[0]
        if (probabilities.shape != (1, len(self.class_names))
                or not np.all(np.isfinite(probabilities))):
            raise ValueError("Unexpected classifier probability output.")
        index = int(np.argmax(probabilities[0]))
        return {
            "class": self.class_names[index],
            "confidence": float(probabilities[0, index]),
        }
