from __future__ import annotations

import argparse
import gc
import json
import os
import shutil
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import yaml
from sklearn.model_selection import KFold, StratifiedKFold
from ultralytics import YOLO


CLASS_NAMES = {0: "fire", 1: "smoke"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


@dataclass
class SampleInfo:
    image_path: Path
    label_path: Path
    clean_lines: list[str]
    has_fire: bool
    has_smoke: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="YOLO11 K-Fold training for fire/smoke on GPU")
    parser.add_argument("--model", type=str, default="yolo11n.pt", help="Base YOLO11 weights")
    parser.add_argument("--folds", type=int, default=5, help="Number of K-Folds")
    parser.add_argument("--epochs", type=int, default=350, help="Epochs per fold")
    parser.add_argument("--imgsz", type=int, default=640, help="Training image size")
    parser.add_argument(
        "--batch",
        type=float,
        default=0.90,
        help="Batch setting: integer batch, -1 for auto (60%% VRAM), or 0<x<=1 for VRAM fraction",
    )
    parser.add_argument("--lr0", type=float, default=0.005, help="Initial learning rate")
    parser.add_argument("--patience", type=int, default=120, help="Early stopping patience (0 disables)")
    parser.add_argument(
        "--optimizer",
        type=str,
        default="SGD",
        choices=["auto", "SGD", "Adam", "AdamW", "RMSProp"],
        help="Optimizer for training. Use non-auto to ensure lr0 is respected.",
    )
    parser.add_argument("--close-mosaic", type=int, default=15, help="Disable mosaic augmentation in last N epochs")
    parser.add_argument("--workers", type=int, default=2, help="Dataloader workers")
    parser.add_argument("--cache", type=str, default="none", choices=["disk", "ram", "none"], help="Dataset cache mode")
    parser.add_argument(
        "--profile",
        type=str,
        default="full",
        choices=["full", "fast2h", "vram16h"],
        help="Training profile: full=kfold, fast2h=single fast run, vram16h=high-VRAM setup for long training",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument(
        "--source-train-split",
        type=str,
        default="train",
        choices=["train", "train_val", "train_valid"],
        help="Use only train split or merge train+val before K-Fold",
    )
    parser.add_argument(
        "--fold-init",
        type=str,
        default="base",
        choices=["base", "carry"],
        help="base: each fold starts from --model (recommended), carry: next fold starts from previous fold best.pt",
    )
    return parser.parse_args()


def apply_profile(args: argparse.Namespace) -> argparse.Namespace:
    if args.profile == "vram16h":
        # High-VRAM profile for ~16-hour budgets on 24GB-class GPUs.
        args.folds = max(args.folds, 5)
        args.epochs = min(max(args.epochs, 260), 400)
        args.patience = min(max(args.patience, 100), 180)
        args.optimizer = "SGD"
        args.close_mosaic = max(args.close_mosaic, 20)
        if args.batch == 0.90:
            args.batch = 0.95
        args.workers = max(args.workers, 4)
        if args.cache == "none":
            args.cache = "disk"
        args.source_train_split = "train"
        args.fold_init = "base"
        return args

    if args.profile != "fast2h":
        return args

    # Fast profile for strong GPUs (e.g., RTX 5090): one run, high throughput, early stop.
    args.folds = 1
    args.model = "yolo11s.pt" if args.model == "yolo11n.pt" else args.model
    args.epochs = min(args.epochs, 120)
    args.patience = min(args.patience, 20)
    args.optimizer = "SGD"
    # Prefer VRAM-heavy loading while keeping host RAM usage modest.
    if args.batch == 0.90:
        args.batch = 0.92
    args.workers = min(max(int(args.workers), 2), 4)
    args.cache = "none"
    args.source_train_split = "train"
    args.fold_init = "base"
    return args


def select_device() -> int:
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for this YOLO11 workflow.")
    torch.cuda.set_device(0)
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    gpu_name = torch.cuda.get_device_name(0)
    vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    print(f"GPU detected: {gpu_name} | VRAM: {vram_gb:.1f} GB | device=0")
    return 0


def has_label(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def _resolve_dataset_dirs(root: Path, split_name: str) -> tuple[Path, Path]:
    split_candidates = [split_name]
    if split_name == "val":
        split_candidates.append("valid")

    for split in split_candidates:
        # Preferred layout in this repo: dataset/images/<split> and dataset/labels/<split>
        images_a = root / "dataset" / "images" / split
        labels_a = root / "dataset" / "labels" / split
        if images_a.exists() and labels_a.exists():
            return images_a, labels_a

        # Legacy fallback: dataset/<split>/images and dataset/<split>/labels
        images_b = root / "dataset" / split / "images"
        labels_b = root / "dataset" / split / "labels"
        if images_b.exists() and labels_b.exists():
            return images_b, labels_b

    # Preferred layout in this repo: dataset/images/<split> and dataset/labels/<split>
    raise FileNotFoundError(
        f"Cannot find dataset split '{split_name}' in known layouts under dataset/."
    )


def _sanitize_label_file(label_path: Path) -> tuple[list[str], bool, bool, int]:
    # Keep only valid YOLO rows for class 0/1 and normalized xywh in (0,1].
    if not label_path.exists() or label_path.stat().st_size == 0:
        return [], False, False, 0

    cleaned: list[str] = []
    invalid_rows = 0
    has_fire = False
    has_smoke = False

    for raw in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line:
            continue

        parts = line.split()
        if len(parts) != 5:
            invalid_rows += 1
            continue

        try:
            cls_id = int(parts[0])
            x, y, w, h = map(float, parts[1:])
        except ValueError:
            invalid_rows += 1
            continue

        if cls_id not in (0, 1):
            invalid_rows += 1
            continue
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0 and 0.0 < w <= 1.0 and 0.0 < h <= 1.0):
            invalid_rows += 1
            continue

        cleaned.append(f"{cls_id} {x:.6f} {y:.6f} {w:.6f} {h:.6f}")
        if cls_id == 0:
            has_fire = True
        else:
            has_smoke = True

    return cleaned, has_fire, has_smoke, invalid_rows


def collect_samples(root: Path, source_train_split: str) -> list[SampleInfo]:
    splits = ["train"]
    if source_train_split in {"train_val", "train_valid"}:
        splits.append("val")

    samples: list[SampleInfo] = []
    total_invalid_rows = 0

    for split in splits:
        images_dir, labels_dir = _resolve_dataset_dirs(root, split)
        for img in sorted(images_dir.iterdir()):
            if not img.is_file() or img.suffix.lower() not in IMAGE_EXTS:
                continue

            lbl = labels_dir / f"{img.stem}.txt"
            clean_lines, has_fire, has_smoke, invalid_rows = _sanitize_label_file(lbl)
            total_invalid_rows += invalid_rows
            samples.append(
                SampleInfo(
                    image_path=img,
                    label_path=lbl,
                    clean_lines=clean_lines,
                    has_fire=has_fire,
                    has_smoke=has_smoke,
                )
            )

    if not samples:
        raise RuntimeError("No training images found for fold training.")

    bg_count = sum(1 for s in samples if not s.has_fire and not s.has_smoke)
    fire_only = sum(1 for s in samples if s.has_fire and not s.has_smoke)
    smoke_only = sum(1 for s in samples if s.has_smoke and not s.has_fire)
    both = sum(1 for s in samples if s.has_fire and s.has_smoke)

    print(f"Collected {len(samples)} images for K-Fold (including negatives).")
    print(f"Class mix: background={bg_count} fire_only={fire_only} smoke_only={smoke_only} both={both}")
    if total_invalid_rows > 0:
        print(f"Sanitized labels: removed {total_invalid_rows} invalid label rows (bad class id or malformed bbox).")

    return samples


def build_folds(root: Path, samples: list[SampleInfo], n_splits: int, seed: int) -> Path:
    split_root = root / "split_folds"
    if split_root.exists():
        shutil.rmtree(split_root)
    split_root.mkdir(parents=True, exist_ok=True)

    pair_indices = list(range(len(samples)))
    strata = [
        (1 if s.has_fire else 0) + (2 if s.has_smoke else 0)
        for s in samples
    ]

    can_stratify = min(strata.count(0), strata.count(1), strata.count(2), strata.count(3)) >= n_splits
    if can_stratify:
        splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)
        split_iter = splitter.split(pair_indices, strata)
        print("Using StratifiedKFold on background/fire/smoke/both strata.")
    else:
        splitter = KFold(n_splits=n_splits, shuffle=True, random_state=seed)
        split_iter = splitter.split(pair_indices)
        print("Using KFold fallback (not enough samples per stratum for StratifiedKFold).")

    for fold, (train_idx, val_idx) in enumerate(split_iter, start=1):
        fold_dir = split_root / f"fold{fold}"
        for sub in ["train/images", "train/labels", "val/images", "val/labels"]:
            (fold_dir / sub).mkdir(parents=True, exist_ok=True)

        for idx in train_idx:
            s = samples[idx]
            out_img = fold_dir / "train" / "images" / s.image_path.name
            out_lbl = fold_dir / "train" / "labels" / f"{s.image_path.stem}.txt"
            shutil.copy2(s.image_path, out_img)
            out_lbl.write_text("\n".join(s.clean_lines), encoding="utf-8")

        for idx in val_idx:
            s = samples[idx]
            out_img = fold_dir / "val" / "images" / s.image_path.name
            out_lbl = fold_dir / "val" / "labels" / f"{s.image_path.stem}.txt"
            shutil.copy2(s.image_path, out_img)
            out_lbl.write_text("\n".join(s.clean_lines), encoding="utf-8")

        data_yaml = {
            "train": str((fold_dir / "train" / "images").resolve()),
            "val": str((fold_dir / "val" / "images").resolve()),
            "nc": 2,
            "names": ["fire", "smoke"],
        }
        with (fold_dir / "data.yaml").open("w", encoding="utf-8") as f:
            yaml.safe_dump(data_yaml, f, sort_keys=False)

    print(f"Built {n_splits} folds under: {split_root}")
    return split_root


