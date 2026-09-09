#!/usr/bin/env python3
"""
Renders the two Earth textures the galaxy scene uses.

The site's journey ends at Earth, close enough to pick out North America, so
this one planet cannot be procedural noise the way the others are — a made-up
coastline is recognisable as made up immediately. Both maps are built from real
data:

  * land from Natural Earth 1:10m, via the `world-atlas` TopoJSON;
  * city lights from GeoNames, via `all-the-cities` — 135,000 places with
    populations, of which everything above five thousand people is drawn.

The night map is the one that matters. It is the shot the page ends on, and
what makes the real thing beautiful is not that cities are bright, it is that
their brightness spans four orders of magnitude and clusters into megaregions:
the American northeast, the Texas triangle, the Nile, the Ganges, the Chinese
seaboard. Splatting each city with a radius and brightness that follow the
logarithm of its population, and then adding a heavily blurred copy of the same
field underneath, reproduces that structure because it is that structure.

Usage: python3 scripts/render-earth.py --geo DIR --out public/sky
  DIR must contain land-10m.json (world-atlas) and cities.json
  ([lon, lat, population] triples).
"""

from __future__ import annotations

import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


# ---------------------------------------------------------------------------
# TopoJSON
# ---------------------------------------------------------------------------


def decode_arcs(topo: dict) -> list[list[tuple[float, float]]]:
    """
    Undoes TopoJSON's quantisation and delta encoding.

    Coordinates are stored as integer deltas from the previous point, against a
    scale and translate that map them back to degrees. It is a compact format
    and the decoding is four lines; pulling in a library for it would be more
    dependency than arithmetic.
    """
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]

    out = []
    for arc in topo["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append((x * sx + tx, y * sy + ty))
        out.append(points)
    return out


def ring_points(arcs: list, indices: list[int]) -> list[tuple[float, float]]:
    """Stitches a ring together from its arc indices; a negative index is reversed."""
    pts: list[tuple[float, float]] = []
    for i in indices:
        arc = arcs[~i][::-1] if i < 0 else arcs[i]
        # The join point is shared between consecutive arcs.
        pts.extend(arc[1:] if pts else arc)
    return pts


def polygons(topo: dict, key: str) -> list[list[list[tuple[float, float]]]]:
    """Every polygon in an object, as a list of rings (exterior first)."""
    arcs = decode_arcs(topo)
    obj = topo["objects"][key]
    geoms = obj["geometries"] if obj["type"] == "GeometryCollection" else [obj]

    out = []
    for g in geoms:
        if g["type"] == "Polygon":
            out.append([ring_points(arcs, r) for r in g["arcs"]])
        elif g["type"] == "MultiPolygon":
            for poly in g["arcs"]:
                out.append([ring_points(arcs, r) for r in poly])
    return out


# ---------------------------------------------------------------------------
# Projection helpers
# ---------------------------------------------------------------------------


def unwrap(points):
    """
    Removes the jumps a ring makes when it crosses the antimeridian.

    Chukotka, Antarctica, Fiji and a scattering of islands all straddle 180
    degrees, and in the raw data their longitudes flip from +179 to -179
    mid-ring. Drawn as-is, the polygon fill treats that flip as a real edge and
    smears the shape right across the map — which is exactly what the first
    render did, as three bright horizontal streaks over the Arctic, the equator
    and the Southern Ocean.

    Walking the ring and adding a full turn whenever a step exceeds half of one
    makes longitude continuous again, at the cost of running outside the -180
    to 180 range, which is what the three-fold draw below is for.
    """
    out = []
    shift = 0.0
    prev = None
    for lon, lat in points:
        if prev is not None:
            d = lon + shift - prev
            if d > 180.0:
                shift -= 360.0
            elif d < -180.0:
                shift += 360.0
        prev = lon + shift
        out.append((prev, lat))
    return out


def to_pixels(points, w: int, h: int, offset: float = 0.0):
    """Equirectangular: longitude straight to x, latitude straight to y."""
    return [
        ((lon + offset + 180.0) / 360.0 * w, (90.0 - lat) / 180.0 * h)
        for lon, lat in points
    ]


def land_mask(polys, w: int, h: int) -> np.ndarray:
    """
    A 1-where-land raster.

    Exterior rings are filled and interior rings are cut back out, which is what
    puts the Caspian and the Great Lakes back in the ocean rather than leaving
    them as land.

    Every ring is drawn three times, a full turn to either side, so a shape that
    unwrapping pushed past the edge still covers the part of the map it belongs
    on. Rings that sit comfortably inside simply draw twice off-canvas, which
    costs nothing.
    """
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for rings in polys:
        for offset in (-360.0, 0.0, 360.0):
            d.polygon(to_pixels(unwrap(rings[0]), w, h, offset), fill=255)
            for hole in rings[1:]:
                d.polygon(to_pixels(unwrap(hole), w, h, offset), fill=0)
    return np.asarray(img, dtype=np.float32) / 255.0


def fbm(h: int, w: int, beta: float, seed: int) -> np.ndarray:
    """Periodic power-law noise, as used for the galaxy. Tileable in longitude."""
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    k = np.hypot(kx, ky)
    k[0, 0] = 1.0
    amp = k ** (-beta / 2.0)
    amp[0, 0] = 0.0
    rng = np.random.default_rng(seed)
    f = np.fft.irfft2(np.fft.rfft2(rng.standard_normal((h, w))) * amp[:, : w // 2 + 1], s=(h, w))
    return (f / f.std()).astype(np.float32)


def blur(a: np.ndarray, radius: float) -> np.ndarray:
    """Gaussian blur through PIL, which is far quicker than convolving in numpy."""
    lo, hi = float(a.min()), float(a.max())
    if hi - lo < 1e-9:
        return a.copy()
    img = Image.fromarray(((a - lo) / (hi - lo) * 255).astype(np.uint8))
    out = np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0
    return out * (hi - lo) + lo


# ---------------------------------------------------------------------------
# Daylight surface
# ---------------------------------------------------------------------------


# Rough boxes for the great deserts, in (lon0, lon1, lat0, lat1). Biome by
# latitude alone puts rainforest in the Sahara; these pull the dry belts back to
# where they are. Soft-edged, so nothing lands on a rectangle.
DESERTS = [
    (-17, 50, 15, 31),    # Sahara and Arabia
    (44, 63, 12, 32),     # Arabian interior
    (60, 78, 20, 32),     # Thar
    (75, 115, 35, 48),    # Gobi and Taklamakan
    (112, 142, -32, -19), # Australian interior
    (-72, -66, -30, -16), # Atacama
    (14, 25, -28, -17),   # Namib and Kalahari
    (-118, -100, 26, 40), # American southwest
]


def surface_map(mask: np.ndarray, w: int, h: int) -> np.ndarray:
    lat = 90.0 - (np.arange(h, dtype=np.float32) + 0.5) / h * 180.0
    lon = (np.arange(w, dtype=np.float32) + 0.5) / w * 360.0 - 180.0
    LAT = lat[:, None]
    LON = lon[None, :]

    detail = fbm(h, w, 2.5, 4242)
    coarse = fbm(h, w, 3.4, 991)

    # --- ocean ---
    # Shelves are shallow near land and the water darkens away from it, which is
    # the single cue that makes an ocean read as an ocean rather than as a flat
    # blue field.
    shelf = blur(mask, w / 340.0)
    deep = np.array([0.012, 0.036, 0.088], dtype=np.float32)
    shallow = np.array([0.055, 0.150, 0.230], dtype=np.float32)
    ocean = deep[None, None, :] + (shallow - deep)[None, None, :] * np.clip(shelf * 2.4, 0, 1)[..., None]
    ocean *= (1.0 + 0.18 * coarse)[..., None]

    # --- land ---
    tropical = np.array([0.055, 0.135, 0.045], dtype=np.float32)
    temperate = np.array([0.135, 0.165, 0.075], dtype=np.float32)
    taiga = np.array([0.090, 0.115, 0.080], dtype=np.float32)
    tundra = np.array([0.240, 0.235, 0.205], dtype=np.float32)
    desert = np.array([0.430, 0.340, 0.205], dtype=np.float32)

    a = np.abs(LAT)
    land = np.empty((h, w, 3), dtype=np.float32)
    t1 = np.clip((a - 8) / 22.0, 0, 1)[..., None]
    t2 = np.clip((a - 34) / 22.0, 0, 1)[..., None]
    t3 = np.clip((a - 56) / 14.0, 0, 1)[..., None]
    land = tropical + (temperate - tropical) * t1
    land = land + (taiga - land) * t2
    land = land + (tundra - land) * t3

    dry = np.zeros((h, w), dtype=np.float32)
    for lo0, lo1, la0, la1 in DESERTS:
        fx = np.clip(np.minimum(LON - lo0, lo1 - LON) / 7.0, 0, 1)
        fy = np.clip(np.minimum(LAT - la0, la1 - LAT) / 5.0, 0, 1)
        dry = np.maximum(dry, fx * fy)
    dry = np.clip(dry * (0.62 + 0.55 * detail), 0, 1)
    land = land + (desert - land) * dry[..., None]

    # Ice. Real ice is where it is cold and high, so this follows latitude and
    # is pushed further north over Greenland and further out over Antarctica.
    ice = np.clip((a - 62) / 12.0, 0, 1)
    ice = np.clip(ice + np.clip((-LAT - 60) / 6.0, 0, 1), 0, 1)
    ice = np.clip(ice * (0.86 + 0.26 * coarse), 0, 1)
    land = land + (np.array([0.86, 0.90, 0.95], dtype=np.float32) - land) * ice[..., None]

    # Relief, so nothing is a flat wash of one colour.
    # Clamped from below. Unclamped, the noise could take a patch of tundra to
    # a fifth of its brightness and the poles came out mottled with black.
    relief = np.clip(1.0 + 0.30 * detail + 0.16 * coarse, 0.62, 1.45)
    land *= relief[..., None]

    m = mask[..., None]
    rgb = ocean * (1 - m) + land * m

    # Sea ice at the poles, over water as well as land.
    polar = np.clip((a - 70) / 10.0, 0, 1) * np.clip(0.72 + 0.30 * coarse, 0, 1)
    rgb = rgb + (np.array([0.80, 0.86, 0.93], dtype=np.float32) - rgb) * np.clip(polar, 0, 1)[..., None]

    return np.clip(rgb, 0, 1)


# ---------------------------------------------------------------------------
# Night lights
# ---------------------------------------------------------------------------


def night_map(cities, mask: np.ndarray, w: int, h: int) -> np.ndarray:
    lights = np.zeros((h, w), dtype=np.float32)
    warm = np.zeros((h, w), dtype=np.float32)

    rng = np.random.default_rng(7)

    for lon, lat, pop in cities:
        if pop < 5000:
            continue
        x = (lon + 180.0) / 360.0 * w
        y = (90.0 - lat) / 180.0 * h
        xi, yi = int(x), int(y)
        if not (0 <= yi < h):
            continue

        # Both size and brightness go with the logarithm of population. A city
        # of ten million is not two thousand times brighter than one of five
        # thousand — it is perhaps thirty times — and using population directly
        # gives half a dozen white blobs on an otherwise black planet.
        s = math.log10(pop) - 3.4          # ~0.3 for a small town, ~3.5 for a megacity
        radius = max(1, int(0.6 + s * 0.95 * (w / 4096)))
        peak = 0.030 + s * 0.150

        # A little colour variation: most street lighting is sodium-orange, some
        # of it is newer and whiter.
        cool = rng.random() < 0.30

        y0, y1 = max(0, yi - radius * 3), min(h, yi + radius * 3 + 1)
        x0, x1 = xi - radius * 3, xi + radius * 3 + 1
        yy = np.arange(y0, y1)[:, None]
        xx = np.arange(x0, x1)[None, :]
        d2 = ((xx - x) / radius) ** 2 + ((yy - y) / radius) ** 2
        g = np.exp(-d2 * 1.4).astype(np.float32) * peak

        # Longitude wraps, so a city near the date line lights both edges.
        cols = np.mod(xx, w).ravel()
        lights[y0:y1, cols] += g
        if not cool:
            warm[y0:y1, cols] += g

    # The megaregion glow: the same field, heavily blurred and added back
    # underneath. Cities do not sit in pools of darkness — the light between
    # them is real, and it is what makes the eastern United States read as one
    # continuous lit shape rather than a scatter of dots.
    # Kept well under the cities themselves. The first attempt weighted this
    # at more than the points it was derived from, and every populated
    # continent came out as one flat white shape — the opposite of the real
    # thing, where the glow is a faint wash you only notice because the gaps
    # between cities are not quite black.
    spread = blur(lights, w / 500.0) * 0.13 + blur(lights, w / 140.0) * 0.19
    total = lights + spread * np.clip(mask + 0.25, 0, 1)

    warm_frac = np.clip(warm / np.maximum(lights, 1e-4), 0, 1)
    # Weighted well towards sodium. Street lighting is overwhelmingly amber and
    # the cool half of the mix was washing the whole map towards white.
    warm_frac = 0.62 + 0.38 * blur(warm_frac, 2.0)

    amber = np.array([1.00, 0.66, 0.32], dtype=np.float32)
    white = np.array([0.82, 0.87, 1.00], dtype=np.float32)
    tint = white[None, None, :] + (amber - white)[None, None, :] * warm_frac[..., None]

    # Normalised so the brightest place on Earth lands just under the top of
    # the range instead of past it.
    #
    # An 8-bit texture cannot hold anything above one, and the megaregions were
    # going well past it — so the blur that is meant to be a faint wash between
    # cities clipped to flat white, and the American midwest rendered as a
    # smooth white blob with no cities in it at all. Scaling to the 99.95th
    # percentile keeps the structure and lets the shader decide how bright the
    # lights should be.
    hi = float(np.percentile(total, 99.95))
    total = total / max(hi, 1e-6) * 0.92

    return np.clip(total[..., None] * tint, 0, 1.0)


# ---------------------------------------------------------------------------


def to_srgb8(img: np.ndarray, seed: int = 3) -> np.ndarray:
    a = 0.0031308
    s = np.where(img <= a, img * 12.92, 1.055 * np.power(np.maximum(img, 1e-8), 1 / 2.4) - 0.055)
    rng = np.random.default_rng(seed)
    n = rng.random(s.shape, dtype=np.float32) - rng.random(s.shape, dtype=np.float32)
    return np.clip(s * 255.0 + n * 0.5 + 0.5, 0, 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--geo", required=True)
    ap.add_argument("--out", default="public/sky")
    ap.add_argument("--width", type=int, default=4096)
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    w = args.width
    h = w // 2

    print(f"rendering {w}x{h}")
    topo = json.load(open(os.path.join(args.geo, "land-10m.json")))
    polys = polygons(topo, "land")
    print(f"  {len(polys)} land polygons")

    mask = land_mask(polys, w, h)
    print(f"  land covers {100 * mask.mean():.1f}% of the map")

    cities = json.load(open(os.path.join(args.geo, "cities.json")))
    print(f"  {len(cities):,} cities")

    os.makedirs(args.out, exist_ok=True)

    day = to_srgb8(surface_map(mask, w, h))
    day_img = Image.fromarray(day, "RGB")
    day_img.save(os.path.join(args.out, "earth-day.avif"), quality=68)
    # WebP as well: AVIF support is a little narrower than WebGL2's, and a
    # browser that can run the scene but not decode the texture would show a
    # blank planet at the one moment the page is asking to be looked at.
    day_img.save(os.path.join(args.out, "earth-day.webp"), quality=84, method=6)
    if args.preview:
        day_img.save(os.path.join(args.out, "earth-day.png"))

    night = night_map(cities, mask, w, h)
    print(f"  brightest light {night.max():.2f}, lit pixels {100 * (night.max(axis=2) > 0.02).mean():.2f}%")
    night8 = to_srgb8(np.clip(night, 0, 1))
    night_img = Image.fromarray(night8, "RGB")
    night_img.save(os.path.join(args.out, "earth-night.avif"), quality=70)
    night_img.save(os.path.join(args.out, "earth-night.webp"), quality=86, method=6)
    if args.preview:
        night_img.save(os.path.join(args.out, "earth-night.png"))

    for f in ["earth-day.avif", "earth-day.webp", "earth-night.avif", "earth-night.webp"]:
        p = os.path.join(args.out, f)
        print(f"  {p}  {os.path.getsize(p) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
