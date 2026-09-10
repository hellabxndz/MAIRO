#!/usr/bin/env python3
"""
Renders the ship that crosses the galaxy on the marketing page.

It used to be a distance field in the fragment shader — a tapered blob with a
glow — and it looked like what it was. A vehicle needs things a few lines of
shader maths will not give you, so it is drawn here instead, once, and the
shader just puts the picture on a quad and animates the exhaust behind it.

Two things carry the realism, and neither is the outline.

The first is that the hull is black, which is harder than it sounds. A black
object on a black sky is a hole unless the light does the describing, so almost
everything here is about edges: a narrow specular that falls off the way it
would round a cylinder, a cool rim picking the top edge out against the galaxy,
and a warm bounce underneath from the engine. The paint is near the darkest
thing in the frame and the shape still reads.

The second is that a real vehicle is not one tube. It is a stack — fairing,
forward tank, a ribbed interstage that steps out a few centimetres, aft tank,
thrust skirt, bell — and the small step at each joint is most of what tells the
eye it is looking at hardware. On top of that go the things nobody designs and
every real airframe has: rivet lines, a cable run down the flank, streaks
trailing aft from every seam, and scorch creeping up from the engine.

Output is one RGBA sprite, nose to the right.

Usage: python3 scripts/render-rocket.py [--out public/sky] [--width 1280]
"""

from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/mnt/skills/examples/canvas-design/canvas-fonts/InstrumentSans-Bold.ttf",
    "/mnt/skills/examples/canvas-design/canvas-fonts/Outfit-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