def compute_f1(precision: float, recall: float) -> float:
    return (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0


def _cache_value(mode: str) -> Any:
    if mode == "none":
        return False
    if mode == "ram":
        return "ram"
    return "disk"


def _is_cuda_memory_error(exc: RuntimeError) -> bool:
    msg = str(exc).lower()
    memory_signals = [
        "out of memory",
        "cuda out of memory",
        "cudnn_status_internal_error_host_allocation_failed",
        "cudnn",
        "cuda error",
        "allocation failed",
    ]
    return any(signal in msg for signal in memory_signals)


def _train_with_fallback(model: YOLO, train_kwargs: dict[str, Any], run_label: str) -> None:
    # Start with requested settings, then progressively reduce memory pressure if CUDA training fails.
    batch_value = train_kwargs["batch"]
    if isinstance(batch_value, float) and 0 < batch_value <= 1:
        batch_attempt_2: Any = max(0.70, batch_value - 0.15)
        batch_attempt_3: Any = 0.60
    elif isinstance(batch_value, (int, float)) and batch_value > 0:
        batch_attempt_2 = max(2, int(batch_value / 2))
        batch_attempt_3 = 2
    else:
        batch_attempt_2 = 4
        batch_attempt_3 = 2

    attempts: list[dict[str, Any]] = [
        dict(train_kwargs),
        {
            **train_kwargs,
            "batch": batch_attempt_2,
            "workers": min(2, int(train_kwargs["workers"])),
            "cache": False,
        },
        {
            **train_kwargs,
            "batch": batch_attempt_3,
            "imgsz": min(512, int(train_kwargs["imgsz"])),
            "workers": 0,
            "cache": False,
        },
        {
            **train_kwargs,
            "batch": 1,
            "imgsz": min(448, int(train_kwargs["imgsz"])),
            "workers": 0,
            "cache": False,
            "amp": False,
        },
    ]

    last_exc: RuntimeError | None = None
    for idx, attempt in enumerate(attempts, start=1):
        print(
            f"{run_label} | train attempt {idx}/{len(attempts)} "
            f"(imgsz={attempt['imgsz']}, batch={attempt['batch']}, workers={attempt['workers']}, cache={attempt['cache']})"
        )
        try:
            model.train(**attempt)
            return
        except RuntimeError as exc:
            if not _is_cuda_memory_error(exc):
                raise
            last_exc = exc
            print(f"{run_label} | CUDA memory failure on attempt {idx}: {exc}")
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                if hasattr(torch.cuda, "ipc_collect"):
                    torch.cuda.ipc_collect()
            gc.collect()

    raise RuntimeError(f"{run_label} failed after memory-safe retries: {last_exc}")


def train_single(root: Path, args: argparse.Namespace, device: int) -> tuple[list[dict[str, Any]], Path, int]:
    run_tag = datetime.now().strftime("%Y%m%d_%H%M%S")
    project_dir = root / "runs" / "detect" / f"yolo11_single_{run_tag}"
    project_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 72)
    print(f"Training single run with {args.model} (GPU-only mode)")
    print("=" * 72)

    model = YOLO(args.model)
    train_kwargs = dict(
        data=str(root / "data.yaml"),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        lr0=args.lr0,
        optimizer=args.optimizer,
        patience=args.patience,
        close_mosaic=args.close_mosaic,
        workers=args.workers,
        cache=_cache_value(args.cache),
        project=str(project_dir),
        name="run1",
        device=device,
        amp=True,
        seed=args.seed,
        deterministic=True,
    )
    _train_with_fallback(model, train_kwargs, run_label="single")

    best_path = project_dir / "run1" / "weights" / "best.pt"
    if not best_path.exists():
        raise FileNotFoundError(f"best.pt not found for single run: {best_path}")

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    val_model = YOLO(str(best_path))
    metrics = val_model.val(data=str(root / "data.yaml"), split="val", verbose=False, device=device, imgsz=args.imgsz)

    precision = float(metrics.results_dict.get("metrics/precision(B)", 0.0))
    recall = float(metrics.results_dict.get("metrics/recall(B)", 0.0))
    map50 = float(metrics.results_dict.get("metrics/mAP50(B)", 0.0))
    map5095 = float(metrics.results_dict.get("metrics/mAP50-95(B)", 0.0))
    f1 = compute_f1(precision, recall)

    row = {
        "fold": 1,
        "weight": str(best_path),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "map50": map50,
        "map50_95": map5095,
    }
    print(
        f"Single run | P={precision:.4f} R={recall:.4f} "
        f"F1={f1:.4f} mAP50={map50:.4f} mAP50-95={map5095:.4f}"
    )
    return [row], best_path, 1


