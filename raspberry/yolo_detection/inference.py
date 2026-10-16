"""Classify an image/ROI using the trained MobileNetV3-Small checkpoint."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from PIL import Image, ImageOps
from torch import nn
from torchvision import models, transforms


DEFAULT_CHECKPOINT = Path(__file__).resolve().parent / "best_model.pth"


class YoloClassifier:
    """Load once, then call predict() for each image or detector ROI crop."""

    def __init__(
        self, checkpoint: str | Path = DEFAULT_CHECKPOINT, device: str = "auto"
    ) -> None:
        if device not in ("auto", "cpu", "cuda"):
            raise ValueError("device must be auto, cpu, or cuda")
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable. Use --device cpu.")
        self.device = torch.device(device)

        

        saved = torch.load(checkpoint, map_location="cpu", weights_only=False)
        if not isinstance(saved, dict):
            raise ValueError("Expected a dictionary checkpoint from train.py.")
        if saved.get("architecture") not in (None, "mobilenet_v3_small"):
            raise ValueError(f"Unsupported architecture: {saved['architecture']!r}")
        self.class_names = saved.get("class_names")
        if (
            not isinstance(self.class_names, list)
            or not self.class_names
            or not all(isinstance(name, str) and name for name in self.class_names)
            or len(set(self.class_names)) != len(self.class_names)
        ):
            raise ValueError("Checkpoint must contain unique, nonempty class_names.")
        self.image_size = int(saved.get("image_size", 256))
        if self.image_size <= 0:
            raise ValueError("Checkpoint image_size must be positive.")
        state = saved.get("model_state_dict", saved.get("state_dict"))
        if not isinstance(state, dict):
            raise ValueError("Checkpoint is missing model_state_dict/state_dict.")

        self.model = models.mobilenet_v3_small(weights=None)
        self.model.classifier[-1] = nn.Linear(
            self.model.classifier[-1].in_features, len(self.class_names)
        )
        self.model.load_state_dict(state, strict=True)
        self.model.to(self.device).eval()
        self.transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
        ])

    @torch.inference_mode()
    def predict(self, image: str | Path | Image.Image) -> dict[str, str | float]:
        """Return class and softmax confidence (0-1). PIL inputs use RGB order."""
        if isinstance(image, (str, Path)):
            with Image.open(image) as source:
                rgb = ImageOps.exif_transpose(source).convert("RGB")
        elif isinstance(image, Image.Image):
            rgb = ImageOps.exif_transpose(image).convert("RGB")
        else:
            raise TypeError("image must be a file path or PIL.Image.Image")

        # Match train.py: center on RGB(114) square, then resize with bicubic.
        width, height = rgb.size
        side = max(width, height)
        square = Image.new("RGB", (side, side), (114, 114, 114))
        square.paste(rgb, ((side - width) // 2, (side - height) // 2))
        resized = square.resize(
            (self.image_size, self.image_size), Image.Resampling.BICUBIC
        )
        tensor = self.transform(resized).unsqueeze(0).to(self.device)
        probabilities = self.model(tensor).float().softmax(dim=1)[0]
        confidence, index = probabilities.max(dim=0)
        return {
            "class": self.class_names[index.item()],
            "confidence": confidence.item(),
        }



