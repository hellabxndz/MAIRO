#!/usr/bin/env python3
"""
Renders the surface maps for the planets other than Earth.

Earth looks photographed because it is built from real data. These cannot be —
there is no survey of a world that does not exist — so instead they are built
the way the real surfaces were: by the processes that made them. Craters are
placed with a power-law size distribution and given a bowl, a raised rim and an
ejecta blanket. Lava plains flood the low ground and bury what was there.
Canyons cut. Ice fractures along great circles. Cloud bands are sheared by a
turbulent flow rather than drawn as stripes.

That is a different thing from noise dressed up as terrain, and it is why the
result reads as a photograph: the features have the relationships that real
ones do — small craters inside big ones, ejecta lying on top of what came
before, bands pulled into curls where they shear past each other.

Each layer is RGBA: colour in RGB and elevation in A. The shader turns that
elevation into a surface normal, which is the single strongest cue of the lot —
without relief every world is a smooth ball with a picture painted on it, and
no amount of surface detail fixes that.

Output is one vertical atlas, uploaded as a WebGL 2D texture array.

Usage: python3 scripts/render-planets.py --out public/sky [--width 1024]
"""

from __future__ import annotations

import argparse
import math
import os

import numpy as np
from PIL import Image, ImageFilter


# ---------------------------------------------------------------------------
# Fields
# ---------------------------------------------------------------------------


def fbm(h: int, w: int, beta: float, seed: int) -> np.ndarray:
    """Power-law noise, periodic in both axes so the map wraps in longitude."""
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
    lo, hi = float(a.min()), float(a.max())
    if hi - lo < 1e-9:
        return a.copy()
    img = Image.fromarray(((a - lo) / (hi - lo) * 255).astype(np.uint8))
    out = np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0
    return out * (hi - lo) + lo


def latitudes(h: int) -> np.ndarray:
    return 90.0 - (np.arange(h, dtype=np.float32) + 0.5) / h * 180.0


# ---------------------------------------------------------------------------
# Craters
# ---------------------------------------------------------------------------


def crater_field(
    h: int, w: int, seed: int, count: int, rmin: float, rmax: float, depth_scale: float = 1.0
) -> tuple[np.ndarray, np.ndarray]:
    """
    Returns (elevation, albedo_modulation) for a cratered surface.

    Sizes follow a power law — the sky is full of small impactors and nearly
    empty of large ones — so the field comes out with a few basins, a scatter of
    mid-sized craters and a dense pepper of little ones, which is what a real
    cratered surface looks like at a glance.

    Each crater is drawn in its own window rather than across the whole map,
    which is what makes a few thousand of them affordable.
    """
    rng = np.random.default_rng(seed)
    elev = np.zeros((h, w), dtype=np.float32)
    bright = np.zeros((h, w), dtype=np.float32)

    # Inverse transform of N(>r) proportional to r^-2 over [rmin, rmax].
    u = rng.random(count)
    radii = (rmin ** -2 + u * (rmax ** -2 - rmin ** -2)) ** (-0.5)
    order = np.argsort(radii)[::-1]  # largest first, so later small ones overprint
    radii = radii[order]

    lat = latitudes(h)

    for r in radii:
        cy = int(rng.integers(0, h))
        cx = int(rng.integers(0, w))

        # Longitude is compressed towards the poles, so a circular crater covers
        # more columns up there. Without this correction every high-latitude
        # crater comes out as a vertical slot.
        clat = math.cos(math.radians(float(lat[cy])))
        stretch = 1.0 / max(clat, 0.10)
        rx = r * stretch
        pad = 2.1

        y0, y1 = max(0, int(cy - r * pad)), min(h, int(cy + r * pad) + 1)
        if y1 <= y0:
            continue
        half = int(rx * pad) + 1
        xs = np.arange(cx - half, cx + half + 1)
        if xs.size > w:
            xs = np.arange(w)
        ys = np.arange(y0, y1)

        dy = (ys[:, None] - cy) / r
        dx = (xs[None, :] - cx) / rx
        t = np.sqrt(dx * dx + dy * dy)

        inside = t < 1.0
        # Paraboloid bowl, a sharp raised rim, and an ejecta blanket outside it.
        bowl = np.where(inside, -(1.0 - t * t), 0.0)
        rim = np.exp(-(((t - 1.0) / 0.16) ** 2)) * 0.55
        ejecta = np.exp(-(((t - 1.0) / 0.85) ** 2)) * 0.10 * (t > 1.0)

        # Bigger craters are relatively shallower, as real ones are.
        d = depth_scale * r * 0.055 * (r ** -0.18)
        patch = (bowl * 0.75 + rim + ejecta) * d

        cols = np.mod(xs, w)
        elev[y0:y1, cols] += patch.astype(np.float32)

        # A fraction are fresh, with bright ejecta still on the surface.
        if rng.random() < 0.22:
            bright[y0:y1, cols] += (
                np.exp(-(((t - 0.9) / 0.7) ** 2)) * 0.35 * min(1.0, r / 12.0)
            ).astype(np.float32)

    return elev, bright