def train_folds(root: Path, args: argparse.Namespace, device: int, split_root: Path) -> tuple[list[dict[str, Any]], Path, int]:
    run_tag = datetime.now().strftime("%Y%m%d_%H%M%S")
    project_dir = root / "runs" / "detect" / f"yolo11_kfold_{run_tag}"
    project_dir.mkdir(parents=True, exist_ok=True)

    fold_results: list[dict[str, Any]] = []
    next_model_weight = args.model
    best_fold = 1
    best_f1 = -1.0
    best_weight_path = None

    for fold in range(1, args.folds + 1):
        fold_yaml = split_root / f"fold{fold}" / "data.yaml"
        run_name = f"fold{fold}"

        print("\n" + "=" * 72)
        fold_weight = next_model_weight if args.fold_init == "carry" else args.model
        print(f"Training Fold {fold}/{args.folds} with {fold_weight}")
        print("=" * 72)

        model = YOLO(fold_weight)
        train_kwargs = dict(
            data=str(fold_yaml),
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            lr0=args.lr0,
            optimizer=args.optimizer,
            patience=args.patience,
            close_mosaic=args.close_mosaic,
            workers=args.workers,
            cache=_cache_value(args.cache),
            project=str(project_dir),
            name=run_name,
            device=device,
            amp=True,
            seed=args.seed,
            deterministic=True,
        )
        _train_with_fallback(model, train_kwargs, run_label=f"fold{fold}")

        best_path = project_dir / run_name / "weights" / "best.pt"
        if not best_path.exists():
            raise FileNotFoundError(f"best.pt not found for fold {fold}: {best_path}")

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        val_model = YOLO(str(best_path))
        metrics = val_model.val(data=str(fold_yaml), verbose=False, device=device, imgsz=args.imgsz)

        precision = float(metrics.results_dict.get("metrics/precision(B)", 0.0))
        recall = float(metrics.results_dict.get("metrics/recall(B)", 0.0))
        map50 = float(metrics.results_dict.get("metrics/mAP50(B)", 0.0))
        map5095 = float(metrics.results_dict.get("metrics/mAP50-95(B)", 0.0))
        f1 = compute_f1(precision, recall)

        row = {
            "fold": fold,
            "weight": str(best_path),
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "map50": map50,
            "map50_95": map5095,
        }
        fold_results.append(row)

        print(
            f"Fold {fold} | P={precision:.4f} R={recall:.4f} "
            f"F1={f1:.4f} mAP50={map50:.4f} mAP50-95={map5095:.4f}"
        )

        if f1 > best_f1:
            best_f1 = f1
            best_fold = fold
            best_weight_path = best_path

        # Optional legacy behavior for continuity training across folds.
        next_model_weight = str(best_path)

    if best_weight_path is None:
        raise RuntimeError("No fold produced a valid best.pt")

    return fold_results, best_weight_path, best_fold


