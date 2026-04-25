"""
Mosaic Image Generator
----------------------
Arranges PNG images in a 15x15 grid mosaic.
You have 226 images but need 225 tiles (15x15).
Since 226 > 225, the script uses a random subset of 225 from your images.

Usage:
    python create_mosaic.py --input_dir ./your_images --output mosaic.png

Optional flags:
    --tile_size    Pixel size of each tile (default: 64)
    --input_dir    Folder containing your PNG files
    --output       Output file path (default: mosaic.png)
    --seed         Random seed for reproducibility (default: 42)
    --key          Path to CSV file with a 'keys' column to define tile order
"""

import csv
import os
import sys
import random
import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not found. Installing...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image


def collect_images(input_dir: str) -> list[Path]:
    """Collect all PNG files from the input directory."""
    folder = Path(input_dir)
    if not folder.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")

    images = sorted(folder.glob("*.png"))
    if not images:
        raise ValueError(f"No PNG files found in: {input_dir}")

    print(f"Found {len(images)} PNG file(s).")
    return images


def build_tile_list(images: list[Path], grid_cols: int, grid_rows: int, seed: int) -> list[Path]:
    """
    Build the full list of tile paths for the mosaic.

    - 15x15 = 225 tiles, but we have 226 images.
    - If we have more images than tiles, randomly sample without replacement.
    - If we have fewer images than tiles, fill remaining slots from 24 random fillers.
    - Shuffle everything so any repeated images are spread out.
    """
    total_tiles = grid_cols * grid_rows          # 225
    n_images    = len(images)                     # 226

    random.seed(seed)

    if n_images >= total_tiles:
        # More images than tiles: pick a random subset (no repeats needed)
        tile_list = random.sample(images, total_tiles)
    else:
        # Fewer images than tiles: fill extras from 24 random fillers
        n_extra = total_tiles - n_images
        fillers   = random.choices(images, k=24)
        extra     = random.choices(fillers, k=n_extra)
        tile_list = list(images) + extra
        random.shuffle(tile_list)

    return tile_list


def build_tile_list_from_csv(csv_path: str, input_dir: str, grid_cols: int, grid_rows: int) -> list[Path]:
    """
    Build tile list by following the order defined in a CSV file.

    The CSV must have a 'keys' column with stem names (no extension).
    Each entry maps to <input_dir>/<key>.png.
    - If the CSV has more entries than tiles, only the first (grid_cols * grid_rows) are used.
    - If fewer, an error is raised.
    - Missing files are reported and skipped (tile slot left transparent).
    """
    folder     = Path(input_dir)
    total_tiles = grid_cols * grid_rows

    keys = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if "keys" not in reader.fieldnames:
            raise ValueError(f"CSV must have a 'keys' column. Found columns: {reader.fieldnames}")
        for row in reader:
            key = row["keys"].strip()
            if key:
                keys.append(key)

    print(f"  CSV keys loaded : {len(keys)}")

    if len(keys) < total_tiles:
        raise ValueError(
            f"CSV has only {len(keys)} entries but the grid needs {total_tiles} tiles. "
            "Please provide enough keys or reduce the grid size."
        )

    # Use only as many keys as needed
    keys = keys[:total_tiles]

    tile_list = []
    missing   = []
    for key in keys:
        path = folder / f"{key}.png"
        if path.exists():
            tile_list.append(path)
        else:
            missing.append(key)
            tile_list.append(None)   # placeholder — tile stays transparent

    if missing:
        print(f"  [WARNING] {len(missing)} key(s) not found as PNG files:")
        for m in missing[:10]:
            print(f"    - {m}.png")
        if len(missing) > 10:
            print(f"    ... and {len(missing) - 10} more.")

    return tile_list


def load_and_resize(path: Path, tile_size: int) -> Image.Image:
    """Open an image and resize it to tile_size × tile_size (LANCZOS for quality)."""
    img = Image.open(path).convert("RGBA")
    return img.resize((tile_size, tile_size), Image.LANCZOS)


def create_mosaic(
    input_dir: str,
    output_path: str = "mosaic.png",
    tile_size: int = 64,
    grid_cols: int = 15,
    grid_rows: int = 15,
    seed: int = 42,
    key_csv: str = None,
) -> None:
    print(f"\n{'='*50}")
    print(f"  Mosaic settings")
    print(f"  Grid       : {grid_cols} × {grid_rows} = {grid_cols*grid_rows} tiles")
    print(f"  Tile size  : {tile_size}px")
    print(f"  Canvas     : {grid_cols*tile_size} × {grid_rows*tile_size} px")
    print(f"  Output     : {output_path}")
    if key_csv:
        print(f"  Order mode : CSV key file ({key_csv})")
    else:
        print(f"  Order mode : Random (seed={seed})")
    print(f"{'='*50}\n")

    images = collect_images(input_dir)

    if key_csv:
        tile_list = build_tile_list_from_csv(key_csv, input_dir, grid_cols, grid_rows)
    else:
        tile_list = build_tile_list(images, grid_cols, grid_rows, seed)

    canvas_w = grid_cols * tile_size
    canvas_h = grid_rows * tile_size
    canvas   = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    total = len(tile_list)
    for idx, path in enumerate(tile_list):
        col = idx % grid_cols
        row = idx // grid_cols
        x   = col * tile_size
        y   = row * tile_size

        try:
            if path is None:
                pass  # leave tile transparent
            else:
                tile = load_and_resize(path, tile_size)
                canvas.paste(tile, (x, y), tile)  # use alpha mask for proper transparency
        except Exception as e:
            print(f"  [WARNING] Skipping {path.name}: {e}")

        # Progress bar
        if (idx + 1) % 100 == 0 or (idx + 1) == total:
            pct  = (idx + 1) / total * 100
            done = int(pct / 2)
            bar  = "█" * done + "░" * (50 - done)
            print(f"\r  [{bar}] {idx+1}/{total} ({pct:.1f}%)", end="", flush=True)

    print("\n\nSaving mosaic...")
    # Save as RGBA to preserve transparency from the original images
    canvas.save(output_path, "PNG", optimize=True)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Done! Saved to '{output_path}' ({size_mb:.1f} MB)\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a 15×15 mosaic from PNG images.")
    parser.add_argument(
        "--input_dir",
        type=str,
        default=".",
        help="Directory containing your PNG images (default: current directory)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="mosaic.png",
        help="Output file path (default: mosaic.png)",
    )
    parser.add_argument(
        "--tile_size",
        type=int,
        default=64,
        help="Pixel size for each tile square (default: 64)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    parser.add_argument(
        "--key",
        type=str,
        default=None,
        help="Path to a CSV file with a 'keys' column. If set, tiles are placed in CSV order instead of randomly.",
    )
    args = parser.parse_args()

    create_mosaic(
        input_dir  = args.input_dir,
        output_path= args.output,
        tile_size  = args.tile_size,
        seed       = args.seed,
        key_csv    = args.key,
    )