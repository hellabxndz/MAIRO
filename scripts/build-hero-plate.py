"""
Turn the reference render into a scene plate.

The render has the whole interface baked into it — nav, headline, four cards,
the bottom strip. Shipping it as-is would mean shipping a picture of a website:
no selectable text, no working links, nothing that reflows on a phone. So the
interface is painted out and only the scene is kept — sky, stars, rock, floor,
platform, the core and the light streams — and the real HTML goes on top.

The fill is a row median, not a diffusion inpaint. Diffusion was the obvious
first choice and it was wrong here: the card holes are ~350px wide, and
diffusing colour that far leaves a pale grey blob that reads as a rectangle of
fog exactly where a card used to be. This scene is close to horizontally
uniform — sky is sky all the way across at a given height, floor is floor — so
taking the median of the frame's outer margins at each height, and painting that
into the hole, reconstructs something much closer to what the render would have
had behind the card. The masked span is then smoothed horizontally so the join
is not a vertical seam.
"""
from PIL import Image, ImageFilter
import numpy as np
import os

SRC = "/root/.claude/uploads/6827da9e-f4fa-55b6-9cf7-cc90f0382180/ce7674b5-image.png"
OUT = "/home/user/MAIRO/public/hero/scene.webp"

# Every region of the render that is interface rather than scene.
BOXES = [
    (0, 0, 1448, 86),          # nav
    (325, 92, 1125, 382),      # eyebrow, headline, subhead, both CTAs
    (60, 128, 285, 200),       # "ideas to impact"
    (1170, 128, 1390, 200),    # "higher returns"
    (26, 196, 384, 526),       # Creative AI
    (26, 526, 384, 804),       # Campaign AI
    (1064, 241, 1422, 522),    # Audience AI
    (1064, 526, 1422, 804),    # Optimization AI
    (458, 396, 560, 460),      # "one ai core"
    (942, 441, 1052, 494),     # "real brands"
    (542, 848, 906, 902),      # "ads performance compounded by ai"
    (70, 848, 280, 912),       # "built for today / ready for what's next"
    (1140, 848, 1400, 912),    # "scalable ads / a brighter tomorrow"
    (0, 934, 1448, 1086),      # the trusted-by strip
]

src = Image.open(SRC).convert("RGB")
W, H = src.size
arr = np.asarray(src).astype(np.float32)

mask = np.zeros((H, W), dtype=bool)
for x0, y0, x1, y1 in BOXES:
    mask[max(0, y0):min(H, y1), max(0, x0):min(W, x1)] = True

# The sample band: the outer 26px of each edge.
#
# Sampling the whole row was the second wrong answer. At the heights where the
# core sits, most of the unmasked pixels in a row ARE the core, so the median
# came back bright and every card hole filled with a pale horizontal stripe.
# The outer margins are the only part of the frame that is scene at every
# height — rock, sky, floor, never the core — so they give the true ambient
# value for that height.
EDGE = np.zeros(W, dtype=bool)
EDGE[:26] = True
EDGE[-26:] = True

filled = arr.copy()


def ambient(y: int):
    """The scene's colour at this height, or None if this row is all interface."""
    usable = EDGE & ~mask[y]
    if usable.sum() < 8:
        return None
    return np.median(arr[y][usable], axis=0)


# Precompute per row, borrowing from the nearest usable row where a band of the
# frame (the nav, the strip) is interface all the way across.
amb = [ambient(y) for y in range(H)]
for y in range(H):
    if amb[y] is None:
        step = -1 if y > H // 2 else 1
        probe = y + step
        while 0 <= probe < H and amb[probe] is None:
            probe += step
        amb[y] = amb[probe] if 0 <= probe < H else np.array([4.0, 6.0, 14.0])

for y in range(H):
    if mask[y].any():
        filled[y, mask[y]] = amb[y]

out = Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8))

# Soften only inside the mask, so the flat median picks up some of the grain of
# the render and the boundary stops being a visible straight edge.
soft = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(16))
out = Image.composite(out.filter(ImageFilter.GaussianBlur(9)), out, soft)
# and a last very soft pass over everything, to marry the two
out = Image.composite(out.filter(ImageFilter.GaussianBlur(2)), out, soft)

out.save(OUT, "WEBP", quality=88, method=6)
print(f"wrote {OUT}  {os.path.getsize(OUT)/1024:.0f} KB  {out.size}")

# A second, tighter plate for phones.
#
# The wide plate is mostly sky and rock, because at 1448 the interface fills
# that space. On a phone there is no interface out there — the cards are stacked
# underneath — so the same plate reads as a large empty rectangle with a small
# core at the bottom of it. This crop keeps the core, its creatives, the
# platform and the reflection, and throws away the room that only existed to
# hold the desktop layout.
NARROW_OUT = "/home/user/MAIRO/public/hero/scene-narrow.webp"
narrow = out.crop((346, 342, 1102, 1024))
narrow.save(NARROW_OUT, "WEBP", quality=88, method=6)
print(f"wrote {NARROW_OUT}  {os.path.getsize(NARROW_OUT)/1024:.0f} KB  {narrow.size}")