def evaluate_test(root: Path, model_path: Path, device: int, imgsz: int) -> dict[str, float]:
    data_yaml = root / "data.yaml"
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    model = YOLO(str(model_path))
    metrics = model.val(data=str(data_yaml), split="test", verbose=False, device=device, imgsz=imgsz)

    precision = float(metrics.results_dict.get("metrics/precision(B)", 0.0))
    recall = float(metrics.results_dict.get("metrics/recall(B)", 0.0))
    map50 = float(metrics.results_dict.get("metrics/mAP50(B)", 0.0))
    map5095 = float(metrics.results_dict.get("metrics/mAP50-95(B)", 0.0))
    f1 = compute_f1(precision, recall)

    result = {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "map50": map50,
        "map50_95": map5095,
    }
    print("\nTest metrics with selected best fold model")
    print(
        f"P={precision:.4f} R={recall:.4f} F1={f1:.4f} "
        f"mAP50={map50:.4f} mAP50-95={map5095:.4f}"
    )
    return result


def save_outputs(root: Path, fold_results: list[dict[str, Any]], best_model: Path, best_fold: int, test_metrics: dict[str, float], imgsz: int) -> None:
    summary = {
        "best_fold": best_fold,
        "best_model": str(best_model),
        "folds": fold_results,
        "test": test_metrics,
    }
    summary_path = root / "kfold_results_yolo11.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    deploy = {
        "model_path": str(best_model),
        "class_names": CLASS_NAMES,
        "inference": {
            "imgsz": int(max(640, imgsz)),
            "iou": 0.55,
            "max_det": 100,
            "min_box_area_ratio": 0.00025,
        },
        "thresholds": {
            "fire": 0.22,
            "smoke": 0.30,
        },
        "temporal_alert": {
            "window_size": 8,
            "min_positive_frames": 3,
        },
    }
    deploy_path = root / "deployment_profile.json"
    deploy_path.write_text(json.dumps(deploy, indent=2), encoding="utf-8")

    print(f"\nSaved fold summary: {summary_path}")
    print(f"Saved deployment profile: {deploy_path}")