WHITE = np.array([0.90, 0.92, 0.96], dtype=np.float32)
RIM = np.array([0.40, 0.58, 1.00], dtype=np.float32)
FLAME = np.array([1.00, 0.52, 0.24], dtype=np.float32)


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a + 1e-9), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def value_noise(rng, h: int, w: int, cells_y: int, cells_x: int) -> np.ndarray:
    """Smooth noise in 0..1, by bicubic upsampling of a coarse grid."""
    coarse = rng.random((cells_y + 1, cells_x + 1)).astype(np.float32)
    img = Image.fromarray((coarse * 255).astype(np.uint8), "L")
    return np.asarray(img.resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0


def lerp(dst: np.ndarray, colour: np.ndarray, mask: np.ndarray) -> np.ndarray:
    return dst + (colour[None, None, :] - dst) * mask[..., None]


def normalize(v: np.ndarray) -> np.ndarray:
    """Normalizes a (..., 3) array of vectors."""
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def dot(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.sum(a * b, axis=-1, keepdims=True)


def ggx(n: np.ndarray, l: np.ndarray, v: np.ndarray, rough: np.ndarray, f0: np.ndarray):
    """
    Cook-Torrance specular, the standard GGX/Smith/Schlick combination.

    This replaced a stack of pow(lambert, k) terms, and the difference is most
    of why the old one read as a drawing. A painted highlight is the same shape
    wherever you put it; a real one stretches along the curvature, tightens
    where the surface faces you, and widens towards the silhouette. None of
    that comes out of an exponent, and all of it falls out of this for free.
    """
    h = normalize(l + v)
    ndl = np.clip(dot(n, l), 0.0, 1.0)
    ndv = np.clip(dot(n, v), 0.0, 1.0)
    ndh = np.clip(dot(n, h), 0.0, 1.0)
    vdh = np.clip(dot(v, h), 0.0, 1.0)

    a = np.maximum(rough * rough, 1e-3)
    a2 = a * a
    denom = ndh * ndh * (a2 - 1.0) + 1.0
    d = a2 / (np.pi * denom * denom)

    k = a * 0.5
    g = (ndl / (ndl * (1.0 - k) + k + 1e-6)) * (ndv / (ndv * (1.0 - k) + k + 1e-6))
    f = f0 + (1.0 - f0) * np.power(1.0 - vdh, 5.0)

    return d * g * f / (4.0 * ndl * ndv + 1e-4) * ndl


def sky(dir_y: np.ndarray) -> np.ndarray:
    """
    What the rocket is standing in, as a two-colour gradient.

    A crude approximation of an environment map and by far the cheapest
    realism in this file. An object lit only by a lamp looks like a model on a
    table; an object that also picks up its surroundings looks like it is
    somewhere. Up is the galaxy — cool, bright, slightly blue. Down is empty
    space with a little warmth thrown back off the engine.
    """
    t = np.clip(-dir_y * 0.5 + 0.5, 0.0, 1.0)          # 1 looking up
    top = np.array([0.34, 0.45, 0.72], dtype=np.float32)
    bottom = np.array([0.030, 0.026, 0.028], dtype=np.float32)
    return bottom + (top - bottom) * np.power(t, 1.3)


def render(w: int, h: int, mirror_text: bool = False) -> np.ndarray:
    """Returns RGBA float in 0..1, nose pointing +x.

    With mirror_text the markings are drawn back to front. That is not a
    mistake — see main() for why the sprite ships as two rows.
    """
    rng = np.random.default_rng(7)
    x = np.arange(w, dtype=np.float32)[None, :] + np.zeros((h, 1), dtype=np.float32)
    y = np.zeros((1, w), dtype=np.float32) + np.arange(h, dtype=np.float32)[:, None]
    cy = h * 0.5
    px = lambda f: w * f                                      # noqa: E731

    # ---- the stack --------------------------------------------------------
    nose_tip = px(0.988)
    fairing = px(0.780)          # shoulder of the nose cone
    inter_f, inter_a = px(0.545), px(0.505)   # ribbed interstage, steps out
    skirt = px(0.208)            # thrust structure begins
    bell_f, bell_a = px(0.150), px(0.052)

    # Six calibers, not twelve.
    #
    # The first version had a real launch vehicle's proportions — a slender
    # tube about twelve times longer than it is wide — and at the size this
    # appears on screen it read as a scratch on the lens rather than a ship.
    # Nothing else about it mattered while that was true. A stubbier rocket is
    # less accurate to any particular launcher and enormously more legible at
    # a hundred pixels.
    R = h * 0.200

    # Ogive nose: the radius follows a circular arc, which is the profile that
    # reads as aerodynamic rather than as a cone.
    tn = np.clip((nose_tip - x) / (nose_tip - fairing), 0.0, 1.0)
    nose_r = R * np.sqrt(np.clip(1.0 - (1.0 - tn) ** 2, 0.0, 1.0))

    body_r = np.where(x >= fairing, nose_r, R)
    step = smoothstep(inter_f + 2.0, inter_f - 1.0, x) * smoothstep(inter_a - 2.0, inter_a + 1.0, x)
    body_r = body_r * (1.0 + 0.055 * step)
    body_r = body_r * (1.0 + 0.20 * smoothstep(skirt + h * 0.16, bell_f, x))

    dy = y - cy
    ady = np.abs(dy)
    hull_span = (x <= nose_tip) & (x >= bell_f)
    body = smoothstep(1.4, -1.4, ady - body_r) * hull_span

    # ---- fins -------------------------------------------------------------
    span = h * 0.200
    s = np.clip((ady - R * 0.88) / span, 0.0, 1.0)             # 0 root, 1 tip
    root = np.power(1.0 - s, 3.0)                              # fillet at the join
    lead = px(0.318) - s * px(0.128) + root * px(0.030)
    trail = px(0.128) - s * px(0.030) + (s * (1 - s)) * px(0.030) - root * px(0.014)
    fin = smoothstep(1.4, -1.4, x - lead) * smoothstep(-1.4, 1.4, x - trail)
    fin *= smoothstep(R * 0.78, R * 0.90, ady) * smoothstep(1.0, 0.985, s)

    # ---- engine bell ------------------------------------------------------
    tb = np.clip((bell_f - x) / (bell_f - bell_a), 0.0, 1.0)
    bell_r = R * (0.80 + 0.46 * tb ** 1.5)
    bell = smoothstep(1.4, -1.4, ady - bell_r) * ((x <= bell_f) & (x >= bell_a))

    alpha = np.clip(body + fin * 0.99 + bell, 0.0, 1.0)

    on_body = body > 0.5
    on_fin = (fin > 0.5) & ~on_body
    on_bell = (bell > 0.5) & ~on_body

    # ---- surface normals --------------------------------------------------
    #
    # The whole reason the old version looked drawn rather than lit.
    #
    # It had only the cross-section: how far up the tube a pixel sits, giving a
    # normal that curves left and right and never forwards or back. So the nose
    # cone — which is nothing BUT a change of radius along the axis — was shaded
    # exactly like the parallel tube behind it, and the boat-tail was invisible.
    #
    # For a surface of revolution of radius r(x), the outward normal is
    # (-r'(x), cos t, sin t) normalized. Adding that first term is what makes
    # the nose read as a cone and the flare read as a flare.
    ny = np.clip(dy / np.maximum(body_r, 1e-3), -1.0, 1.0)
    nz = np.sqrt(np.clip(1.0 - ny * ny, 0.0, 1.0))
    drdx = np.gradient(body_r, axis=1)

    n_body = normalize(np.stack([-drdx, ny, nz], axis=-1))
    # A fin is a flat plate seen face-on, with its leading and trailing edges
    # rolled over so they catch the light the way a machined edge does.
    edge_roll = smoothstep(6.0, 0.0, np.abs(x - lead)) - smoothstep(6.0, 0.0, np.abs(x - trail))
    n_fin = normalize(np.stack([edge_roll * 0.9, np.zeros_like(x), np.ones_like(x)], axis=-1))
    n_bell = normalize(np.stack([-np.gradient(bell_r, axis=1), ny, nz], axis=-1))

    n = np.where(on_fin[..., None], n_fin, np.where(on_bell[..., None], n_bell, n_body))

    # ---- surface detail, as height rather than paint ----------------------
    #
    # Seams, rivets and welds used to be drawn as darker and lighter lines. A
    # line is the same line whichever way the light falls, which is why they
    # read as a technical drawing laid over the hull. Here they are a height
    # field that perturbs the normal, so a rivet has a lit top and a shadowed
    # underside, and the whole lot changes as the ship turns.
    height = np.zeros((h, w), dtype=np.float32)
    ao = np.zeros((h, w), dtype=np.float32)

    for f, weight in [(0.780, 1.0), (0.560, 0.9), (0.545, 1.0), (0.505, 1.0),
                      (0.430, 0.5), (0.352, 0.5), (0.276, 0.5), (0.208, 0.9)]:
        d = x - px(f)
        # A recessed groove with a raised weld bead on its forward lip.
        height -= np.exp(-(d ** 2) / 2.6) * weight * 1.0
        height += np.exp(-((d - 2.4) ** 2) / 2.2) * weight * 0.55
        ao += np.exp(-(d ** 2) / 9.0) * weight * 0.5

    ribs = np.exp(-((np.cos((x - px(0.505)) * (np.pi / (w * 0.0062))) - 1.0) ** 2) / 0.18)
    height -= ribs * step * 0.8
    ao += ribs * step * 0.3

    for level, weight in [(-0.42, 0.8), (0.30, 0.6), (0.66, 0.45)]:
        d = ny - level
        height -= np.exp(-(d ** 2) / 0.0022) * weight
        ao += np.exp(-(d ** 2) / 0.0060) * weight * 0.4

    rivets = np.exp(-((ny + 0.42) ** 2) / 0.0016) * (
        0.5 + 0.5 * np.cos(x * (2 * np.pi / (w * 0.011)))
    ) ** 8
    height += rivets * 0.9 * smoothstep(px(0.78), px(0.72), x) * smoothstep(px(0.20), px(0.24), x)

    # A raised conduit down the flank with clamps over it.
    cond = smoothstep(0.055, 0.030, np.abs(ny - 0.62)) * smoothstep(px(0.77), px(0.73), x) \
        * smoothstep(px(0.215), px(0.245), x)
    height += cond * 1.4
    clamps = (0.5 + 0.5 * np.cos(x * (2 * np.pi / (w * 0.062)))) ** 14
    height += cond * clamps * 1.2

    # Fine brushed grain, and broad blotching in the paint.
    height += (value_noise(rng, h, w, h // 9, w // 40) - 0.5) * 0.55
    height *= on_body.astype(np.float32)

    # Deep shadow where a fin meets the tube — the single strongest cue that
    # two parts are joined rather than drawn on the same plane.
    ao += smoothstep(R * 1.35, R * 0.95, ady) * smoothstep(px(0.34), px(0.30), x) \
        * smoothstep(px(0.11), px(0.15), x) * 1.2
    ao = np.clip(ao, 0.0, 1.0)

    dhy, dhx = np.gradient(height)
    bump_strength = 0.055
    n = normalize(n + np.stack([-dhx * bump_strength, -dhy * bump_strength, np.zeros_like(x)], axis=-1))

    # ---- materials --------------------------------------------------------
    #
    # Markings are paint, not pixels laid over the shading. That distinction is
    # most of what stops a decal looking like a sticker: white paint on a black
    # hull takes the same key light, the same environment and the same
    # curvature as the black does, so it dims round the sides of the tube and
    # picks up the same highlight running along it.
    marks, spark = draw_markings(w, h, cy, px, mirror_text)

    black = np.array([0.022, 0.023, 0.028], dtype=np.float32)
    white = np.array([0.78, 0.80, 0.84], dtype=np.float32)
    steel = np.array([0.52, 0.54, 0.58], dtype=np.float32)

    band = smoothstep(px(0.716), px(0.728), x) * smoothstep(px(0.766), px(0.754), x)
    paint = np.clip(np.clip(band, 0, 1) * on_body + marks, 0.0, 1.0)

    albedo = np.broadcast_to(black, (h, w, 3)).copy()
    albedo = albedo + (white - albedo) * paint[..., None]
    albedo = np.where(on_bell[..., None], steel, albedo)
    albedo = np.where(on_fin[..., None], black * 1.5, albedo)

    rough = np.full((h, w), 0.42, dtype=np.float32)
    rough -= paint * 0.16                                   # markings are glossier
    rough = np.where(on_bell, 0.30, rough)
    rough = np.where(on_fin, 0.34, rough)
    rough += (value_noise(rng, h, w, h // 12, w // 30) - 0.5) * 0.10
    rough = np.clip(rough, 0.06, 0.95)[..., None]

    metal = np.where(on_bell, 1.0, 0.0).astype(np.float32)[..., None]
    f0 = 0.04 * (1.0 - metal) + albedo * metal

    # ---- light ------------------------------------------------------------
    v = np.zeros((h, w, 3), dtype=np.float32)
    v[..., 2] = 1.0                                          # orthographic side view

    key_dir = normalize(np.array([0.22, -0.86, 0.46], dtype=np.float32))[None, None, :]
    key_col = np.array([1.00, 0.97, 0.92], dtype=np.float32) * 2.4

    ndl = np.clip(dot(n, key_dir), 0.0, 1.0)
    diffuse = albedo * (1.0 - metal) * ndl / np.pi * key_col
    specular = ggx(n, key_dir, v, rough, f0) * key_col

    # The environment, reflected. This is the part that makes it look like it
    # is somewhere: a Fresnel-weighted sample of the surroundings along the
    # reflection vector, which brightens towards the silhouette exactly the way
    # a real surface does and needs no hand-placed rim light at all.
    ndv = np.clip(dot(n, v), 0.0, 1.0)
    refl = 2.0 * ndv * n - v
    fres = f0 + (1.0 - f0) * np.power(1.0 - ndv, 5.0)
    env_spec = sky(refl[..., 1:2]) * fres * (1.0 - rough * 0.55)
    env_diff = sky(n[..., 1:2]) * albedo * (1.0 - metal) * 0.55

    ao3 = (1.0 - ao * 0.75)[..., None]
    col = diffuse + specular + (env_spec + env_diff) * ao3

    # A warm bounce off the exhaust, dying away towards the nose.
    bounce = np.clip(dot(n, np.array([0.0, 1.0, 0.25], dtype=np.float32)[None, None, :]), 0, 1)
    col += bounce * (smoothstep(px(0.62), px(0.10), x) * 0.30)[..., None] * FLAME * albedo * 8.0

    # Scorch creeping up from the engine, and soot behind the fins.
    scorch = smoothstep(px(0.42), px(0.13), x) * np.power(np.clip(ny * 0.5 + 0.5, 0, 1), 1.4)
    col *= (1.0 - 0.5 * scorch * on_body)[..., None]

    # Streaks trailing aft from the joints — the stain every airframe grows.
    streak = np.zeros((h, w), dtype=np.float32)
    for f in [0.780, 0.560, 0.505, 0.208]:
        streak += smoothstep(px(f), px(f - 0.075), x) * smoothstep(px(f + 0.004), px(f), x)
    streak *= value_noise(rng, h, w, h // 16, 9) * np.power(np.clip(nz, 0, 1), 0.5)
    col *= (1.0 - 0.18 * np.clip(streak, 0, 1) * on_body)[..., None]

    # ---- the engine --------------------------------------------------------
    # Regeneratively cooled: vertical tube striations, glowing where the flame
    # washes it. This is emission, so it is added after the lighting rather
    # than being part of it.
    stri = 0.5 + 0.5 * np.cos(dy * (2 * np.pi / (h * 0.030)))
    heat = smoothstep(bell_a, bell_f, x)
    col += (on_bell * (stri ** 2) * 0.05)[..., None]
    col += (on_bell * heat * 0.26)[..., None] * FLAME
    col += (on_bell * smoothstep(bell_f - 3.0, bell_f, x) * 0.14)[..., None]

    # The spark of light off the very edge of the roundel and the letters,
    # which is what stops large flat paint reading as a printed label.
    col += (spark * 0.35)[..., None]

    rgb = np.clip(col, 0.0, 1.0)
    return np.concatenate([rgb, alpha[..., None]], axis=2)


def draw_markings(w, h, cy, px, mirror: bool):
    """
    The roundel and the name, as a paint mask.

    Returned rather than composited so the shading can treat them as a change
    of material — see the note at the material block. The second return is a
    thin highlight along their edges: real paint has a measurable thickness and
    catches light at its border, and without it large white shapes on a dark
    hull look printed on.

    Sizes are set by what survives the trip to the screen rather than by what
    looks balanced here. This picture ends up around a hundred pixels tall on
    the page, so a wordmark at a tasteful tenth of the hull's height arrives as
    four pixels of grey mush.
    """
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)

    ex, ey = px(0.640), cy
    er = int(h * 0.150)
    d.ellipse([ex - er, ey - er, ex + er, ey + er], outline=255, width=int(h * 0.030))
    mono = load_font(int(er * 1.30))
    box = d.textbbox((0, 0), "M", font=mono)
    d.text(
        (ex - (box[2] - box[0]) / 2 - box[0], ey - (box[3] - box[1]) / 2 - box[1]),
        "M",
        font=mono,
        fill=255,
    )

    font = load_font(int(h * 0.230))
    text = "MAIRO"
    track = int(h * 0.050)
    widths = [d.textlength(c, font=font) for c in text]
    total = sum(widths) + track * (len(text) - 1)
    tx = px(0.318) - total / 2
    ty = cy - h * 0.150
    for c, cw in zip(text, widths):
        d.text((tx, ty), c, font=font, fill=255)
        tx += cw + track

    marks = np.asarray(img, dtype=np.float32) / 255.0
    if mirror:
        marks = marks[:, ::-1]

    gy, gx = np.gradient(marks)
    spark = np.clip(np.sqrt(gx * gx + gy * gy), 0.0, 1.0)
    return marks, spark


def to_srgb8(img: np.ndarray) -> np.ndarray:
    a = 0.0031308
    rgb = img[..., :3]
    s = np.where(rgb <= a, rgb * 12.92, 1.055 * np.power(np.maximum(rgb, 1e-8), 1 / 2.4) - 0.055)
    out = np.empty(img.shape, dtype=np.uint8)
    out[..., :3] = np.clip(s * 255.0 + 0.5, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(img[..., 3] * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/sky")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    # Rendered at twice the output size and averaged down, which is the whole
    # antialiasing strategy — every edge here is a hard threshold on a distance,
    # and at final resolution they would all be stairs.
    # 8:3 rather than 4:1 — see the note on calibers in render().
    w, h = args.width * 2, int(args.width * 2 * 0.375)
    tile = (args.width, int(args.width * 0.375))

    # Two rows, and the reason is the wordmark.
    #
    # The craft flies a lap, so for half of it the direction of travel points
    # left across the screen. The quad is built along that direction — nose at
    # the leading end, always — which means when it travels left the texture is
    # mapped right-to-left and the whole sprite appears mirrored. The hull does
    # not care, it is very nearly symmetrical. MAIRO very much does: it came
    # out back to front, which is the sort of thing nobody can un-see.
    #
    # A reflection cannot be undone by another reflection in the same axis, so
    # there is no sampling trick here. The second row is the same hull with the
    # wordmark painted back to front, so that the screen's own mirror turns it
    # the right way round. Row 0 is the starboard side, row 1 the port side,
    # and the vertex shader picks between them by the sign of the travel
    # direction along the camera's right axis.
    rows = [
        Image.fromarray(to_srgb8(render(w, h, mirror_text=m)), "RGBA").resize(tile, Image.LANCZOS)
        for m in (False, True)
    ]
    full = Image.new("RGBA", (tile[0], tile[1] * 2), (0, 0, 0, 0))
    for i, row in enumerate(rows):
        full.paste(row, (0, i * tile[1]))

    os.makedirs(args.out, exist_ok=True)
    full.save(os.path.join(args.out, "rocket.avif"), quality=82)
    full.save(os.path.join(args.out, "rocket.webp"), quality=92, method=6)
    if args.preview:
        full.save(os.path.join(args.out, "rocket.png"))
        # On a mid grey, so the black hull and its alpha can both be judged.
        bg = Image.new("RGB", full.size, (40, 44, 52))
        bg.paste(full, (0, 0), full)
        bg.save(os.path.join(args.out, "rocket-on-grey.png"))

    for f in ["rocket.avif", "rocket.webp"]:
        p = os.path.join(args.out, f)
        print(f"  {p}  {os.path.getsize(p) / 1024:.0f} KB  ({full.width}x{full.height}, 2 rows)")


if __name__ == "__main__":
    main()
