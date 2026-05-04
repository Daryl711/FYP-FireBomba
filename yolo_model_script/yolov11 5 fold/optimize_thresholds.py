from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import yaml
from ultralytics import YOLO


@dataclass
class Box:
    cls_id: int
    conf: float
    xyxy: Tuple[float, float, float, float]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Optimize fire/smoke thresholds for YOLO11 model")
    parser.add_argument("--model", type=str, default=None, help="Explicit model path (.pt)")
    parser.add_argument("--split", type=str, default="valid", choices=["train", "valid", "test"], help="Dataset split to optimize on")
    parser.add_argument("--imgsz", type=int, default=None, help="Inference size override")
    return parser.parse_args()


def _load_json_if_exists(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def find_best_model(root: Path, explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit)
        if p.exists():
            return p
        raise FileNotFoundError(f"Model path not found: {p}")

    deployment = _load_json_if_exists(root / "deployment_profile.json")
    deployment_model = deployment.get("model_path")
    if deployment_model:
        p = Path(str(deployment_model))
        if p.exists():
            return p

    kfold_summary = _load_json_if_exists(root / "kfold_results_yolo11.json")
    summary_model = kfold_summary.get("best_model")
    if summary_model:
        p = Path(str(summary_model))
        if p.exists():
            return p

    candidates = list(root.glob("runs/detect/**/weights/best.pt"))
    if not candidates:
        raise FileNotFoundError("No best.pt found under runs/detect.")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def resolve_split_paths(root: Path, split: str) -> tuple[Path, Path]:
    data_yaml = root / "data.yaml"
    if not data_yaml.exists():
        raise FileNotFoundError(f"Missing data.yaml: {data_yaml}")

    cfg = yaml.safe_load(data_yaml.read_text(encoding="utf-8")) or {}
    key = "val" if split == "valid" else split
    images_entry = cfg.get(key)
    if not images_entry:
        raise RuntimeError(f"Split '{split}' not found in data.yaml")

    images_path = Path(images_entry)
    if not images_path.is_absolute():
        images_path = (root / images_path).resolve()

    if images_path.name != "images":
        raise RuntimeError(f"Expected split path ending with 'images', got: {images_path}")

    labels_path = images_path.parent / "labels"
    if not images_path.exists() or not labels_path.exists():
        raise FileNotFoundError(f"Missing split directories: {images_path} | {labels_path}")

    return images_path, labels_path


def load_gt_boxes(label_file: Path, image_w: int, image_h: int) -> List[Box]:
    if not label_file.exists() or label_file.stat().st_size == 0:
        return []

    out: List[Box] = []
    for line in label_file.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            continue

        cls_id = int(parts[0])
        x_center, y_center, w, h = map(float, parts[1:5])

        x1 = (x_center - w / 2.0) * image_w
        y1 = (y_center - h / 2.0) * image_h
        x2 = (x_center + w / 2.0) * image_w
        y2 = (y_center + h / 2.0) * image_h

        out.append(Box(cls_id=cls_id, conf=1.0, xyxy=(x1, y1, x2, y2)))

    return out


def iou(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter_area

    if union <= 0:
        return 0.0
    return inter_area / union


def match_boxes(preds: List[Box], gts: List[Box], cls_id: int, iou_thr: float = 0.5) -> Tuple[int, int, int]:
    pred_cls = [p for p in preds if p.cls_id == cls_id]
    gt_cls = [g for g in gts if g.cls_id == cls_id]

    matched_gt = set()
    tp = 0

    pred_sorted = sorted(pred_cls, key=lambda x: x.conf, reverse=True)

    for p in pred_sorted:
        best_iou = 0.0
        best_j = -1
        for j, g in enumerate(gt_cls):
            if j in matched_gt:
                continue
            cur = iou(p.xyxy, g.xyxy)
            if cur > best_iou:
                best_iou = cur
                best_j = j

        if best_iou >= iou_thr and best_j >= 0:
            tp += 1
            matched_gt.add(best_j)

    fp = max(0, len(pred_cls) - tp)
    fn = max(0, len(gt_cls) - tp)
    return tp, fp, fn


def metric_from_counts(tp: int, fp: int, fn: int) -> Dict[str, float]:
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    if precision + recall == 0:
        f1 = 0.0
    else:
        f1 = 2.0 * precision * recall / (precision + recall)

    beta = 2.0
    denom = (beta * beta * precision) + recall
    if denom == 0:
        f2 = 0.0
    else:
        f2 = (1 + beta * beta) * precision * recall / denom

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "f2": f2,
    }


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parent
    split_images, split_labels = resolve_split_paths(root, args.split)
    deployment = _load_json_if_exists(root / "deployment_profile.json")
    profile_imgsz = int(deployment.get("inference", {}).get("imgsz", 640))
    imgsz = args.imgsz if args.imgsz is not None else profile_imgsz

    model_path = find_best_model(root, args.model)
    print(f"Using model: {model_path}")
    print(f"Optimizing on split: {args.split} | imgsz={imgsz}")

    model = YOLO(str(model_path))
    image_files = sorted([p for p in split_images.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}])
    if not image_files:
        raise RuntimeError(f"No images found in split '{args.split}'.")

    # Predict once with low confidence, then sweep thresholds without re-running inference.
    all_preds: Dict[str, List[Box]] = {}
    all_gts: Dict[str, List[Box]] = {}

    for idx, img_path in enumerate(image_files, start=1):
        results = model.predict(source=str(img_path), conf=0.01, imgsz=imgsz, verbose=False)
        r = results[0]
        h, w = r.orig_shape

        preds: List[Box] = []
        for b in r.boxes:
            cls_id = int(b.cls[0])
            conf = float(b.conf[0])
            x1, y1, x2, y2 = map(float, b.xyxy[0].tolist())
            preds.append(Box(cls_id=cls_id, conf=conf, xyxy=(x1, y1, x2, y2)))

        gt_path = split_labels / f"{img_path.stem}.txt"
        gts = load_gt_boxes(gt_path, image_w=w, image_h=h)

        all_preds[img_path.name] = preds
        all_gts[img_path.name] = gts

        if idx % 100 == 0:
            print(f"Processed {idx}/{len(image_files)} validation images")

    fire_grid = [round(x, 2) for x in [0.03, 0.05, 0.07, 0.10, 0.12, 0.15, 0.18, 0.20, 0.25, 0.30]]
    smoke_grid = [round(x, 2) for x in [0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.25, 0.30, 0.35]]

    best = None
    best_score = -1.0

    for fire_thr in fire_grid:
        for smoke_thr in smoke_grid:
            fire_tp = fire_fp = fire_fn = 0
            smoke_tp = smoke_fp = smoke_fn = 0

            for name, preds in all_preds.items():
                filtered = []
                for p in preds:
                    if p.cls_id == 0 and p.conf >= fire_thr:
                        filtered.append(p)
                    elif p.cls_id == 1 and p.conf >= smoke_thr:
                        filtered.append(p)

                gts = all_gts[name]

                tp, fp, fn = match_boxes(filtered, gts, cls_id=0, iou_thr=0.5)
                fire_tp += tp
                fire_fp += fp
                fire_fn += fn

                tp, fp, fn = match_boxes(filtered, gts, cls_id=1, iou_thr=0.5)
                smoke_tp += tp
                smoke_fp += fp
                smoke_fn += fn

            fire_m = metric_from_counts(fire_tp, fire_fp, fire_fn)
            smoke_m = metric_from_counts(smoke_tp, smoke_fp, smoke_fn)

            # Prefer fire recall slightly more because missed fire is high risk.
            score = (0.65 * fire_m["f2"]) + (0.35 * smoke_m["f2"])
            if score > best_score:
                best_score = score
                best = {
                    "fire_threshold": fire_thr,
                    "smoke_threshold": smoke_thr,
                    "model": str(model_path),
                    "split": args.split,
                    "fire": {
                        "tp": fire_tp,
                        "fp": fire_fp,
                        "fn": fire_fn,
                        **fire_m,
                    },
                    "smoke": {
                        "tp": smoke_tp,
                        "fp": smoke_fp,
                        "fn": smoke_fn,
                        **smoke_m,
                    },
                    "weighted_f2": score,
                }

    out_path = root / "thresholds_optimized.json"
    out_path.write_text(json.dumps(best, indent=2), encoding="utf-8")

    print("\nBest thresholds found:")
    print(json.dumps(best, indent=2))
    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
