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
    joint_a = px(0.560)          # fairing / forward tank
    inter_f, inter_a = px(0.545), px(0.505)   # ribbed interstage, steps out
    skirt = px(0.208)            # thrust structure begins
    bell_f, bell_a = px(0.150), px(0.052)

    # Six calibers, not twelve.
    #
    # The first version was a real launch vehicle's proportions — a slender
    # tube about twelve times longer than it is wide — and at the size this
    # appears on screen it read as a scratch on the lens rather than as a
    # ship. Nothing else about it mattered while that was true: the panel
    # seams, the fins and the name were all there and all invisible. A stubbier
    # rocket is less accurate to any particular launcher and enormously more
    # legible at a hundred pixels.
    R = h * 0.200

    # Ogive nose: the radius follows a circular arc, which is the profile that
    # reads as aerodynamic rather than as a cone.
    tn = np.clip((nose_tip - x) / (nose_tip - fairing), 0.0, 1.0)
    nose_r = R * np.sqrt(np.clip(1.0 - (1.0 - tn) ** 2, 0.0, 1.0))

    body_r = np.where(x >= fairing, nose_r, R)
    # The interstage is a couple of per cent proud of the tanks either side.
    step = smoothstep(inter_f + 2.0, inter_f - 1.0, x) * smoothstep(inter_a - 2.0, inter_a + 1.0, x)
    body_r = body_r * (1.0 + 0.055 * step)
    # And the skirt flares out to carry the engine.
    body_r = body_r * (1.0 + 0.20 * smoothstep(skirt + h * 0.16, bell_f, x))

    dy = y - cy
    ady = np.abs(dy)
    hull_span = (x <= nose_tip) & (x >= bell_f)
    body = smoothstep(1.4, -1.4, ady - body_r) * hull_span

    # ---- fins -------------------------------------------------------------
    # Two swept deltas with a curved trailing edge, rooted on the aft tank and
    # overhanging the engine. A root fillet blends them into the tube so they
    # do not look glued on.
    span = h * 0.200
    s = np.clip((ady - R * 0.88) / span, 0.0, 1.0)             # 0 root, 1 tip
    root = np.power(1.0 - s, 3.0)                              # fillet at the join
    lead = px(0.318) - s * px(0.128) + root * px(0.030)        # sweep
    trail = px(0.128) - s * px(0.030) + (s * (1 - s)) * px(0.030) - root * px(0.014)
    fin = smoothstep(1.4, -1.4, x - lead) * smoothstep(-1.4, 1.4, x - trail)
    fin *= smoothstep(R * 0.78, R * 0.90, ady) * smoothstep(1.0, 0.985, s)

    # ---- engine bell ------------------------------------------------------
    tb = np.clip((bell_f - x) / (bell_f - bell_a), 0.0, 1.0)
    bell_r = R * (0.80 + 0.46 * tb ** 1.5)
    bell = smoothstep(1.4, -1.4, ady - bell_r) * ((x <= bell_f) & (x >= bell_a))

    alpha = np.clip(body + fin * 0.99 + bell, 0.0, 1.0)

    # ---- cylinder shading -------------------------------------------------
    ny = np.clip(dy / np.maximum(body_r, 1e-3), -1.0, 1.0)
    nz = np.sqrt(np.clip(1.0 - ny * ny, 0.0, 1.0))
    lam = np.clip(-ny * 0.88 + nz * 0.46, 0.0, 1.0)            # key from above/ahead

    # Near-black paint. The diffuse term is deliberately tiny: the top of the
    # tube only just separates from the bottom, and the edges do the rest.
    hull = np.zeros((h, w, 3), dtype=np.float32)
    # Set for what comes out of the scene's tone map, not for what the sprite
    # looks like on its own. The composite runs an arcsinh stretch, which lifts
    # shadows hard — but there is a floor below which that stops helping and
    # the ship simply becomes a hole in the sky. That is what happened at half
    # these numbers: a genuinely black hull on a black background has no
    # silhouette at all, and no amount of rim light rescues it. This is
    # graphite rather than ink: still unmistakably a black rocket, still much
    # darker than anything around it, but with a surface you can see.
    hull += np.array([0.030, 0.032, 0.040], dtype=np.float32)[None, None, :]
    hull += (lam * 0.055)[..., None] * np.array([0.85, 0.87, 0.94], dtype=np.float32)

    # The specular band. Tight and restrained — an early pass used four times
    # this and the top half came out white, which is not a black rocket, it is
    # a chrome one. A narrow highlight is enough to describe the curve.
    spec = np.power(lam, 40.0) * 0.46 + np.power(lam, 15.0) * 0.030
    hull += spec[..., None] * np.array([0.92, 0.95, 1.00], dtype=np.float32)

    # Cool rim on the top edge from the galaxy behind, and a fainter one under
    # the belly so the silhouette closes on both sides instead of dissolving.
    hull += (np.power(np.clip(-ny, 0.0, 1.0), 10.0) * 0.62)[..., None] * RIM
    hull += (np.power(np.clip(ny, 0.0, 1.0), 14.0) * 0.22)[..., None] * RIM

    # Warm bounce along the underside from the engine, dying towards the nose.
    bounce = np.power(np.clip(ny, 0.0, 1.0), 4.0) * 0.26 * smoothstep(px(0.60), px(0.11), x)
    hull += bounce[..., None] * FLAME

    # ---- surface --------------------------------------------------------
    # Brushed grain along the tube, plus broad blotching, so the paint is not
    # a flat fill. Both are scaled by nz: detail crowds towards the silhouette
    # on a real cylinder, and vanishing it at the edges is what sells the round.
    grain = (value_noise(rng, h, w, h // 9, w // 40) - 0.5) * 0.010
    blotch = (value_noise(rng, h, w, 5, 26) - 0.5) * 0.009
    hull += ((grain + blotch) * nz)[..., None]

    # Scorch creeping up from the engine, and soot in the lee of the fins.
    scorch = smoothstep(px(0.42), px(0.13), x) * np.power(np.clip(ny * 0.5 + 0.5, 0, 1), 1.4)
    hull *= (1.0 - 0.45 * scorch)[..., None]
    hull += (scorch * 0.035)[..., None] * np.array([0.55, 0.34, 0.22], dtype=np.float32)

    # ---- seams, rivets, plumbing -----------------------------------------
    ink = np.zeros((h, w), dtype=np.float32)      # dark: recessed lines
    lit = np.zeros((h, w), dtype=np.float32)      # bright: raised edges

    # Circumferential joints. Each is a dark groove with a lit lip on its
    # forward side, which is what a real butt joint looks like under a key
    # light from ahead.
    for f, weight in [(0.800, 1.0), (0.560, 0.9), (0.545, 1.0), (0.500, 1.0),
                      (0.430, 0.5), (0.352, 0.5), (0.276, 0.5), (0.208, 0.9)]:
        d = x - px(f)
        ink += np.exp(-(d ** 2) / 2.2) * weight
        lit += np.exp(-((d - 1.9) ** 2) / 2.0) * weight * 0.55

    # Ribs on the interstage.
    ribs = np.exp(-((np.cos((x - px(0.50)) * (np.pi / (w * 0.0062))) - 1.0) ** 2) / 0.18)
    ink += ribs * step * 0.8

    # Longitudinal seams, which on a cylinder are hidden on the far side and
    # show up as lines at a fixed height on the flank.
    for level, weight in [(-0.42, 0.8), (0.30, 0.6), (0.66, 0.45)]:
        d = ny - level
        ink += np.exp(-(d ** 2) / 0.0022) * weight * smoothstep(px(0.83), px(0.77), x)

    # Rivets down the longest seam.
    riv = np.exp(-((ny + 0.42) ** 2) / 0.0016) * (
        0.5 + 0.5 * np.cos(x * (2 * np.pi / (w * 0.011)))
    ) ** 8
    ink += riv * 0.5 * smoothstep(px(0.80), px(0.74), x) * smoothstep(px(0.20), px(0.24), x)

    # A cable run: a raised conduit along the flank with clamps, ending in a
    # fairing at each end.
    cond = smoothstep(0.055, 0.030, np.abs(ny - 0.62)) * smoothstep(px(0.79), px(0.75), x) \
        * smoothstep(px(0.215), px(0.245), x)
    lit += cond * 0.55
    ink += smoothstep(0.030, 0.014, np.abs(ny - 0.685)) * cond * 1.4
    clamps = (0.5 + 0.5 * np.cos(x * (2 * np.pi / (w * 0.062)))) ** 14
    lit += cond * clamps * 0.9

    mask = (body > 0.5).astype(np.float32)        # never let any of it cross a fin
    hull -= (np.clip(ink, 0, 3) * 0.016 * mask)[..., None]
    hull += (np.clip(lit, 0, 3) * 0.055 * mask * nz)[..., None] * np.array(
        [0.80, 0.86, 1.00], dtype=np.float32
    )

    # Streaks trailing aft from the joints — the stain every airframe grows.
    streak = np.zeros((h, w), dtype=np.float32)
    for f in [0.800, 0.560, 0.500, 0.208]:
        streak += smoothstep(px(f), px(f - 0.075), x) * smoothstep(px(f + 0.004), px(f), x)
    streak *= value_noise(rng, h, w, h // 16, 9) * np.power(np.clip(nz, 0, 1), 0.5)
    hull *= (1.0 - 0.11 * np.clip(streak, 0, 1) * mask)[..., None]

    # ---- livery -----------------------------------------------------------
    # A white band round the shoulder of the fairing, and a thin one aft.
    band = smoothstep(px(0.716), px(0.728), x) * smoothstep(px(0.766), px(0.754), x)
    band = np.clip(band, 0, 1) * mask
    hull = lerp(hull, WHITE, band * (0.10 + 0.90 * np.power(np.clip(nz, 0, 1), 0.9)))

    # ---- fins -------------------------------------------------------------
    # A plate seen nearly edge-on: dark face, a lit leading edge with visible
    # thickness, a darker trailing edge, and a spar shadow across the middle.
    face = np.zeros((h, w, 3), dtype=np.float32)
    face += np.array([0.026, 0.028, 0.036], dtype=np.float32)[None, None, :]
    face += (smoothstep(0.0, 1.0, s) * 0.010)[..., None]            # tip catches more
    edge = smoothstep(3.4, 0.0, np.abs(x - lead))
    face += (edge * 0.46)[..., None] * np.array([0.62, 0.74, 1.00], dtype=np.float32)
    face += (smoothstep(6.5, 3.4, np.abs(x - lead)) * 0.06)[..., None]      # thickness
    face -= (smoothstep(4.0, 0.0, np.abs(x - trail)) * 0.012)[..., None]
    face += (np.exp(-((x - (lead + trail) * 0.5) ** 2) / (px(0.006) ** 2)) * 0.020)[..., None]
    # Outer rim of the top fin against the sky, warm bounce on the bottom one.
    face += (np.power(s, 8.0) * 0.16 * (dy < 0))[..., None] * RIM
    face += (np.power(s, 3.0) * 0.10 * (dy > 0))[..., None] * FLAME
    face *= (1.0 - 0.35 * smoothstep(px(0.30), px(0.14), x))[..., None]     # soot aft
    hull = np.where(((fin > 0.5) & (body < 0.5))[..., None], face, hull)

    # ---- engine bell ------------------------------------------------------
    # Regeneratively cooled: vertical tube striations, cold metal at the throat
    # end and glowing where the flame washes it.
    stri = 0.5 + 0.5 * np.cos(dy * (2 * np.pi / (h * 0.030)))
    heat = smoothstep(bell_a, bell_f, x)
    bell_col = np.zeros((h, w, 3), dtype=np.float32)
    bell_col += np.array([0.050, 0.054, 0.068], dtype=np.float32)[None, None, :]
    bell_col += ((stri ** 2) * 0.045)[..., None] * np.array([0.80, 0.84, 0.95], dtype=np.float32)
    bell_col += (np.power(np.clip(-ny * 0.9, 0, 1), 6.0) * 0.30)[..., None] * RIM
    bell_col += (heat * 0.34)[..., None] * FLAME
    bell_col += (smoothstep(bell_f - 3.0, bell_f, x) * 0.25)[..., None]     # lit throat lip
    hull = np.where(((bell > 0.5) & (body < 0.5))[..., None], bell_col, hull)

    rgb = np.clip(hull, 0.0, 1.0)

    # ---- the name ---------------------------------------------------------
    # Drawn last, straight onto the hull, then dimmed by the same cylinder term
    # so it curves away with the surface rather than sitting on top like a
    # sticker, and dirtied by the streaks so it belongs to the paint.
    # Sizes here are set by what survives the trip to the screen, not by what
    # looks balanced in the sprite. This picture ends up about a hundred pixels
    # tall on the page, so a wordmark at a tasteful tenth of the hull's height
    # arrives as four pixels of grey mush — which is what it was doing, and why
    # a ship covered in panel seams and rivets read as a bare dark sliver.
    # Both marks are deliberately enormous: the name is most of the tube's
    # diameter and the roundel very nearly spans it. It looks overbearing at
    # this magnification and reads as a marked ship at the size anyone sees it.
    marks = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(marks)

    # The roundel, on the forward tank where a real vehicle carries its
    # operator's mark: a heavy ring with an M inside it.
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

    # The name, letterspaced down the flank.
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

    lab = np.asarray(marks, dtype=np.float32) / 255.0
    if mirror_text:
        lab = lab[:, ::-1]
    lab *= np.power(np.clip(nz, 0, 1), 0.80)          # wraps with the tube
    lab *= mask * (1.0 - 0.30 * np.clip(streak, 0, 1))
    rgb = lerp(rgb, np.array([0.97, 0.98, 1.00], dtype=np.float32), lab * 0.99)

    return np.concatenate([rgb, alpha[..., None]], axis=2)


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
