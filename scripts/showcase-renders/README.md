# Showcase product renders

The pictures on the homepage's creative showcase (`public/showcase/*.jpg`,
listed in `src/components/home/showcase-photos.ts`) are 3D product renders
made with Blender's Python module. They are not photographs, and every brand
in them is fictional.

One script per card:

- `fashion.py`: folded overshirts.
- `skincare.py`: serum, pump bottle and jar.
- `fitness.py`: dumbbells and a bottle.
- `local.py`: pipes under a sink.
- `luxury.py`: ring in a box.
- `realestate.py`: keys and a house tag.
- `online.py`: ceramics and a gift box.
- `furniture.py`: sofa in afternoon sun.
- `services.py`: statement, calculator and pen.

`biz.py` makes the three example businesses' pictures
(`public/showcase/examples/`), which every plan mock-up, the walkthrough and
the product clips show through `BusinessArt`. Pick one with `SCENE=`:
- `shop-demo`, `shop-problem`, `shop-offer`: Fernleaf Ceramics;
- `service-demo`, `service-problem`, `service-offer`: Brightwater Plumbing;
- `salon-demo`, `salon-problem`, `salon-offer`: Juniper Hair Studio.

Before rendering `salon-problem`, capture `booking.html` at 340×730 as
`booking.png`; that's the phone's screen. After changing any example picture,
re-record the clips with `video/render.mjs`.

`studio.py`, `kit.py` and `pieces.py` hold the shared lighting, materials and
shapes.

## Re-render one picture

```sh
python3 -m venv venv && ./venv/bin/pip install bpy   # Blender 5.0's module, Python 3.11
SAMPLES=128 ./venv/bin/python fashion.py               # writes out/fashion.png
ffmpeg -i out/fashion.png -q:v 3 ../../public/showcase/fashion.jpg
SCENE=shop-demo NAME=shop-demo ./venv/bin/python biz.py   # an example business picture
ffmpeg -i out/shop-demo.png -vf scale=960:-2 -q:v 3 ../../public/showcase/examples/shop-demo.jpg
```

`SAMPLES=24 PCT=50` gives a quick draft. Each final render takes about two to
three minutes on four CPU cores.
