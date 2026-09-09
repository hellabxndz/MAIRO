// The galaxy itself, generated once as GPU vertex data.
//
// Everything here runs on the CPU exactly once, at start-up, and then never
// again: the result is a few interleaved Float32Arrays that go straight into
// vertex buffers. From then on a frame is three draw calls, and the cost stops
// depending on how many stars there are.
//
// The shape is a barred logarithmic spiral, which is what the Milky Way is.
// The arms are not drawn as curves — stars are scattered around a spiral locus
// with a scatter width that varies along it, so the arms have soft, fraying
// edges and the gaps between them are populated but sparse. Drawing crisp arms
// is the single fastest way to make a galaxy look like a logo.

export type StarBuffers = {
  /** x,y,z, r,g,b, brightness, seed — 8 floats per star. */
  stars: Float32Array;
  starCount: number;
  /** Same layout. A handful of other galaxies, very far out. */
  distant: Float32Array;
  distantCount: number;
  /** x,y,z, r,g,b, size, seed. Positions are camera-relative and wrap. */
  motes: Float32Array;
  moteCount: number;
};

const FLOATS = 8;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Box–Muller, for the scatter around the arms. */
function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-7);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/**
 * Approximate sRGB for a blackbody at `t` kelvin, normalised to equal
 * luminance.
 *
 * Normalising is the point: brightness is a separate attribute, sampled from a
 * power law. If colour carried luminance too, every cool star would disappear
 * and the field would be uniformly blue — the opposite of the real sky, where
 * the overwhelming majority of stars are cooler than the sun.
 */
function blackbody(t: number, out: number[]): void {
  const x = Math.min(Math.max(t, 1700), 40000) / 100;
  let r: number, g: number, b: number;

  if (x <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(x) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(x - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(x - 60, -0.0755148492);
  }
  if (x >= 66) b = 255;
  else if (x <= 19) b = 0;
  else b = 138.5177312231 * Math.log(x - 10) - 305.0447927307;

  r = Math.min(Math.max(r, 0), 255) / 255;
  g = Math.min(Math.max(g, 0), 255) / 255;
  b = Math.min(Math.max(b, 0), 255) / 255;

  const lum = Math.max(0.2126 * r + 0.7152 * g + 0.0722 * b, 1e-3);
  out[0] = r / lum;
  out[1] = g / lum;
  out[2] = b / lum;
}

export const GALAXY = {
  /** Where the disc effectively ends. Everything else is scaled off this. */
  radius: 1000,
  /** Exponential scale length of the disc. */
  scaleLength: 285,
  /** Half-thickness at the centre; the disc flares outwards from here. */
  thickness: 26,
  /** Radius of the central bulge. */
  bulge: 135,
  arms: 2,
  /** Winding. Smaller is more tightly wound. */
  pitch: 0.235,
};

/**
 * Radius sampled from an exponential disc, by inverting the cumulative
 * distribution numerically over a coarse table. Cheap, and exact enough that
 * nothing about the result reads as tabulated.
 */
function sampleRadius(r: () => number): number {
  const { radius, scaleLength } = GALAXY;
  // Rejection against exp(-r/h) * r, the surface density times the annulus area.
  for (let i = 0; i < 24; i++) {
    const x = r() * radius;
    const p = (x / scaleLength) * Math.exp(-x / scaleLength) * Math.E;
    if (r() < p) return x;
  }
  return r() * radius * 0.6;
}

function buildGalaxyStars(count: number, seed: number): Float32Array {
  const r = rng(seed);
  const data = new Float32Array(count * FLOATS);
  const rgb = [1, 1, 1];
  const { radius, thickness, bulge, arms, pitch } = GALAXY;

  const nBulge = Math.round(count * 0.12);
  // Two spherical populations, not one. The halo hugs the galaxy; the field is
  // an order of magnitude further out and exists so that wherever the camera
  // gets to, and whichever way it turns, there is a faint sky behind the
  // subject. Without it every shot that is not pointing at the disc is black.
  const nHalo = Math.round(count * 0.07);
  const nField = Math.round(count * 0.11);
  const nDisc = count - nBulge - nHalo - nField;

  let o = 0;

  // ---- disc and arms ----
  for (let i = 0; i < nDisc; i++) {
    const rad = sampleRadius(r);
    const t = rad / radius;

    // Which arm, and how far around it. The logarithmic spiral: theta grows
    // with the log of the radius.
    const arm = Math.floor(r() * arms);
    const spiral = Math.log(Math.max(rad, 40) / 40) / pitch;
    // Arms are tight near the core and fray towards the rim, and about a fifth
    // of disc stars ignore the arms entirely so the gaps are never empty.
    const inArm = r() > 0.22;
    const scatter = inArm ? (0.16 + t * 0.42) * gauss(r) : (r() * 2 - 1) * Math.PI;
    const theta = spiral + (arm * 2 * Math.PI) / arms + scatter;

    // A bar through the middle: inside the bulge radius the orbits are
    // stretched along one axis, which is what gives the core its shape.
    const barPull = Math.max(0, 1 - rad / (bulge * 2.4));
    const ex = 1 + barPull * 0.85;
    const ey = 1 - barPull * 0.34;

    const x = Math.cos(theta) * rad * ex;
    const z = Math.sin(theta) * rad * ey;
    // The disc flares: thin in the middle, thicker at the edge.
    const h = thickness * (0.55 + t * 1.9);
    const y = gauss(r) * h * 0.5;

    // Young blue stars live in the arms; the smooth disc between them is older
    // and yellower. Making that correlate with the arms is most of what reads
    // as structure once the picture is in colour rather than in grey.
    const hot = inArm ? r() < 0.30 : r() < 0.06;
    const temp = hot ? 8000 + r() * 16000 : 2900 + Math.pow(r(), 1.7) * 4200;
    blackbody(temp, rgb);

    // Power law: mostly faint, a few obvious.
    const bright = 0.10 + Math.pow(r(), 5.0) * 2.6;

    data[o++] = x; data[o++] = y; data[o++] = z;
    data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
    data[o++] = bright * (hot ? 1.5 : 1);
    data[o++] = r();
  }

  // ---- bulge ----
  for (let i = 0; i < nBulge; i++) {
    // r^(1/3) of a uniform gives a uniform sphere; raising the power further
    // concentrates it towards the centre, which is what a bulge does.
    const rad = bulge * Math.pow(r(), 0.55);
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    blackbody(3100 + Math.pow(r(), 2) * 2600, rgb);
    data[o++] = Math.cos(phi) * s * rad * 1.5;
    data[o++] = u * rad * 0.62;
    data[o++] = Math.sin(phi) * s * rad;
    data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
    data[o++] = 0.16 + Math.pow(r(), 4.2) * 2.2;
    data[o++] = r();
  }

  // ---- halo ----
  for (let i = 0; i < nHalo; i++) {
    const rad = radius * (0.35 + Math.pow(r(), 0.4) * 1.15);
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    blackbody(3000 + Math.pow(r(), 2.4) * 3500, rgb);
    data[o++] = Math.cos(phi) * s * rad;
    data[o++] = u * rad * 0.72;
    data[o++] = Math.sin(phi) * s * rad;
    data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
    data[o++] = 0.07 + Math.pow(r(), 5.5) * 1.1;
    data[o++] = r();
  }

  // ---- outer field ----
  for (let i = 0; i < nField; i++) {
    const rad = radius * (2.6 + Math.pow(r(), 0.55) * 11.0);
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    blackbody(2900 + Math.pow(r(), 1.8) * 9000, rgb);
    data[o++] = Math.cos(phi) * s * rad;
    data[o++] = u * rad;
    data[o++] = Math.sin(phi) * s * rad;
    data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
    // Bright in absolute terms because they are a very long way away; the
    // inverse-square falloff in the shader is what makes them faint on screen.
    data[o++] = 22.0 + Math.pow(r(), 3.0) * 260.0;
    data[o++] = r();
  }

  // Shuffled so that any prefix of the buffer is a fair sample of the whole
  // galaxy. That is what lets a weaker device draw the first 40% of the array
  // and get a thinner version of the same shape rather than a bulge with no
  // arms attached to it.
  const stride = FLOATS;
  const tmp = new Float32Array(stride);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    tmp.set(data.subarray(i * stride, i * stride + stride));
    data.copyWithin(i * stride, j * stride, j * stride + stride);
    data.set(tmp, j * stride);
  }

  return data;
}

