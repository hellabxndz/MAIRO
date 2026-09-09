#!/usr/bin/env python3
"""
Renders the Milky Way panorama the marketing site uses as its background.

Why this exists as a build-time script rather than as canvas code: a galaxy
with real structure in it is expensive to compute and completely static once
computed. Generating it offline means the page can move a genuinely detailed
image around with nothing but a transform, which the browser hands to the
compositor. The cost of the detail is paid once, here, instead of sixty times
a second on someone's laptop.

The physics is real enough to matter. Every step below exists because leaving
it out makes the picture look drawn rather than photographed:

  * The gas is a log-normal random field with a power-law spectrum. Turbulent
    interstellar gas genuinely has that distribution, and it is the reason real
    star clouds have both smooth regions and sharp filaments in the same frame.
    Smooth noise gives you cotton wool.

  * Dust is a separate field with a SMALLER scale height than the stars, and it
    is applied as absorption — exp(-tau) — not as dark paint. That single
    detail produces the dark rift down the middle of the band for the same
    reason the sky has one: the dust sits in a thinner layer than the light
    behind it.

  * Extinction is stronger in blue than in red. So the dust does not fade to
    grey, it fades to brown and amber at its edges, which is most of what makes
    a Milky Way photograph feel warm.

  * The final stretch is arcsinh, which is what astronomers actually use. It
    holds onto faint nebulosity without blowing the core to a white blob the
    way a plain gamma curve does.

Everything is periodic along X — the noise is built in Fourier space and the
plane is a sum of sinusoids over a whole number of cycles — so the image tiles
seamlessly left to right and the page can pan across it forever without a seam
or a reset.

Usage:  python3 scripts/render-milky-way.py [--out DIR] [--width 4096] [--preview]
"""

from __future__ import annotations

import argparse
import time

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Field generation
# ---------------------------------------------------------------------------


def power_law_field(h: int, w: int, beta: float, seed: int) -> np.ndarray:
    """
    A Gaussian random field whose power spectrum falls off as k**-beta.

    Built by filtering white noise in Fourier space, which has two properties
    worth the FFT: the result is exactly periodic on both axes (so the panorama
    tiles), and beta is a direct dial on how the structure looks. Around 2.5
    gives wispy filaments; above 3.5 it turns into smooth blobs.
    """
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    k = np.hypot(kx, ky)
    k[0, 0] = 1.0

    amp = k ** (-beta / 2.0)
    amp[0, 0] = 0.0  # no DC term; the field is centred on zero by construction

    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w))
    field = np.fft.irfft2(np.fft.rfft2(white) * amp[:, : w // 2 + 1], s=(h, w))
    return (field / field.std()).astype(np.float32)


def lognormal(field: np.ndarray, sigma: float) -> np.ndarray:
    """
    Turns a Gaussian field into a log-normal one with unit mean.

    Column densities in turbulent gas are log-normal, and the difference is
    visible: a Gaussian field is symmetric about its mean, so it gives you as
    much "darker than average" as "brighter than average" and reads as fog. A
    log-normal field has a long bright tail, which is what puts a few genuinely
    luminous clouds in a field of faint ones.
    """
    return np.exp(sigma * field - 0.5 * sigma * sigma).astype(np.float32)


def blackbody_rgb(temp: np.ndarray) -> np.ndarray:
    """
    Approximate sRGB primaries for a blackbody at `temp` kelvin, normalised so
    every colour has the same luminance.

    Normalising is deliberate. Star brightness is set by the flux we sample
    separately; if colour carried brightness too, every red dwarf would vanish
    and the field would be all blue, which is the opposite of the real sky.
    """
    t = np.clip(temp, 1700.0, 40000.0) / 100.0

    r = np.where(t <= 66, 255.0, 329.698727446 * np.power(np.maximum(t - 60, 1e-6), -0.1332047592))
    g = np.where(
        t <= 66,
        99.4708025861 * np.log(np.maximum(t, 1e-6)) - 161.1195681661,
        288.1221695283 * np.power(np.maximum(t - 60, 1e-6), -0.0755148492),
    )
    b = np.where(
        t >= 66,
        255.0,
        np.where(t <= 19, 0.0, 138.5177312231 * np.log(np.maximum(t - 10, 1e-6)) - 305.0447927307),
    )

    rgb = np.clip(np.stack([r, g, b], axis=-1) / 255.0, 0.0, 1.0)
    lum = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2])[..., None]
    return (rgb / np.maximum(lum, 1e-4)).astype(np.float32)


