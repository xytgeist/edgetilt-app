#!/usr/bin/env python3
"""
Fetch scarekrow/ufc-data via Kaggle's kagglehub library and stage for backtest.

Auth (pick one):
  export KAGGLE_API_TOKEN=...     # kaggle.com/settings/api → Generate New Token
  ~/.kaggle/access_token          # same token in a file
  ~/.kaggle/kaggle.json           # legacy username/key
  kaggle auth login               # stable CLI browser login (shares credentials)

Usage:
  python scripts/fetch-ufc-kaggle-data.py
  python scripts/fetch-ufc-kaggle-data.py --force
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

KAGGLE_DATASET = "scarekrow/ufc-data"
PREFERRED_NAMES = (
    "UFC_full_data_silver_v2.csv",
    "ufc_full_data_silver_v2.csv",
)
OUT_DIR = Path("data/ufc")
OUT_FILE = OUT_DIR / "UFC_full_data_silver_v2.csv"


def find_csv(root: Path) -> Path | None:
    for name in PREFERRED_NAMES:
        hit = root / name
        if hit.is_file():
            return hit

    for p in root.rglob("*.csv"):
        lower = p.name.lower()
        if "silver" in lower and "v2" in lower:
            return p

    csvs = [p for p in root.rglob("*.csv") if p.is_file()]
    if not csvs:
        return None
    if len(csvs) == 1:
        return csvs[0]
    return max(csvs, key=lambda p: p.stat().st_size)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download scarekrow/ufc-data via kagglehub")
    parser.add_argument("--force", action="store_true", help="Re-download even if staged CSV exists")
    args = parser.parse_args()

    if OUT_FILE.is_file() and not args.force:
        size_mb = OUT_FILE.stat().st_size / (1024 * 1024)
        print(f"Already staged: {OUT_FILE} ({size_mb:.1f} MB)")
        print("Use --force to re-download from Kaggle.")
        return 0

    try:
        import kagglehub
    except ImportError:
        print("Missing kagglehub. Install with:", file=sys.stderr)
        print("  pip install kagglehub", file=sys.stderr)
        return 1

    print(f"Downloading {KAGGLE_DATASET} via kagglehub...")
    try:
        cache_path = Path(kagglehub.dataset_download(KAGGLE_DATASET))
    except Exception as err:
        print(f"Kaggle download failed: {err}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Set up API access at https://www.kaggle.com/settings/api", file=sys.stderr)
        print("  export KAGGLE_API_TOKEN=your_token", file=sys.stderr)
        print("  or: kaggle auth login", file=sys.stderr)
        return 1

    print(f"Kaggle cache: {cache_path}")

    csv_src = find_csv(cache_path)
    if not csv_src:
        print(f"No CSV found under {cache_path}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(csv_src, OUT_FILE)
    size_mb = OUT_FILE.stat().st_size / (1024 * 1024)
    print(f"Staged for backtest: {OUT_FILE} ({size_mb:.1f} MB, source: {csv_src.name})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