/** Other galaxies, scattered far outside our own. */
function buildDistant(count: number, seed: number): Float32Array {
  const r = rng(seed);
  const data = new Float32Array(count * FLOATS);
  const rgb = [1, 1, 1];
  let o = 0;
  for (let i = 0; i < count; i++) {
    const rad = GALAXY.radius * (3.2 + r() * 9);
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    blackbody(4200 + r() * 4200, rgb);
    data[o++] = Math.cos(phi) * s * rad;
    data[o++] = u * rad;
    data[o++] = Math.sin(phi) * s * rad;
    data[o++] = rgb[0]; data[o++] = rgb[1]; data[o++] = rgb[2];
    data[o++] = 0.5 + r() * 2.4;
    data[o++] = r();
  }
  return data;
}

/**
 * The nearest layer: dust motes drifting within a few units of the camera.
 *
 * Their positions are camera-relative and wrap inside a small box, so there are
 * always some very close no matter where the camera has travelled to. They are
 * the only reason the scene reads as a space you are inside rather than a
 * picture you are looking at — everything else is thousands of units away and
 * barely shifts.
 */
function buildMotes(count: number, seed: number): Float32Array {
  const r = rng(seed);
  const data = new Float32Array(count * FLOATS);
  let o = 0;
  for (let i = 0; i < count; i++) {
    data[o++] = r() * 2 - 1;
    data[o++] = r() * 2 - 1;
    data[o++] = r() * 2 - 1;
    const warm = r() < 0.25;
    data[o++] = warm ? 1.0 : 0.74;
    data[o++] = warm ? 0.88 : 0.80;
    data[o++] = warm ? 0.74 : 1.0;
    data[o++] = 0.25 + Math.pow(r(), 2.4) * 1.5;
    data[o++] = r();
  }
  return data;
}

export function buildGalaxy(starCount: number): StarBuffers {
  const distantCount = 70;
  const moteCount = 900;
  return {
    stars: buildGalaxyStars(starCount, 0x5eed1234),
    starCount,
    distant: buildDistant(distantCount, 0x1337c0de),
    distantCount,
    motes: buildMotes(moteCount, 0xbeefcafe),
    moteCount,
  };
}

export const STAR_STRIDE = FLOATS;
