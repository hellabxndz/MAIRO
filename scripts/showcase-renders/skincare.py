import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

s = reset(); size(800, 1000)

amber = glass("amber", (0.55, 0.22, 0.05), rough=0.03, ior=1.5)
frost = glass("frost", (0.95, 0.93, 0.92), rough=0.28, ior=1.45)
serum = mat("serum", (0.9, 0.62, 0.30), rough=0.0, **{"Transmission Weight": 1.0, "IOR": 1.36})
black = mat("rubber", (0.02, 0.02, 0.02), rough=0.55)
white = mat("pp", (0.85, 0.82, 0.79), rough=0.35, **{"Subsurface Weight": 0.15})
label = mat("label", (0.80, 0.74, 0.66), rough=0.8)
gold = mat("gold", (0.85, 0.66, 0.38), rough=0.25, metal=1.0)
oak = mat("lid", (0.40, 0.26, 0.15), rough=0.55)

# a travertine plinth
plinth = lathe("plinth", [(0.0, 0.0), (0.16, 0.0), (0.16, 0.10), (0.0, 0.10)], stone("trav", (0.72, 0.63, 0.52), scale=6, contrast=0.35), sub=0)
cyl("plinthR", (0, 0, 0.05), 0.20, 0.10, stone("trav2", (0.72, 0.63, 0.52), scale=6, contrast=0.35), verts=128, bevel=0.004)
plinth.hide_render = True
top = 0.10

# 1 — amber dropper bottle with serum, black bulb and a gold collar
lathe("amberB", [(0.0, top + 0.001), (0.036, top + 0.001), (0.038, top + 0.006), (0.038, top + 0.095), (0.034, top + 0.108),
                 (0.014, top + 0.118), (0.013, top + 0.128), (0.0, top + 0.128)], amber, loc=(-0.06, -0.05, 0))
lathe("serumL", [(0.0, top + 0.006), (0.0345, top + 0.006), (0.0345, top + 0.072), (0.0, top + 0.072)], serum, loc=(-0.06, -0.05, 0))
lathe("collar", [(0.0, top + 0.127), (0.017, top + 0.127), (0.017, top + 0.146), (0.0, top + 0.146)], gold, loc=(-0.06, -0.05, 0))
lathe("bulb", [(0.0, top + 0.146), (0.011, top + 0.146), (0.012, top + 0.165), (0.010, top + 0.182), (0.0, top + 0.188)], black, loc=(-0.06, -0.05, 0))
lathe("labelA", [(0.0386, top + 0.030), (0.0386, top + 0.072)], label, loc=(-0.06, -0.05, 0), sub=0)

# 2 — a tall frosted pump bottle
lathe("pumpB", [(0.0, 0.0011), (0.030, 0.0011), (0.032, 0.006), (0.032, 0.190), (0.028, 0.200), (0.012, 0.206), (0.0, 0.206)], frost, loc=(0.07, 0.07, top))
lathe("pumpLiquid", [(0.0, 0.006), (0.0295, 0.006), (0.0295, 0.15), (0.0, 0.15)], mat("lotion", (0.93, 0.90, 0.86), rough=0.3, **{"Subsurface Weight": 0.6}), loc=(0.07, 0.07, top))
lathe("pumpCap", [(0.0, 0.205), (0.016, 0.205), (0.016, 0.228), (0.009, 0.230), (0.009, 0.245), (0.0, 0.245)], white, loc=(0.07, 0.07, top))
cube("nozzle", (0.07 + 0.022, 0.07, top + 0.240), (0.04, 0.012, 0.010), white, bevel=0.003)

# 3 — a low jar with an oak lid, on the paper in front
lathe("jar", [(0.0, 0.0011), (0.040, 0.0011), (0.044, 0.006), (0.044, 0.040), (0.040, 0.046), (0.0, 0.046)], white, loc=(0.10, -0.22, 0))
lathe("jarLid", [(0.0, 0.045), (0.045, 0.045), (0.046, 0.050), (0.046, 0.064), (0.043, 0.067), (0.0, 0.067)], oak, loc=(0.10, -0.22, 0))

ink = mat('ink', (0.08, 0.07, 0.06), rough=0.6)
text('LUMEN', (-0.06, -0.05 - 0.0392, top + 0.058), 0.0105, ink, spacing=1.25)
text('BOTANICS  ·  NIGHT SERUM', (-0.06, -0.05 - 0.0392, top + 0.043), 0.0036, ink, spacing=1.1)
text('LUMEN', (0.07, 0.07 - 0.0328, top + 0.11), 0.010, mat('ink2', (0.30, 0.28, 0.26), rough=0.6), rot=(math.pi / 2, 0, 0), spacing=1.25)
paper_sweep((0.58, 0.44, 0.38), width=3, depth=2.5, height=2.0, radius=0.5, y=0.35)

area("key", (-1.0, -0.4, 1.0), (0, 0, 0.12), 30, 0.9, (1.0, 0.95, 0.9))
area("rim", (0.7, 0.8, 0.7), (0, 0, 0.12), 14, 0.6, (1.0, 0.97, 0.94))
area("fill", (0.9, -1.0, 0.5), (0, 0, 0.12), 5, 1.5)
world((0.9, 0.9, 0.95), 0.1)

cam = camera((0.03, -1.25, 0.40), (0.02, 0.0, 0.20), lens=70, fstop=4)
finish(os.environ.get("NAME", "skincare"), exposure=-0.4)
