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

`studio.py` and `kit.py` hold the shared lighting, materials and shapes.

## Re-render one picture

```sh
python3 -m venv venv && ./venv/bin/pip install bpy   # Blender 5.0's module, Python 3.11
SAMPLES=128 ./venv/bin/python fashion.py               # writes out/fashion.png
ffmpeg -i out/fashion.png -q:v 3 ../../public/showcase/fashion.jpg
```

`SAMPLES=24 PCT=50` gives a quick draft. Each final render takes about two to
three minutes on four CPU cores.