def splat(buf: np.ndarray, xs: np.ndarray, ys: np.ndarray, vals: np.ndarray) -> None:
    """
    Adds point sources into an accumulation buffer with bilinear weights.

    Sub-pixel placement matters more than it sounds. Rounding every star to the
    nearest pixel quantises the whole field onto a grid, and at a hundred
    thousand stars the eye picks that up as a faint texture of rows and columns.
    """
    h, w = buf.shape[:2]
    x0 = np.floor(xs).astype(np.int32)
    y0 = np.floor(ys).astype(np.int32)
    fx = (xs - x0).astype(np.float32)
    fy = (ys - y0).astype(np.float32)

    for dx, dy, wx, wy in (
        (0, 0, 1 - fx, 1 - fy),
        (1, 0, fx, 1 - fy),
        (0, 1, 1 - fx, fy),
        (1, 1, fx, fy),
    ):
        # Wrapping in X keeps the panorama tileable right up to its edges; a
        # star half a pixel off the right edge contributes to the left one.
        xi = (x0 + dx) % w
        yi = np.clip(y0 + dy, 0, h - 1)
        weight = (wx * wy).astype(np.float32)
        if vals.ndim == 1:
            np.add.at(buf, (yi, xi), vals * weight)
        else:
            np.add.at(buf, (yi, xi), vals * weight[:, None])


def gaussian_psf(h: int, w: int, sigma: float) -> np.ndarray:
    """A normalised, wrap-around Gaussian kernel in the frequency domain."""
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    k2 = kx * kx + ky * ky
    return np.exp(-2.0 * (np.pi * sigma) ** 2 * k2).astype(np.float32)


# ---------------------------------------------------------------------------
# The picture
# ---------------------------------------------------------------------------