# ---------------------------------------------------------------------------
# Surfaces
# ---------------------------------------------------------------------------


def relief_shading(elev: np.ndarray, w: int, strength: float = 1.0) -> np.ndarray:
    """
    Brightness that follows the topography.

    On a real airless surface, albedo and elevation are not independent:
    crater rims and ridges are scoured to bright fresh rock, floors collect
    dark fill and shadow, and every slope has been worked on differently. A
    high-pass of the elevation captures all of that in one term.

    This is the difference between a surface and a texture. Without it the
    colour is noise that happens to sit on top of a heightfield, and the eye
    reads the two as unrelated — which is exactly what it did.
    """
    hp = elev - blur(elev, w / 150.0)
    return np.clip(hp / (hp.std() + 1e-6) * 0.13 * strength, -0.34, 0.40)


def rocky(h: int, w: int, seed: int, base: tuple, *, mare=True, craters=2600) -> np.ndarray:
    """A cratered world, optionally flooded with dark plains."""
    rng = np.random.default_rng(seed)
    elev, bright = crater_field(h, w, seed, craters, 1.4, w / 22.0)

    # Broad topography under the craters.
    elev += fbm(h, w, 3.1, seed + 5) * 0.35
    # Smooth. Fine noise in the colour reads as sensor grain, not as ground —
    # the detail on a real surface is in its shape, which is the elevation
    # channel's job.
    detail = fbm(h, w, 3.6, seed + 9)

    col = np.array(base, dtype=np.float32)
    shade = 0.72 + detail * 0.10 + bright * 0.85 + relief_shading(elev, w)
    rgb = col[None, None, :] * np.clip(shade, 0.15, 1.9)[..., None]

    if mare:
        # Lava floods the low ground, so the mask follows elevation rather than
        # being an independent blob — that correlation is what makes the plains
        # look poured rather than painted.
        low = -(elev - elev.mean()) / (elev.std() + 1e-6)
        m = np.clip((low + fbm(h, w, 3.6, seed + 13) * 1.1 - 0.75) * 1.6, 0, 1)
        m = blur(m, w / 260.0)
        dark = col * np.array([0.30, 0.32, 0.38], dtype=np.float32)
        rgb = rgb + (dark[None, None, :] * (0.85 + detail * 0.2)[..., None] - rgb) * m[..., None]
        # And it buries the craters it covers.
        elev = elev + (blur(elev, w / 120.0) - elev) * m

    return np.concatenate([np.clip(rgb, 0, 1), elev[..., None]], axis=2)


