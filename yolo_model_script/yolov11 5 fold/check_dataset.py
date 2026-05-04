from __future__ import annotations

import argparse
from pathlib import Path

import yaml


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check YOLO dataset image/label consistency")
    parser.add_argument("--data", type=str, default="data.yaml", help="Path to dataset YAML")
    parser.add_argument("--check-folds", action="store_true", help="Also validate split_folds/fold*/data.yaml if present")
    return parser.parse_args()


def parse_label_errors(label_path: Path, max_class_id: int) -> list[str]:
    errors: list[str] = []
    if not label_path.exists() or label_path.stat().st_size == 0:
        return errors

    for line_idx, raw in enumerate(label_path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 5:
            errors.append(f"{label_path.name}: line {line_idx} has {len(parts)} columns (expected 5)")
            continue

        try:
            cls_id = int(parts[0])
            x, y, w, h = map(float, parts[1:])
        except ValueError:
            errors.append(f"{label_path.name}: line {line_idx} has non-numeric values")
            continue

        if cls_id < 0 or cls_id > max_class_id:
            errors.append(f"{label_path.name}: line {line_idx} class {cls_id} outside [0, {max_class_id}]")

        if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1):
            errors.append(f"{label_path.name}: line {line_idx} has invalid normalized xywh")

    return errors


def resolve_images_labels(root: Path, entry: str) -> tuple[Path, Path]:
    images_dir = Path(entry)
    if not images_dir.is_absolute():
        images_dir = (root / images_dir).resolve()

    if images_dir.name != "images":
        raise RuntimeError(f"Expected split path ending in 'images': {images_dir}")

    labels_dir = images_dir.parent / "labels"
    return images_dir, labels_dir


def validate_split(name: str, images_dir: Path, labels_dir: Path, max_class_id: int) -> tuple[bool, dict]:
    report = {
        "split": name,
        "images": 0,
        "labels": 0,
        "missing_labels": 0,
        "orphan_labels": 0,
        "empty_labels": 0,
        "bad_lines": 0,
    }

    if not images_dir.exists() or not labels_dir.exists():
        print(f"[ERROR] Split '{name}' missing directories: {images_dir} | {labels_dir}")
        return False, report

    images = sorted([p for p in images_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])
    labels = sorted(labels_dir.glob("*.txt"))

    report["images"] = len(images)
    report["labels"] = len(labels)

    image_stems = {p.stem for p in images}
    label_stems = {p.stem for p in labels}

    missing = image_stems - label_stems
    orphan = label_stems - image_stems

    report["missing_labels"] = len(missing)
    report["orphan_labels"] = len(orphan)

    all_errors: list[str] = []
    for lbl in labels:
        if lbl.stat().st_size == 0:
            report["empty_labels"] += 1
        errs = parse_label_errors(lbl, max_class_id=max_class_id)
        all_errors.extend(errs)

    report["bad_lines"] = len(all_errors)

    print(f"\nSplit: {name}")
    print(f"  images={report['images']} labels={report['labels']}")
    print(f"  missing_labels={report['missing_labels']} orphan_labels={report['orphan_labels']}")
    print(f"  empty_labels={report['empty_labels']} bad_lines={report['bad_lines']}")

    for msg in all_errors[:10]:
        print(f"  [BAD] {msg}")
    if len(all_errors) > 10:
        print(f"  ... and {len(all_errors) - 10} more label issues")

    ok = report["images"] > 0 and report["missing_labels"] == 0 and report["orphan_labels"] == 0 and report["bad_lines"] == 0
    print("  status=OK" if ok else "  status=FAIL")
    return ok, report


def validate_data_yaml(data_yaml: Path) -> bool:
    root = data_yaml.parent
    cfg = yaml.safe_load(data_yaml.read_text(encoding="utf-8")) or {}

    names = cfg.get("names", {})
    if isinstance(names, list):
        max_class_id = len(names) - 1
    elif isinstance(names, dict):
        numeric_keys = [int(k) for k in names.keys()]
        max_class_id = max(numeric_keys) if numeric_keys else 1
    else:
        max_class_id = 1

    print(f"\nChecking YAML: {data_yaml}")
    ok_all = True
    for split_key in ["train", "val", "test"]:
        entry = cfg.get(split_key)
        if not entry:
            print(f"Split '{split_key}' not set in YAML, skipping.")
            continue
        images_dir, labels_dir = resolve_images_labels(root, str(entry))
        ok, _ = validate_split(split_key, images_dir, labels_dir, max_class_id=max_class_id)
        ok_all = ok_all and ok

    return ok_all


def main() -> None:
    args = parse_args()
    data_yaml = Path(args.data)
    if not data_yaml.exists():
        raise FileNotFoundError(f"data.yaml not found: {data_yaml}")

    overall_ok = validate_data_yaml(data_yaml)

    if args.check_folds:
        split_root = data_yaml.parent / "split_folds"
        fold_yamls = sorted(split_root.glob("fold*/data.yaml"))
        if not fold_yamls:
            print("\nNo fold YAML files found under split_folds.")
        for fy in fold_yamls:
            overall_ok = validate_data_yaml(fy) and overall_ok

    print("\nFinal dataset check: PASS" if overall_ok else "\nFinal dataset check: FAIL")
    if not overall_ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()