def render(width: int, height: int, seed: int = 20260909) -> np.ndarray:
    """Returns a linear-light RGB float array, shape (height, width, 3)."""
    t0 = time.time()

    def step(msg: str) -> None:
        print(f"  [{time.time() - t0:5.1f}s] {msg}", flush=True)

    xs = np.arange(width, dtype=np.float32)
    ys = np.arange(height, dtype=np.float32)
    u = xs / width  # 0..1 along the panorama

    # The galactic plane is not a straight line across the frame. A sum of
    # sinusoids over whole cycles gives it a slow arc — the shape you get
    # photographing the band from horizon to horizon — while staying periodic,
    # which a linear tilt would not be.
    plane = (
        height * 0.50
        + height * 0.175 * np.sin(2 * np.pi * u + 0.62)
        + height * 0.045 * np.sin(4 * np.pi * u + 2.30)
    ).astype(np.float32)

    dy = ys[:, None] - plane[None, :]  # (H, W) distance from the plane, in px

    # Dust sits in a thinner layer than the stars and is slightly offset from
    # them, which is why the rift wanders across the band instead of splitting
    # it exactly down the middle.
    dust_plane = plane + height * 0.020 * np.sin(2 * np.pi * u * 3.0 + 1.1)
    dy_dust = ys[:, None] - dust_plane[None, :]

    # Longitudinal profile: the galactic centre. Distance measured the short way
    # round so the brightening wraps with the image.
    core_u = 0.315
    dl = np.abs(u - core_u)
    dl = np.minimum(dl, 1.0 - dl)
    lon = (0.30 + 0.70 * np.exp(-((dl / 0.150) ** 2))).astype(np.float32)

    step("building gas fields")
    # Two scales multiplied together rather than one. A single field gives
    # structure at one size and looks like fog; the coarse field decides where
    # the star clouds are and the fine one puts filaments and knots inside them,
    # which is what the eye reads as detail.
    clouds = lognormal(power_law_field(height, width, 3.05, seed + 1), 1.05) * lognormal(
        power_law_field(height, width, 2.55, seed + 11), 0.62
    )
    dust_n = lognormal(power_law_field(height, width, 3.05, seed + 2), 1.35) * lognormal(
        power_law_field(height, width, 2.60, seed + 12), 0.75
    )
    patch = lognormal(power_law_field(height, width, 4.20, seed + 3), 0.85)

    # --- unresolved starlight -------------------------------------------------
    h_thin = height * 0.042
    h_thick = height * 0.175

    disc = np.exp(-np.abs(dy) / h_thin) + 0.34 * np.exp(-np.abs(dy) / h_thick)
    disc *= lon[None, :]

    # The bulge. Flattened, because the real one is, and warm.
    dxc = np.abs(u - core_u)
    dxc = np.minimum(dxc, 1.0 - dxc) * width
    bulge = np.exp(
        -np.sqrt((dxc[None, :] / (width * 0.048)) ** 2 + (dy / (height * 0.085)) ** 2)
    )

    emission = (disc * clouds + 1.90 * bulge * (0.50 + 0.50 * clouds)).astype(np.float32)
    step("starlight")

    # --- colour of the unresolved light --------------------------------------
    # Warm towards the core, cooler out in the arms. The site's palette leans
    # violet, so the cool end is nudged that way rather than to plain blue.
    warm = np.clip(bulge * 1.5 + np.exp(-((dl / 0.22) ** 2))[None, :] * 0.55, 0.0, 1.0)
    c_warm = np.array([1.00, 0.755, 0.520], dtype=np.float32)
    c_cool = np.array([0.640, 0.700, 1.00], dtype=np.float32)
    gas_rgb = emission[..., None] * (c_cool + (c_warm - c_cool) * warm[..., None])

    # --- HII regions ----------------------------------------------------------
    # Hand-placed so there are a few landmarks to find. Hydrogen alpha is a very
    # specific pink; a couple of blue reflection nebulae keep it from reading as
    # a single filter pass.
    rng = np.random.default_rng(seed + 40)
    for _ in range(15):
        cx = rng.uniform(0, 1)
        off = rng.normal(0.0, height * 0.030)
        cy = float(
            height * 0.50
            + height * 0.175 * np.sin(2 * np.pi * cx + 0.62)
            + height * 0.045 * np.sin(4 * np.pi * cx + 2.30)
            + off
        )
        rx = rng.uniform(0.0045, 0.0135) * width
        ry = rx * rng.uniform(0.55, 1.25)
        px = np.abs(xs - cx * width)
        px = np.minimum(px, width - px)
        blob = np.exp(-((px[None, :] / rx) ** 2 + ((ys[:, None] - cy) / ry) ** 2))
        # Brighter nearer the core, where the real ones are.
        strength = rng.uniform(0.35, 1.30)
        if rng.random() < 0.72:
            tint = np.array([1.00, 0.245, 0.330], dtype=np.float32)  # H-alpha
        else:
            tint = np.array([0.420, 0.590, 1.00], dtype=np.float32)  # reflection
        # Multiplied by the cloud field, not added flat, so a nebula inherits
        # the structure of the gas it sits in instead of being a smooth disc.
        gas_rgb += (blob * patch * clouds * strength)[..., None] * tint
    step("nebulae")

    # --- extinction -----------------------------------------------------------
    # Absorption, not dark paint. And wavelength dependent: blue light is
    # scattered out of the line of sight harder than red, so thick dust goes
    # amber at its edges before it goes black.
    # Two layers. The thin one is the rift that splits the band. The thick,
    # weaker one reaches far enough above and below the plane to break up the
    # glow around the core, which otherwise renders as an airbrushed smudge —
    # the giveaway that a picture was painted rather than exposed.
    tau = (
        dust_n
        * (0.25 + 0.75 * patch)
        * (
            4.30 * np.exp(-np.abs(dy_dust) / (height * 0.026))
            + 0.95 * np.exp(-np.abs(dy_dust) / (height * 0.105))
        )
    ).astype(np.float32)

    ext = np.stack(
        [np.exp(-0.72 * tau), np.exp(-1.00 * tau), np.exp(-1.42 * tau)], axis=-1
    )
    gas_rgb *= ext
    step("dust")

    # A faint blue haze in front of everything: the general scattered light that
    # keeps real astrophotographs from having truly black sky.
    haze = lognormal(power_law_field(height, width, 3.60, seed + 5), 0.60)
    gas_rgb += (0.0130 * haze)[..., None] * np.array([0.42, 0.50, 1.00], dtype=np.float32)

    # --- resolved stars -------------------------------------------------------
    step("placing stars")
    # Roughly one star per thirteen pixels. That sounds absurd until you look at
    # a real wide-field exposure: the sky is not a scatter of dots on black, it
    # is a continuous carpet of them, and almost all are far too faint to
    # resolve individually. The carpet is what the eye reads as depth. They cost
    # nothing at run time — this is a still image.
    n_stars = int(width * height * 0.0950)
    rng = np.random.default_rng(seed + 7)

    n_disc = int(n_stars * 0.62)
    n_halo = n_stars - n_disc

    # Disc stars follow the same layer the light does, so they crowd into the
    # band and thin out away from it.
    over = 2.6
    cx_d = rng.uniform(0, width, int(n_disc * over)).astype(np.float32)
    plane_at = np.interp(cx_d, xs, plane).astype(np.float32)
    cy_d = plane_at + rng.laplace(0.0, h_thin * 0.85, cx_d.size).astype(np.float32)
    inside = (cy_d >= 0) & (cy_d < height - 1)
    cx_d, cy_d = cx_d[inside], cy_d[inside]

    # Then thinned against the cloud field, so the stars cluster into the same
    # knots the unresolved light comes from. Scattering them evenly along the
    # band and painting structured gas behind them is the mistake that makes a
    # rendered sky look rendered: the granularity and the glow have to be the
    # same thing seen at two scales, because in the real sky they are.
    density = clouds * (1.0 + 2.6 * bulge)
    at = density[cy_d.astype(np.int32), cx_d.astype(np.int32)]
    prob = np.clip(at / np.percentile(clouds, 90), 0.0, 1.0)
    taken = rng.random(prob.size) < prob
    sx_d, sy_d = cx_d[taken][:n_disc], cy_d[taken][:n_disc]

    sx_h = rng.uniform(0, width, n_halo).astype(np.float32)
    sy_h = rng.uniform(0, height, n_halo).astype(np.float32)

    sx = np.concatenate([sx_d, sx_h])
    sy = np.concatenate([sy_d, sy_h])
    keep = (sy >= 0) & (sy < height - 1)
    sx, sy = sx[keep], sy[keep]
    n = sx.size

    # Brightness follows a power law, which is why a real starfield is mostly
    # faint points with a handful of obvious ones rather than an even scatter.
    v = rng.random(n).astype(np.float32)
    flux = (0.000420 * np.power(np.maximum(v, 1e-9), -1.0 / 1.62)).astype(np.float32)
    flux = np.minimum(flux, 9.0)

    # Temperatures skewed cool: most stars are, and the few hot ones are what
    # give the field its blue accents.
    temp = (2400.0 * np.power(np.maximum(rng.random(n).astype(np.float32), 1e-9), -0.42)).astype(np.float32)
    temp = np.clip(temp, 2400.0, 26000.0)
    star_rgb = blackbody_rgb(temp) * flux[:, None]

    core = np.zeros((height, width, 3), dtype=np.float32)
    splat(core, sx, sy, star_rgb)
    step(f"splatted {n:,} stars")

    # Two Gaussians: a tight one for the point itself and a broad, faint one for
    # the halo every real optical system puts around a bright source. Without
    # the halo the bright stars look pasted on.
    fk_tight = gaussian_psf(height, width, 0.95)
    fk_wide = gaussian_psf(height, width, 5.20)
    kernel = fk_tight + 0.020 * fk_wide

    stars = np.empty_like(core)
    for c in range(3):
        stars[..., c] = np.fft.irfft2(
            np.fft.rfft2(core[..., c]) * kernel[:, : width // 2 + 1], s=(height, width)
        )
    stars = np.maximum(stars, 0.0)
    step("convolved point spread function")

    # --- diffraction spikes on the brightest few -----------------------------
    # Only the brightest stars get them in a real exposure, and they are the
    # single strongest cue that a picture came out of a telescope.
    bright = np.argsort(flux)[-90:]
    spikes = np.zeros((height, width, 3), dtype=np.float32)
    for i in bright:
        f = float(flux[i])
        length = int(np.clip(9.0 * np.sqrt(f), 10, 150))
        cx_i, cy_i = float(sx[i]), float(sy[i])
        col = blackbody_rgb(np.array([temp[i]]))[0]
        t = np.arange(-length, length + 1, dtype=np.float32)
        fade = (np.exp(-np.abs(t) / (length * 0.42)) * f * 0.055).astype(np.float32)
        for ax in (0, 1):
            px_ = cx_i + (t if ax == 0 else 0.0)
            py_ = cy_i + (0.0 if ax == 0 else t)
            py_arr = np.broadcast_to(np.asarray(py_, dtype=np.float32), t.shape)
            px_arr = np.broadcast_to(np.asarray(px_, dtype=np.float32), t.shape)
            ok = (py_arr >= 0) & (py_arr < height - 1)
            splat(spikes, px_arr[ok] % width, py_arr[ok], col[None, :] * fade[ok, None])
    stars += spikes
    step("diffraction spikes")

    # The gas is deliberately dim next to the stars. This is a background for a
    # page of white text: it has to survive being looked past. It is also what
    # real long exposures look like — the eye reads a starfield with a glow
    # behind it, not a glow with stars on top.
    linear = gas_rgb * 0.0190 + stars
    return np.maximum(linear, 0.0)


# ---------------------------------------------------------------------------
# Tone mapping and output
# ---------------------------------------------------------------------------


def tonemap(linear: np.ndarray, stretch: float = 14.0, exposure: float = 1.0) -> np.ndarray:
    """
    arcsinh stretch, applied to luminance so hue survives it.

    Stretching each channel on its own drives everything bright towards white,
    because whichever channel is largest saturates first. Scaling the triplet by
    the ratio the luminance moved keeps a red nebula red at every brightness.
    """
    v = linear * exposure
    lum = 0.2126 * v[..., 0] + 0.7152 * v[..., 1] + 0.0722 * v[..., 2]
    stretched = np.arcsinh(lum * stretch) / np.arcsinh(stretch)
    scale = stretched / np.maximum(lum, 1e-6)
    out = v * scale[..., None]

    # Very bright cores desaturate, the way an overexposed sensor does.
    peak = np.clip((stretched - 0.72) / 0.28, 0.0, 1.0)[..., None]
    out = out + (stretched[..., None] - out) * peak * 0.85

    return np.clip(out, 0.0, 1.0)


def to_srgb8(img: np.ndarray, seed: int = 11) -> np.ndarray:
    """sRGB transfer curve, then dithered quantisation to 8 bits."""
    a = 0.0031308
    srgb = np.where(img <= a, img * 12.92, 1.055 * np.power(np.maximum(img, 1e-8), 1 / 2.4) - 0.055)

    # A dark image quantised straight to 8 bits bands badly — the sky is mostly
    # values 2 through 12, and the steps between them are visible as contour
    # lines across the whole frame. Triangular dither costs nothing and removes
    # them completely.
    rng = np.random.default_rng(seed)
    noise = rng.random(srgb.shape, dtype=np.float32) - rng.random(srgb.shape, dtype=np.float32)
    return np.clip(srgb * 255.0 + noise * 0.5 + 0.5, 0, 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/sky")
    ap.add_argument("--width", type=int, default=4096)
    ap.add_argument("--name", default="milky-way")
    ap.add_argument("--exposure", type=float, default=1.0)
    ap.add_argument("--stretch", type=float, default=14.0)
    ap.add_argument("--preview", action="store_true", help="also write a PNG to look at")
    args = ap.parse_args()

    width = args.width
    height = width * 9 // 16

    print(f"rendering {width}x{height}")
    linear = render(width, height)
    img = to_srgb8(tonemap(linear, stretch=args.stretch, exposure=args.exposure))

    import os

    os.makedirs(args.out, exist_ok=True)
    pil = Image.fromarray(img, "RGB")

    base = os.path.join(args.out, args.name)
    if args.preview:
        pil.save(f"{base}.png")
        print(f"  wrote {base}.png")

    pil.save(f"{base}.avif", quality=60)
    pil.save(f"{base}.webp", quality=82, method=6)

    half = pil.resize((width // 2, height // 2), Image.LANCZOS)
    half.save(f"{base}-half.avif", quality=62)
    half.save(f"{base}-half.webp", quality=84, method=6)

    for f in (f"{base}.avif", f"{base}.webp", f"{base}-half.avif", f"{base}-half.webp"):
        print(f"  {f}  {os.path.getsize(f) / 1024:8.0f} KB")

    lum = 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]
    print(f"  mean luminance {lum.mean():.1f}/255   p99 {np.percentile(lum, 99):.0f}   max {lum.max()}")


if __name__ == "__main__":
    main()