def martian(h: int, w: int, seed: int) -> np.ndarray:
    """Rust, dust, a canyon system and polar caps."""
    rng = np.random.default_rng(seed)
    elev, bright = crater_field(h, w, seed, 2000, 1.4, w / 26.0, depth_scale=0.8)
    elev += fbm(h, w, 3.0, seed + 3) * 0.55

    lat = latitudes(h)[:, None]
    lon = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w * 360.0 - 180.0
    detail = fbm(h, w, 3.5, seed + 7)

    # Big albedo provinces, the way Mars actually looks from far away: broad
    # bright dust plains against a few large dark basaltic regions, not an even
    # speckle. The frequency is what matters — one wavelength across a
    # continent, not across a pixel.
    rust = np.array([0.58, 0.30, 0.18], dtype=np.float32)
    pale = np.array([0.76, 0.55, 0.38], dtype=np.float32)
    dark = np.array([0.34, 0.22, 0.17], dtype=np.float32)
    province = np.clip(0.5 + blur(fbm(h, w, 3.4, seed + 11), w / 60.0) * 2.4, 0, 1)
    rgb = rust[None, None, :] + (pale - rust)[None, None, :] * province[..., None]
    basalt = np.clip((blur(fbm(h, w, 3.9, seed + 23), w / 45.0) * 2.6 - 0.70), 0, 1)
    rgb = rgb + (dark[None, None, :] - rgb) * basalt[..., None]
    rgb *= np.clip(0.86 + detail * 0.10 + bright * 0.8 + relief_shading(elev, w, 0.8), 0.2, 1.7)[..., None]

    # A rift system: a long shallow trough with branches, cut east-west.
    trough = np.exp(-(((lat + 8.0) / 4.5) ** 2)) * np.clip(
        np.minimum(lon + 95.0, 25.0 - lon) / 18.0, 0, 1
    )
    trough *= 0.55 + 0.45 * fbm(h, w, 2.6, seed + 17)
    elev -= trough * 2.6
    rgb *= (1.0 - trough * 0.35)[..., None]

    # Caps, with an edge that wanders.
    cap = np.clip((np.abs(lat) - 73 + blur(fbm(h, w, 3.2, seed + 19), w / 300.0) * 6.0) / 7.0, 0, 1)
    rgb = rgb + (np.array([0.93, 0.95, 0.97], dtype=np.float32)[None, None, :] - rgb) * cap[..., None]

    return np.concatenate([np.clip(rgb, 0, 1), elev[..., None]], axis=2)