def main() -> None:
    args = apply_profile(parse_args())
    root = Path(__file__).resolve().parent

    print("=" * 72)
    print("YOLO11 Fire/Smoke K-Fold Training (GPU)")
    print("=" * 72)
    print(
        f"Profile={args.profile} | model={args.model} | folds={args.folds} | epochs={args.epochs} "
        f"| batch={args.batch} | workers={args.workers} | cache={args.cache} | fold_init={args.fold_init} "
        f"| optimizer={args.optimizer} | close_mosaic={args.close_mosaic}"
    )
    if args.profile == "vram16h":
        print("High-VRAM long-run mode enabled: designed for 24GB GPU with ~16-hour training budget.")

    if args.folds > 1 and args.fold_init == "carry":
        print("Warning: fold_init=carry leaks information across folds and invalidates strict cross-validation.")

    device = select_device()

    if args.profile == "full" and args.folds > 1:
        print("Note: full k-fold training is usually much longer than 2 hours.")

    if args.folds <= 1:
        fold_results, best_model, best_fold = train_single(root, args, device)
    else:
        samples = collect_samples(root, args.source_train_split)
        split_root = build_folds(root, samples, n_splits=args.folds, seed=args.seed)
        fold_results, best_model, best_fold = train_folds(root, args, device, split_root)

    test_metrics = evaluate_test(root, best_model, device=device, imgsz=args.imgsz)
    save_outputs(root, fold_results, best_model, best_fold, test_metrics, imgsz=args.imgsz)

    print("\nDone.")
    print(f"Use this model for live video: {best_model}")


if __name__ == "__main__":
    main()