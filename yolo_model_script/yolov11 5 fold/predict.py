from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import torch
from ultralytics import YOLO


def _load_json_if_exists(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def find_model_path(root: Path, explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if path.exists():
            return path
        raise FileNotFoundError(f"Model path not found: {path}")

    deployment = _load_json_if_exists(root / "deployment_profile.json")
    deployment_model = deployment.get("model_path")
    if deployment_model:
        p = Path(str(deployment_model))
        if p.exists():
            return p

    kfold = _load_json_if_exists(root / "kfold_results_yolo11.json")
    kfold_model = kfold.get("best_model")
    if kfold_model:
        p = Path(str(kfold_model))
        if p.exists():
            return p

    candidates = list((root / "runs" / "detect").glob("**/weights/best.pt"))
    if not candidates:
        raise FileNotFoundError("No best.pt found under runs/detect.")

    return max(candidates, key=lambda p: p.stat().st_mtime)


def load_runtime_config(root: Path, fire_conf: float | None, smoke_conf: float | None, imgsz: int | None, iou: float | None) -> tuple[float, float, int, float]:
    default_fire = 0.22
    default_smoke = 0.30
    default_imgsz = 736
    default_iou = 0.55

    profile = _load_json_if_exists(root / "deployment_profile.json")
    profile_inf = profile.get("inference", {}) if isinstance(profile.get("inference"), dict) else {}
    profile_thr = profile.get("thresholds", {}) if isinstance(profile.get("thresholds"), dict) else {}

    profile_fire = float(profile_thr.get("fire", default_fire))
    profile_smoke = float(profile_thr.get("smoke", default_smoke))
    profile_imgsz = int(profile_inf.get("imgsz", default_imgsz))
    profile_iou = float(profile_inf.get("iou", default_iou))

    cfg = _load_json_if_exists(root / "thresholds_optimized.json")
    best_fire = float(cfg.get("fire_threshold", profile_fire))
    best_smoke = float(cfg.get("smoke_threshold", profile_smoke))

    final_fire = fire_conf if fire_conf is not None else best_fire
    final_smoke = smoke_conf if smoke_conf is not None else best_smoke
    final_imgsz = imgsz if imgsz is not None else profile_imgsz
    final_iou = iou if iou is not None else profile_iou

    return final_fire, final_smoke, final_imgsz, final_iou


def _parse_source(raw: str) -> int | str:
    p = Path(raw)
    if raw.isdigit() and not p.exists():
        return int(raw)
    return raw


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fire and smoke detection for images, videos, and webcam")
    parser.add_argument("--model", type=str, default=None, help="Path to model weights (.pt)")
    parser.add_argument("--source", type=str, default="0", help="Input source: webcam index, image/video path, or folder")
    parser.add_argument("--imgsz", type=int, default=None, help="Inference image size (overrides deployment profile)")
    parser.add_argument("--iou", type=float, default=None, help="NMS IoU threshold (overrides deployment profile)")
    parser.add_argument("--fire-conf", type=float, default=None, help="Confidence threshold for fire class")
    parser.add_argument("--smoke-conf", type=float, default=None, help="Confidence threshold for smoke class")
    parser.add_argument("--window", type=int, default=8, help="Temporal smoothing window size for video")
    parser.add_argument("--min-positive", type=int, default=3, help="Min positive frames in window for alert")
    parser.add_argument("--device", type=str, default=None, help="Inference device (default: cuda:0 if available, else cpu)")
    parser.add_argument("--save", action="store_true", help="Save predictions")
    return parser.parse_args()


def main():
    args = parse_args()
    root = Path(__file__).resolve().parent
    model_path = find_model_path(root, args.model)
    fire_conf, smoke_conf, imgsz, iou = load_runtime_config(root, args.fire_conf, args.smoke_conf, args.imgsz, args.iou)
    base_conf = min(fire_conf, smoke_conf)
    device = args.device if args.device is not None else ("cuda:0" if torch.cuda.is_available() else "cpu")

    print(f"Using model: {model_path}")
    print(f"Device: {device}")
    print(f"Thresholds: fire={fire_conf:.2f}, smoke={smoke_conf:.2f}, base={base_conf:.2f}")
    print(f"Inference config: imgsz={imgsz}, iou={iou}")

    model = YOLO(str(model_path))

    source = _parse_source(args.source)
    results = model.predict(
        source=source,
        conf=max(0.01, base_conf * 0.75),
        imgsz=imgsz,
        iou=iou,
        max_det=100,
        device=device,
        stream=True,
        save=args.save,
        verbose=False,
    )

    fire_hist = deque(maxlen=max(1, args.window))
    smoke_hist = deque(maxlen=max(1, args.window))

    total = 0
    for r in results:
        total += 1
        h, w = r.orig_shape
        min_box_area = max(120.0, float(h * w) * 0.00018)

        fire_found = False
        smoke_found = False
        filtered_count = 0

        for b in r.boxes:
            cls_id = int(b.cls[0])
            score = float(b.conf[0])
            x1, y1, x2, y2 = map(float, b.xyxy[0].tolist())
            box_area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
            if box_area < min_box_area:
                continue

            if cls_id == 0 and score >= fire_conf:
                fire_found = True
                filtered_count += 1
            elif cls_id == 1 and score >= smoke_conf:
                smoke_found = True
                filtered_count += 1

        fire_hist.append(1 if fire_found else 0)
        smoke_hist.append(1 if smoke_found else 0)
        fire_alert = sum(fire_hist) >= args.min_positive
        smoke_alert = sum(smoke_hist) >= args.min_positive

        print(
            f"frame={total:05d} filtered_boxes={filtered_count:02d} "
            f"fire={fire_found} smoke={smoke_found} alert_fire={fire_alert} alert_smoke={smoke_alert}"
        )

    print(f"Done. Processed {total} frames/images.")

if __name__ == "__main__":
    main()