def icy(h: int, w: int, seed: int) -> np.ndarray:
    """Bright ice cut by a network of fractures along great circles."""
    rng = np.random.default_rng(seed)
    lat = np.radians(latitudes(h))[:, None]
    lon = np.radians((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w * 360.0 - 180.0)

    lines = np.zeros((h, w), dtype=np.float32)
    for _ in range(42):
        inc = rng.uniform(0.15, 1.45)
        node = rng.uniform(-math.pi, math.pi)
        width = rng.uniform(0.006, 0.024)
        # A great circle on an equirectangular map is this curve. Fractures on
        # an ice shell follow them because the shell cracks along planes through
        # the centre, which is also why the real ones cross at shallow angles.
        curve = np.arctan(math.tan(inc) * np.sin(lon - node))
        d = np.abs(lat - curve)
        # Strength varies a lot: a few dominant lineae and many faint ones, as on
        # a real ice shell, rather than a uniform scribble.
        lines += np.exp(-((d / width) ** 2)) * (rng.random() ** 2.2) * 1.5

    lines = np.clip(lines, 0, 1.6)
    lines *= 0.55 + 0.45 * fbm(h, w, 2.2, seed + 4)

    elev, bright = crater_field(h, w, seed + 1, 320, 1.4, w / 60.0, depth_scale=0.5)
    elev += fbm(h, w, 3.4, seed + 8) * 0.25 - lines * 0.35

    ice = np.array([0.86, 0.89, 0.93], dtype=np.float32)
    stain = np.array([0.62, 0.45, 0.34], dtype=np.float32)
    rgb = ice[None, None, :] * np.clip(
        0.88 + fbm(h, w, 3.5, seed + 12) * 0.09 + bright + relief_shading(elev, w, 0.7), 0.3, 1.4
    )[..., None]
    rgb = rgb + (stain[None, None, :] - rgb) * np.clip(lines, 0, 1)[..., None] * 0.88

    return np.concatenate([np.clip(rgb, 0, 1), elev[..., None]], axis=2)


def gas_giant(h: int, w: int, seed: int, palette: list, spot=True) -> np.ndarray:
    """
    Bands pulled apart by a turbulent flow.

    Latitude stripes on their own read as a beach ball. Real bands are shear
    layers between jets moving at different speeds, so they stretch, fold and
    roll up into vortices where they meet. Advecting the band coordinate along a
    noise field a few times reproduces that: each pass drags the pattern further
    along the flow, and the curls appear on their own.
    """
    rng = np.random.default_rng(seed)
    lat = latitudes(h)[:, None] / 90.0
    y = np.repeat(lat, w, axis=1).astype(np.float32)

    flow_x = fbm(h, w, 2.9, seed + 2)
    flow_y = fbm(h, w, 2.9, seed + 6) * 0.35

    # Zonal jets: alternating east-west speed by latitude.
    jets = np.sin(lat * math.pi * rng.uniform(4.0, 6.5)) * 0.9 + 0.35

    warped = y.copy()
    for i in range(4):
        warped = warped + (flow_y * 0.055 + jets * flow_x * 0.045) / (i + 1)

    bands = np.sin(warped * math.pi * rng.uniform(9.0, 15.0))
    bands = np.sign(bands) * np.abs(bands) ** 0.95
    fine = fbm(h, w, 3.3, seed + 21) * 0.30
    # Smoothed along latitude only, so the bands stay continuous east to west
    # while keeping the curls the advection produced.
    t = np.clip(bands * 0.5 + 0.5 + fine * 0.18, 0, 1)
    t = blur(t, w / 900.0)

    c0 = np.array(palette[0], dtype=np.float32)
    c1 = np.array(palette[1], dtype=np.float32)
    c2 = np.array(palette[2], dtype=np.float32)
    rgb = c0[None, None, :] + (c1 - c0)[None, None, :] * t[..., None]
    rgb = rgb + (c2 - rgb) * np.clip((t - 0.72) / 0.28, 0, 1)[..., None]

    if spot:
        sy = rng.uniform(-0.45, -0.2)
        sx = rng.uniform(-0.6, 0.6)
        yy = (lat - sy) / 0.11
        xx = (((np.arange(w, dtype=np.float32)[None, :] / w) * 2 - 1) - sx) / 0.19
        d = np.sqrt(yy * yy + xx * xx)
        oval = np.clip(1.0 - d, 0, 1) ** 0.8
        # The storm turns, so the bands inside it curl round rather than
        # running straight through.
        swirl = np.sin(np.arctan2(yy, xx) * 3.0 + d * 9.0) * 0.5 + 0.5
        rgb = rgb + (np.array([0.78, 0.40, 0.28], dtype=np.float32)[None, None, :] - rgb) * (
            oval * (0.55 + 0.45 * swirl)
        )[..., None]

    # Poles are darker and hazier on every gas giant we have pictures of.
    polar = np.clip((np.abs(lat) - 0.62) / 0.38, 0, 1)
    rgb *= (1.0 - polar * 0.45)[..., None]

    # Cloud tops have very little relief, but not none.
    elev = (bands * 0.10 + fine * 0.06).astype(np.float32)
    return np.concatenate([np.clip(rgb, 0, 1), elev[..., None]], axis=2)


# ---------------------------------------------------------------------------


def normalise_elevation(layer: np.ndarray) -> np.ndarray:
    """Elevation to 0..1, centred so flat ground sits mid-range."""
    e = layer[..., 3]
    s = np.percentile(np.abs(e - np.median(e)), 99) + 1e-6
    layer[..., 3] = np.clip((e - np.median(e)) / (s * 2.2) + 0.5, 0, 1)
    return layer


def to_srgb8(img: np.ndarray, seed: int = 5) -> np.ndarray:
    a = 0.0031308
    rgb = img[..., :3]
    s = np.where(rgb <= a, rgb * 12.92, 1.055 * np.power(np.maximum(rgb, 1e-8), 1 / 2.4) - 0.055)
    rng = np.random.default_rng(seed)
    n = rng.random(s.shape, dtype=np.float32) - rng.random(s.shape, dtype=np.float32)
    out = np.empty(img.shape, dtype=np.uint8)
    out[..., :3] = np.clip(s * 255.0 + n * 0.5 + 0.5, 0, 255).astype(np.uint8)
    # Elevation stays linear — it is data, not colour, and a gamma curve on it
    # would bend every slope the shader derives from it.
    out[..., 3] = np.clip(img[..., 3] * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/sky")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    w = args.width
    h = w // 2

    print(f"rendering 6 layers at {w}x{h}")
    layers = [
        # 0 — the hero world: heavily cratered, grey-blue, with dark plains.
        rocky(h, w, 101, (0.52, 0.58, 0.68)),
        # 1 — rust, dust and a rift.
        martian(h, w, 202),
        # 2 — the cream banded giant.
        gas_giant(h, w, 303, [(0.42, 0.34, 0.24), (0.86, 0.76, 0.58), (0.95, 0.90, 0.78)]),
        # 3 — a smaller pale rocky world, less flooded.
        rocky(h, w, 404, (0.62, 0.66, 0.74), mare=False, craters=3200),
        # 4 — ice, fractured.
        icy(h, w, 505),
        # 5 — the violet giant seen during the pull-back.
        gas_giant(h, w, 606, [(0.30, 0.26, 0.40), (0.62, 0.55, 0.76), (0.82, 0.78, 0.92)]),
    ]

    atlas = np.concatenate([normalise_elevation(l) for l in layers], axis=0)
    data = to_srgb8(atlas)

    os.makedirs(args.out, exist_ok=True)

    # Two files, not one RGBA.
    #
    # Elevation was the majority of a combined image — 308KB against 199KB for
    # the colour — because crater rims are exactly the high-frequency detail a
    # codec spends bits on. It is also the channel that least tolerates being
    # crushed, since the shader takes its gradient and compression blocks in a
    # height field become visible facets in the shading.
    #
    # Half resolution at high quality solves both. Relief is a broad signal by
    # nature, bilinear interpolation smooths what is lost, and the result is
    # 119KB instead of 308 while looking better than the full-resolution
    # version at a quality low enough to match.
    albedo = Image.fromarray(data[..., :3], "RGB")
    albedo.save(os.path.join(args.out, "planets.avif"), quality=64)
    albedo.save(os.path.join(args.out, "planets.webp"), quality=84, method=6)

    relief = Image.fromarray(data[..., 3], "L").resize((w // 2, (h * len(layers)) // 2), Image.LANCZOS)
    relief.save(os.path.join(args.out, "planets-relief.avif"), quality=82)
    relief.save(os.path.join(args.out, "planets-relief.webp"), quality=90, method=6)

    if args.preview:
        Image.fromarray(data, "RGBA").save(os.path.join(args.out, "planets.png"))
        albedo.save(os.path.join(args.out, "planets-rgb.png"))

    total = 0
    for f in ["planets.avif", "planets.webp", "planets-relief.avif", "planets-relief.webp"]:
        q = os.path.join(args.out, f)
        kb = os.path.getsize(q) / 1024
        if f.endswith(".avif"):
            total += kb
        print(f"  {q}  {kb:.0f} KB")
    print(f"  {len(layers)} layers, {w}x{h} each; {total:.0f} KB over the wire (AVIF)")


if __name__ == "__main__":
    main()
