// The WebGL2 renderer behind the site.
//
// No Three.js. The scene is three point clouds, one raymarched volume and a
// four-pass composite, and a general-purpose engine would add something like
// 150KB of gzipped JavaScript to a page whose entire pitch is that it feels
// fast. Everything here is written against the GL API directly, which is more
// code once and less of everything afterwards.
//
// The other reason is control. All of the quality in this scene lives in the
// shaders and in the way the passes are wired together, and the parts worth
// tuning — the extinction taps in the vertex shader, the step count in the
// volume, the exact stretch in the composite — are not things a scene graph
// exposes.

import { buildNoiseVolume, NOISE_SIZE } from "./noise";
import { buildGalaxy, STAR_STRIDE, type StarBuffers } from "./stars";
import {
  STAR_VERT, STAR_FRAG, MOTE_VERT, MOTE_FRAG, PLANET_VERT, PLANET_FRAG,
  TRAVELLER_VERT, TRAVELLER_FRAG,
  FULLSCREEN_VERT, VOLUME_FRAG, BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG, COPY_FRAG,
} from "./shaders";

// ---------------------------------------------------------------------------
// Small matrix helpers. Column-major, like GL wants them.
// ---------------------------------------------------------------------------

type Mat4 = Float32Array;

function mat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function perspective(out: Mat4, fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function lookAt(out: Mat4, eye: number[], centre: number[], up: number[]): Mat4 {
  let zx = eye[0] - centre[0], zy = eye[1] - centre[1], zz = eye[2] - centre[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function invert(out: Mat4, m: Mat4): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return out;
  det = 1 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

// ---------------------------------------------------------------------------
// The journey
// ---------------------------------------------------------------------------

/**
 * Where the camera is at each point of the page.
 *
 * Scroll does not move a background; it moves the observer. These are the
 * stops: outside the galaxy looking at the whole of it, then down into the
 * disc, through a dust lane, out into a brighter region, in towards the core,
 * and finally a long pull backwards that puts the whole journey in one frame.
 */
const PATH: Array<{ at: number; eye: [number, number, number]; look: [number, number, number] }> = [
  // The hero is deliberately close and low, so the disc runs off both edges of
  // the frame. A galaxy framed whole reads as an object on a slide; one that
  // overflows the viewport reads as somewhere you are.
  // Distance from the core falls monotonically until the very end. That is
  // what makes scrolling read as one continuous approach rather than a camera
  // wandering about at a fixed radius — which is what the first version did,
  // and why the first half of the page all looked like the same shot.
  { at: 0.00, eye: [ 470,  205,  600], look: [-230,  -95, -260] },
  { at: 0.18, eye: [ 380,  158,  505], look: [-200,  -55, -220] },
  { at: 0.38, eye: [ 300,   98,  430], look: [-180,    6, -160] },
  // Down in the plane, looking along it. This is the shot everyone actually
  // means by "the Milky Way" — the band arcing across the sky with the rift
  // down the middle of it — and it only exists if the camera gets low enough
  // to be inside the disc rather than looking down on it.
  { at: 0.58, eye: [ 150,   17,  250], look: [-260,   12,  -95] },
  { at: 0.76, eye: [-120,   28,  130], look: [ -20,    2,  -40] },
  { at: 0.86, eye: [ -48,   16,   62], look: [   6,    0,  -10] },
  // Out, so the page shows how far the journey went...
  { at: 0.94, eye: [ 900, 1050, 2050], look: [   0,    0,    0] },
  // ...and then round onto Earth, which has been sitting off to one side of
  // that shot the whole time, a small disc near the edge of the frame. The
  // camera does not reverse to find it — turning a hundred and eighty degrees
  // in the last few per cent of the page would be a lurch. It is already in
  // view; the ending just goes to it.
  // Ninety-two units from a world fifty-five across, so it overfills the frame
  // and the United States is most of what is left in it.
  { at: 1.00, eye: [1272,  812, 1330], look: [1312,  786, 1251] },
];

/** Catmull–Rom through the stops, so the camera never changes direction sharply. */
function sampleSpline(p: number, key: "eye" | "look", out: number[]): void {
  const n = PATH.length;
  let i = 0;
  while (i < n - 2 && p > PATH[i + 1].at) i++;
  const a = PATH[Math.max(i - 1, 0)];
  const b = PATH[i];
  const c = PATH[Math.min(i + 1, n - 1)];
  const d = PATH[Math.min(i + 2, n - 1)];

  const span = Math.max(c.at - b.at, 1e-4);
  const t = Math.min(Math.max((p - b.at) / span, 0), 1);
  const t2 = t * t;
  const t3 = t2 * t;

  for (let k = 0; k < 3; k++) {
    const p0 = a[key][k], p1 = b[key][k], p2 = c[key][k], p3 = d[key][k];
    out[k] =
      0.5 *
      ((2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
}

/**
 * The worlds you pass on the way in.
 *
 * Positioned in the camera's own frame at a point on the journey rather than
 * in absolute coordinates: `at` picks the moment, `fwd` is how far down the
 * road it sits, and `right`/`up` push it off to one side of the frame. Placing
 * them in world coordinates by hand meant guessing where the camera would be
 * looking and getting it wrong; this way a planet put slightly left and a long
 * way ahead is exactly that, and stays that way if the path is retimed.
 *
 * They are kept out of the middle of the frame and mostly on the side the type
 * is not on. A planet is an event, and one parked over a headline is a
 * mistake.
 */
type Planet = {
  /** Placed in the camera's frame at this point on the journey... */
  at?: number;
  right?: number;
  up?: number;
  fwd?: number;
  /** ...or at an absolute world position, for one that has to be somewhere exact. */
  world?: readonly [number, number, number];
  radius: number;
  color: readonly [number, number, number];
  seed: number;
  /** 0 rocky, 1 gas giant, 2 Earth. */
  kind: 0 | 1 | 2;
  /** Index into the surface atlas rendered by scripts/render-planets.py. */
  layer?: number;
  /**
   * Latitude and longitude that should be turned towards the camera at `faceAt`.
   *
   * Only Earth uses it, and it is the whole reason the ending works: the
   * planet is oriented so that the middle of the United States is the part
   * facing the viewer when the camera arrives, rather than whichever ocean
   * happened to be pointing that way.
   */
  face?: readonly [number, number];
  faceAt?: number;
};

const PLANETS: readonly Planet[] = [
  // Hero: low and to the right, in front of the galaxy's glow rather than in
  // the dark corner where the type is. The first placement was on the left,
  // and it rendered correctly and was still invisible — the scrim that keeps
  // the headline legible sits at sixty per cent opacity over exactly that part
  // of the frame and took the planet down with it.
  { at: 0.02, right: 95, up: -52, fwd: 132, radius: 22, color: [0.40, 0.47, 0.60], seed: 0.21, kind: 0, layer: 0 },
  // A rusty one drifting past on the right as the descent starts.
  { at: 0.26, right: 62, up: 20, fwd: 105, radius: 8, color: [0.66, 0.40, 0.28], seed: 0.34, kind: 0, layer: 1 },
  // A banded giant, close, once the camera is down among the arms.
  //
  // Everything here is kept to the right of frame and below the headline. The
  // type lives in the left third of every section on this page, and a planet
  // is worth nothing if it is sitting behind a sentence — the first placement
  // put this one directly across "without the expert".
  { at: 0.47, right: 74, up: -60, fwd: 84, radius: 17, color: [0.74, 0.64, 0.47], seed: 0.82, kind: 1, layer: 2 },
  // Small and pale, passing quickly.
  { at: 0.66, right: 26, up: -11, fwd: 40, radius: 4.5, color: [0.54, 0.60, 0.72], seed: 0.44, kind: 0, layer: 3 },
  // An icy one near the core, lit hard from one side.
  { at: 0.82, right: 24, up: -6, fwd: 28, radius: 5.0, color: [0.78, 0.76, 0.70], seed: 0.69, kind: 0, layer: 4 },
  // A second giant, seen during the pull-back.
  { at: 0.94, right: 210, up: -120, fwd: 620, radius: 46, color: [0.52, 0.46, 0.62], seed: 0.61, kind: 1, layer: 5 },

  // And Earth, at a fixed point outside the galaxy. Fixed rather than placed
  // against the path because the last two camera keyframes are positioned
  // around it, and a planet whose position depends on the camera that is
  // aiming at it is a circle with nowhere to start.
  {
    world: [1312, 786, 1251],
    radius: 55,
    color: [1, 1, 1],
    seed: 0.5,
    kind: 2,
    // The geographic centre of the contiguous United States.
    face: [39.5, -98.35],
    faceAt: 1.0,
  },
];

/** centre(3) radius(1) colour(3) seed(1) orientation(4) kind(1) layer(1). */
const PLANET_STRIDE = 14;

/** The camera's own axes at a point on the path. */
function cameraFrame(at: number) {
  const eye: number[] = [0, 0, 0];
  const look: number[] = [0, 0, 0];
  sampleSpline(at, "eye", eye);
  sampleSpline(at, "look", look);

  let fx = look[0] - eye[0], fy = look[1] - eye[1], fz = look[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  // right = forward x worldUp, then up = right x forward. The same basis the
  // view matrix builds, so "right" here means right on screen.
  let rx = -fz, ry = 0, rz = fx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;

  return {
    eye,
    f: [fx, fy, fz] as const,
    r: [rx, ry, rz] as const,
    u: [ry * fz - rz * fy, rz * fx - rx * fz, rx * fy - ry * fx] as const,
  };
}

function norm(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: readonly number[], b: readonly number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * A rotation that turns the planet-space point at (lat, lon) towards world
 * direction `D`, keeping the planet's north pole as close to `U` as it can.
 *
 * Both frames are built as orthonormal triples — the point, the component of
 * north perpendicular to it, and their cross product — and the rotation is the
 * one that carries the first onto the second. Two spin angles could not do
 * this: they would aim the right place at the camera and leave the pole
 * wherever it fell, and a tilted Earth reads as a mistake rather than a choice.
 */
function orientation(latDeg: number, lonDeg: number, D: number[], U: number[]): number[] {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const P = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];

  const north = [0, 1, 0];
  const e1 = norm(P);
  const dotN = north[0] * e1[0] + north[1] * e1[1] + north[2] * e1[2];
  const e2 = norm([north[0] - e1[0] * dotN, north[1] - e1[1] * dotN, north[2] - e1[2] * dotN]);
  const e3 = cross(e1, e2);

  const f1 = norm(D);
  const dotU = U[0] * f1[0] + U[1] * f1[1] + U[2] * f1[2];
  const f2 = norm([U[0] - f1[0] * dotU, U[1] - f1[1] * dotU, U[2] - f1[2] * dotU]);
  const f3 = cross(f1, f2);

  // R = F * E^T, in row-major 3x3.
  const m: number[][] = [];
  for (let i = 0; i < 3; i++) {
    m.push([0, 1, 2].map((j) => f1[i] * e1[j] + f2[i] * e2[j] + f3[i] * e3[j]));
  }

  // Matrix to quaternion, branching on the largest diagonal term so the square
  // root is never taken of something near zero.
  const tr = m[0][0] + m[1][1] + m[2][2];
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const sq = Math.sqrt(tr + 1) * 2;
    w = 0.25 * sq;
    x = (m[2][1] - m[1][2]) / sq;
    y = (m[0][2] - m[2][0]) / sq;
    z = (m[1][0] - m[0][1]) / sq;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const sq = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    w = (m[2][1] - m[1][2]) / sq;
    x = 0.25 * sq;
    y = (m[0][1] + m[1][0]) / sq;
    z = (m[0][2] + m[2][0]) / sq;
  } else if (m[1][1] > m[2][2]) {
    const sq = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    w = (m[0][2] - m[2][0]) / sq;
    x = (m[0][1] + m[1][0]) / sq;
    y = 0.25 * sq;
    z = (m[1][2] + m[2][1]) / sq;
  } else {
    const sq = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    w = (m[1][0] - m[0][1]) / sq;
    x = (m[0][2] + m[2][0]) / sq;
    y = (m[1][2] + m[2][1]) / sq;
    z = 0.25 * sq;
  }
  return [x, y, z, w];
}

/** Resolves every planet's world position and orientation. */
function buildPlanetInstances(): Float32Array {
  const out = new Float32Array(PLANETS.length * PLANET_STRIDE);
  let o = 0;

  for (const pl of PLANETS) {
    let centre: number[];
    if (pl.world) {
      centre = [pl.world[0], pl.world[1], pl.world[2]];
    } else {
      const c = cameraFrame(pl.at ?? 0);
      centre = [0, 1, 2].map(
        (i) => c.eye[i] + c.f[i] * (pl.fwd ?? 0) + c.r[i] * (pl.right ?? 0) + c.u[i] * (pl.up ?? 0)
      );
    }

    let q = [0, 0, 0, 1];
    if (pl.face && pl.faceAt !== undefined) {
      const c = cameraFrame(pl.faceAt);
      const D = [c.eye[0] - centre[0], c.eye[1] - centre[1], c.eye[2] - centre[2]];
      q = orientation(pl.face[0], pl.face[1], D, [c.u[0], c.u[1], c.u[2]]);
    } else {
      // Turn a point near the equator towards wherever the camera will be when
      // this world is on screen.
      //
      // A random orientation would sometimes aim a pole at the viewer, and an
      // equirectangular map has no detail there — every column of the texture
      // converges on that one point, so it renders as a starburst. Choosing a
      // low latitude guarantees the poles sit near the limb, where the
      // projection is well behaved and nobody is looking anyway.
      const c = cameraFrame(pl.at ?? 0);
      const D = [c.eye[0] - centre[0], c.eye[1] - centre[1], c.eye[2] - centre[2]];
      const lat = (pl.seed - 0.5) * 46;
      const lon = pl.seed * 720 - 180;
      q = orientation(lat, lon, D, [c.u[0], c.u[1], c.u[2]]);
    }

    out[o++] = centre[0]; out[o++] = centre[1]; out[o++] = centre[2];
    out[o++] = pl.radius;
    out[o++] = pl.color[0]; out[o++] = pl.color[1]; out[o++] = pl.color[2];
    out[o++] = pl.seed;
    out[o++] = q[0]; out[o++] = q[1]; out[o++] = q[2]; out[o++] = q[3];
    out[o++] = pl.kind;
    // Which slice of the surface atlas. Earth has its own pair of textures and
    // never reads the atlas, so its layer is arbitrary.
    out[o++] = pl.layer ?? 0;
  }
  return out;
}

/** origin(3) dir(3) speed/period/phase/size(4) tint(3) kind(1). */
const TRAVELLER_STRIDE = 14;

/**
 * Meteors, and the one ship.
 *
 * The meteors are placed near the camera path rather than out in the galaxy,
 * because a streak a thousand units away is a stationary dot however fast it
 * is really moving. These pass close enough to cross the frame.
 *
 * Their periods are deliberately not multiples of each other. Give six meteors
 * a tidy set of intervals and they fall into step within a minute and start
 * arriving in a rhythm, which is the one thing a shooting star must never do.
 */
function buildTravellers(): Float32Array {
  const rows: number[][] = [];

  const rng = (() => {
    let x = 0x2f6e2b1;
    return () => {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  })();

  // Periods that share no common factor. Give ten meteors a tidy set of
  // intervals and they drift into step within a minute and start arriving in a
  // rhythm, which is the one thing a shooting star must never do.
  const periods = [6.7, 8.3, 9.7, 11.3, 13.1, 15.7, 18.3, 21.7, 26.9, 33.1];

  for (let i = 0; i < periods.length; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    rows.push([
      // Off to one side, above, and out in front.
      side * (60 + rng() * 130), 40 + rng() * 90, 110 + rng() * 190,
      // Crossing the view and falling, with a little variation.
      -side * (0.72 + rng() * 0.3), -(0.34 + rng() * 0.4), rng() * 0.3 - 0.1,
      70 + rng() * 90,             // speed
      periods[i],
      rng() * periods[i],          // phase
      11 + rng() * 13,             // size
      ...(rng() < 0.35 ? [1.0, 0.84, 0.58] : [0.74, 0.87, 1.0]),
      0,                           // kind: meteor
    ]);
  }

  // The ship, flying a lap around the camera. It used to cross in a straight
  // line, which meant it was either arriving or leaving and never simply
  // there; on a loop it is always somewhere in the sky, near or far, coming or
  // going, and it turns.
  //
  // Big enough to be the thing you notice, and no bigger: at twice this it
  // spanned the whole hero and sat across the headline, which turns a passing
  // craft into a permanent fixture. The loop's centre is pushed right and
  // below the eye line for the same reason the planets are — the type lives in
  // the upper left, behind a heavy scrim.
  rows.push([
    // Centre of the lap, in camera axes.
    240, -120, 700,
    // Lateral radius, depth radius, bank. Depth stays well under the centre's
    // distance so the craft never crosses behind the camera, and the bank is
    // what stops the billboard degenerating at the ends of the lap — both are
    // explained at craftPath() in the vertex shader.
    470, 250, 0.55,
    0,          // speed: unused here, the craft is paced by its period
    72,         // period: a little over a minute for one lap
    54,         // phase: opens at the near point of the lap, where the craft is
                //   largest and crossing fastest, so it reads as moving at once
    30.0,       // size
    0.9, 0.94, 1.0,
    1,          // kind: craft
  ]);

  return new Float32Array(rows.flat());
}

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

export type Tier = 0 | 1 | 2;

const TIERS = [
  { stars: 0.30, volumeScale: 0.30, steps: 14, bloom: false, renderScale: 1.00, motes: 0.4 },
  { stars: 0.60, volumeScale: 0.42, steps: 26, bloom: true,  renderScale: 1.25, motes: 0.7 },
  { stars: 1.00, volumeScale: 0.55, steps: 42, bloom: true,  renderScale: 1.50, motes: 1.0 },
] as const;

export type SceneOptions = {
  canvas: HTMLCanvasElement;
  starCount: number;
  tier: Tier;
  /** Called when the renderer decides the device cannot keep up and drops a tier. */
  onTier?: (tier: Tier) => void;
  /**
   * Called when even the lowest tier cannot hold a reasonable frame rate.
   *
   * The scene is not worth having at fifteen frames a second — at that point
   * it is actively worse than the still panorama it replaced, which looks
   * good and costs nothing. Knowing when to stop is part of shipping this.
   */
  onGiveUp?: () => void;
  /**
   * Called once, when the opening reveal has brought the sky up far enough to
   * be worth looking at.
   *
   * The still panorama is on screen until this fires. Handing over any earlier
   * — when the scene is created, which is what it used to do — swaps a lit sky
   * for a black canvas that then spends two seconds fading up, and the page
   * opens on a hole.
   */
  onReady?: () => void;
};

export type Scene = {
  /** The quality tier currently in use. Falls on its own if the device struggles. */
  readonly tier: Tier;
  /** 0 at the top of the page, 1 at the bottom. */
  setProgress(p: number): void;
  /** −1..1 in each axis. */
  setPointer(x: number, y: number): void;
  resize(): void;
  start(): void;
  dispose(): void;
};

function compile(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`${label}: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string, label: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, `${label} vert`));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, `${label} frag`));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`${label} link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

function makeTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  // Half-float linear filtering is core in WebGL2, which is why the volume can
  // be rendered small and smoothly upsampled rather than blocky.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

export function createScene(opts: SceneOptions): Scene | null {
  const ctx = opts.canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  if (!ctx) return null;
  // Bound to a local so the narrowing survives into every closure below.
  const gl = ctx;
  if (!gl.getExtension("EXT_color_buffer_float")) return null;

  let tier: Tier = opts.tier;
  let buffers: StarBuffers;
  try {
    buffers = buildGalaxy(opts.starCount);
  } catch {
    return null;
  }

  // --- programs ---
  const progStar = link(gl, STAR_VERT, STAR_FRAG, "star");
  const progMote = link(gl, MOTE_VERT, MOTE_FRAG, "mote");
  const progPlanet = link(gl, PLANET_VERT, PLANET_FRAG, "planet");
  const progTraveller = link(gl, TRAVELLER_VERT, TRAVELLER_FRAG, "traveller");
  const progVolume = link(gl, FULLSCREEN_VERT, VOLUME_FRAG, "volume");
  const progBright = link(gl, FULLSCREEN_VERT, BRIGHT_FRAG, "bright");
  const progBlur = link(gl, FULLSCREEN_VERT, BLUR_FRAG, "blur");
  const progComposite = link(gl, FULLSCREEN_VERT, COMPOSITE_FRAG, "composite");
  const progCopy = link(gl, FULLSCREEN_VERT, COPY_FRAG, "copy");

  const uni = (p: WebGLProgram, names: string[]) => {
    const m: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) m[n] = gl.getUniformLocation(p, n);
    return m;
  };

  const uStar = uni(progStar, [
    "uViewProj", "uCamPos", "uTime", "uPixelScale", "uSizeScale",
    "uExtinction", "uFlux", "uFar", "uNoise", "uArmPitch", "uReveal",
  ]);
  const uMote = uni(progMote, ["uViewProj", "uCamPos", "uDrift", "uTime", "uPixelScale", "uBox", "uReveal"]);
  const uTrav = uni(progTraveller, ["uViewProj", "uCamPos", "uRight", "uUp", "uFwd", "uTime", "uReveal", "uRocket", "uRocketLoaded"]);
  const uPlanet = uni(progPlanet, ["uViewProj", "uCamPos", "uRight", "uUp", "uNoise", "uReveal", "uTime", "uEarthDay", "uEarthNight", "uEarthLoaded", "uDetail",
    "uPlanetAlbedo", "uPlanetRelief", "uMapsLoaded", "uReliefTexel"]);
  const uVol = uni(progVolume, [
    "uInvViewProj", "uCamPos", "uTime", "uSteps", "uDensity", "uDust",
    "uEnergy", "uSmooth", "uNoise", "uArmPitch", "uReveal",
  ]);
  const uBright = uni(progBright, ["uSrc", "uThreshold"]);
  const uBlur = uni(progBlur, ["uSrc", "uDir"]);
  const uComp = uni(progComposite, ["uScene", "uBloom", "uBloomAmount", "uExposure", "uTime", "uVignette"]);
  const uCopy = uni(progCopy, ["uSrc", "uScale"]);

  // --- geometry ---
  function makeCloud(data: Float32Array): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer } {
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const s = STAR_STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, s, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, s, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, s, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, s, 28);
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  const starCloud = makeCloud(buffers.stars);
  const distantCloud = makeCloud(buffers.distant);
  const moteCloud = makeCloud(buffers.motes);
  const emptyVao = gl.createVertexArray()!;

  // Planets: one quad, drawn once per world with instanced attributes.
  const planetVao = gl.createVertexArray()!;
  const planetQuad = gl.createBuffer()!;
  const planetInst = gl.createBuffer()!;
  {
    gl.bindVertexArray(planetVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, planetQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  1, 1,
      -1, -1,  1,  1, -1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, planetInst);
    gl.bufferData(gl.ARRAY_BUFFER, buildPlanetInstances(), gl.STATIC_DRAW);
    const st = PLANET_STRIDE * 4;
    for (const [loc, size, off] of
      [[1, 3, 0], [2, 1, 12], [3, 3, 16], [4, 1, 28], [5, 4, 32], [6, 1, 48], [7, 1, 52]] as const) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, st, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  // --- noise volume ---
  const noiseTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, noiseTex);
  gl.texImage3D(
    gl.TEXTURE_3D, 0, gl.RGBA8, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, buildNoiseVolume()
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);

  /**
   * A one-pixel texture that keeps the Earth sampler units valid.
   *
   * WebGL rejects a draw call outright — INVALID_OPERATION, nothing rendered,
   * no error thrown anywhere a page can see — if two samplers of different
   * types point at the same texture unit. The planet shader has a sampler3D
   * for the noise volume and two sampler2Ds for Earth, and an unset sampler
   * uniform is zero, so before Earth's textures loaded all three named unit 0.
   *
   * The symptom was that every planet in the scene was invisible until the
   * scroll passed the point where the Earth textures were fetched, at which
   * point all six of the others appeared at once. Binding something valid to
   * those units from the start is the whole fix.
   */
  // Meteors and the ship: same quad, same instancing idea as the planets.
  const travCount = buildTravellers().length / TRAVELLER_STRIDE;
  const travVao = gl.createVertexArray()!;
  const travQuad = gl.createBuffer()!;
  const travInst = gl.createBuffer()!;
  {
    gl.bindVertexArray(travVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, travQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  1, 1,
      -1, -1,  1,  1, -1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, travInst);
    gl.bufferData(gl.ARRAY_BUFFER, buildTravellers(), gl.STATIC_DRAW);
    const st = TRAVELLER_STRIDE * 4;
    for (const [loc, size, off] of
      [[1, 3, 0], [2, 3, 12], [3, 4, 24], [4, 3, 40], [5, 1, 52]] as const) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, st, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  const PLANET_LAYERS = 6;
  const ALBEDO_W = 768, ALBEDO_H = 384;
  const RELIEF_W = 384, RELIEF_H = 192;

  let albedoArr: WebGLTexture | null = null;
  let reliefArr: WebGLTexture | null = null;
  let mapsLoaded = 0;

  /**
   * Decodes an image into a 2D texture array, one layer per planet.
   *
   * The atlas is a single tall image with the layers stacked, which is exactly
   * how a texture array wants its data — rows are contiguous, so the whole
   * thing uploads in one call with no slicing.
   */
  function uploadArray(img: HTMLImageElement, w: number, h: number, layers: number): WebGLTexture {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h * layers;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: false })!;
    ctx2d.drawImage(img, 0, 0, w, h * layers);
    const pixels = ctx2d.getImageData(0, 0, w, h * layers).data;

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, w, h, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  const blankArr = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, blankArr);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([128, 128, 128, 255]));
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const blankTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, blankTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // --- Earth ---
  //
  // Four hundred kilobytes of texture for one object that is only on screen at
  // the very end of the page, so it is not fetched until the scroll is most of
  // the way there. Someone who reads the hero and leaves never pays for it,
  // and by the time it is needed it has had a third of a page of scrolling to
  // arrive. Until it does, Earth draws with the procedural rocky surface, so
  // there is never a hole where a planet should be.
  let earthDay: WebGLTexture | null = null;
  let earthNight: WebGLTexture | null = null;
  let earthLoaded = 0;
  let earthStarted = false;

  /** Fetches an image, falling back from AVIF to WebP. */
  function loadImage(base: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        const fallback = new Image();
        fallback.onload = () => resolve(fallback);
        fallback.onerror = reject;
        fallback.src = `${base}.webp`;
      };
      img.src = `${base}.avif`;
    });
  }

  /**
   * The planet surfaces. Fetched straight away, unlike Earth's — a planet is
   * in the hero, so these are wanted immediately, and at 270KB across both
   * files they are a fraction of what Earth costs.
   */
  let rocketTex: WebGLTexture | null = null;
  let rocketLoaded = 0;

  function loadSurfaces() {
    // The ship's hull. Twelve kilobytes, and it is on screen in the hero.
    loadImage("/sky/rocket")
      .then((img) => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        rocketTex = tex;
        rocketLoaded = 1;
      })
      .catch(() => {});

    Promise.all([loadImage("/sky/planets"), loadImage("/sky/planets-relief")])
      .then(([albedo, reliefImg]) => {
        albedoArr = uploadArray(albedo, ALBEDO_W, ALBEDO_H, PLANET_LAYERS);
        reliefArr = uploadArray(reliefImg, RELIEF_W, RELIEF_H, PLANET_LAYERS);
        mapsLoaded = 1;
      })
      .catch(() => {
        // The procedural surfaces stay. Worse, but not broken.
      });
  }

  function loadEarth() {
    if (earthStarted) return;
    earthStarted = true;

    Promise.all([loadImage("/sky/earth-day"), loadImage("/sky/earth-night")])
      .then(([day, night]) => {
        const upload = (img: HTMLImageElement): WebGLTexture => {
          const tex = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, img);
          // Mipmaps, because Earth is small on screen for most of its life and
          // a four-thousand-pixel map of city lights sampled at one pixel per
          // degree without them is a field of aliasing.
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          // Wrapping in longitude, clamped in latitude: the map joins itself
          // around the equator but the poles are edges.
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return tex;
        };
        earthDay = upload(day);
        earthNight = upload(night);
        earthLoaded = 1;
      })
      .catch(() => {
        // Leave it procedural. A missing texture is not worth a broken page.
      });
  }

  // --- render targets ---
  let hdr: Target | null = null;
  let vol: Target | null = null;
  let bloomA: Target | null = null;
  let bloomB: Target | null = null;
  let width = 0;
  let height = 0;
  /** Which tier the current set of targets was built for. */
  let builtFor: Tier | null = null;

  function dropTargets() {
    for (const t of [hdr, vol, bloomA, bloomB]) {
      if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    }
    hdr = vol = bloomA = bloomB = null;
  }

  function resize() {
    const cfg = TIERS[tier];
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.renderScale);
    const w = Math.max(2, Math.round(opts.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.round(opts.canvas.clientHeight * dpr));

    // The tier has to be part of this test, not just the size.
    //
    // On an ordinary-density display devicePixelRatio is 1, so it wins the
    // min() against every tier's render scale and the canvas comes out the
    // same size at all three. Comparing sizes alone therefore made a demotion
    // a no-op for the render targets — the volume kept the resolution it was
    // built at, and since the volume is well over half the frame time and
    // scales with its area, stepping down gave back almost nothing on exactly
    // the machines that needed it.
    if (w === width && h === height && hdr && builtFor === tier) return;

    width = w; height = h;
    builtFor = tier;
    opts.canvas.width = w;
    opts.canvas.height = h;

    dropTargets();
    hdr = makeTarget(gl, w, h);
    vol = makeTarget(gl, Math.max(2, Math.round(w * cfg.volumeScale)), Math.max(2, Math.round(h * cfg.volumeScale)));
    const bw = Math.max(2, w >> 2);
    const bh = Math.max(2, h >> 2);
    bloomA = makeTarget(gl, bw, bh);
    bloomB = makeTarget(gl, bw, bh);
  }

  // --- state ---
  const proj = mat4();
  const view = mat4();
  const viewProj = mat4();
  const invViewProj = mat4();
  const eye = [0, 0, 0];
  const look = [0, 0, 0];

  let progress = 0;
  let easedProgress = 0;
  let pointerX = 0, pointerY = 0, easedPX = 0, easedPY = 0;
  let start = 0;
  let raf = 0;
  let running = false;
  // onReady fires once, the first frame the reveal is bright enough.
  let announced = false;

  // Frame-time watch. The first second is ignored: shader compilation and the
  // first upload of a million vertices land there and say nothing about how the
  // scene will actually run.
  const times: number[] = [];
  let lastFrame = 0;
  let settleUntil = 0;

  /**
   * Whether this device has ever failed to hold its budget.
   *
   * Once it has, the scene stops trying to climb. Promotion is only ever
   * attempted on the way up from a conservative start — a device that has
   * already proved it cannot hold a tier must not be offered that tier again,
   * because the alternative is a loop that demotes, recovers, promotes,
   * demotes again, and rebuilds every render target each time round.
   */
  let hasDemoted = false;

  function stepUp() {
    if (hasDemoted || tier >= 2) return;
    tier = (tier + 1) as Tier;
    times.length = 0;
    settleUntil = performance.now() + 1200;
    resize();
    opts.onTier?.(tier);
  }

  function stepDown(median: number) {
    hasDemoted = true;
    if (tier === 0) {
      // Giving up is judged against a much lower bar than demoting is.
      // Dropping a tier to claw back headroom is cheap; abandoning the scene
      // throws away the whole thing, and a device holding the lowest tier at
      // forty frames a second is doing fine — it should not be punished for
      // failing to reach sixty.
      if (median > 34) opts.onGiveUp?.();
      return;
    }
    tier = (tier - 1) as Tier;
    times.length = 0;
    settleUntil = performance.now() + 1200;
    resize();
    opts.onTier?.(tier);
  }

  function fullscreen(prog: WebGLProgram) {
    gl.useProgram(prog);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now: number) {
    if (!running) return;
    if (!hdr || !vol || !bloomA || !bloomB) { raf = requestAnimationFrame(frame); return; }

    const cfg = TIERS[tier];
    const t = (now - start) / 1000;

    // Everything the user drives is eased rather than read directly. Scroll
    // that lands straight on the camera makes the galaxy feel bolted to the
    // scrollbar; a heavy camera that takes half a second to arrive feels like
    // something with mass.
    easedProgress += (progress - easedProgress) * 0.055;
    easedPX += (pointerX - easedPX) * 0.028;
    easedPY += (pointerY - easedPY) * 0.028;

    // Three and a half seconds, and front-loaded.
    //
    // The opening still assembles out of the dark in three stages, but the
    // galaxy itself is the thing worth seeing and it was arriving too late —
    // six and a half seconds of build-up is a long time to look at an empty
    // page, and most people had started scrolling before the arms appeared.
    // The stages are still there; they just happen quickly.
    // Clamped at zero as well as one.
    //
    // requestAnimationFrame hands back a timestamp that can predate the call
    // that scheduled it, so on the very first frame t is slightly negative —
    // and a negative base with a fractional exponent is NaN. That NaN went
    // into the camera's z, which is how a one-frame glitch hid inside a scene
    // that otherwise looked perfect. The old easing used an integer power and
    // never showed it.
    // Two and a bit seconds, not three and a half. The reveal is the first
    // thing anyone sees and the longer it runs the longer the page is dark;
    // opening on a black screen is not atmosphere, it is a page that has not
    // loaded.
    const reveal = Math.min(Math.max(t, 0) / 2.2, 1);
    const revealEase = Math.pow(reveal, 0.85) * (2 - Math.pow(reveal, 0.85));

    // Tell the page once the sky is bright enough to be worth crossing over
    // to. Not when the scene starts — it is black then, and swapping the
    // panorama out at that moment is what put a hole in the opening.
    if (!announced && revealEase >= 0.72) {
      announced = true;
      opts.onReady?.();
    }

    sampleSpline(easedProgress, "eye", eye);
    sampleSpline(easedProgress, "look", look);

    // A slow continuous drift on top of the scroll, so the scene is alive even
    // when nobody is touching it, plus the last of the opening dolly.
    const drift = t * 0.9;
    eye[0] += Math.sin(t * 0.045) * 26 + easedPX * 42;
    eye[1] += Math.cos(t * 0.037) * 14 + easedPY * -26;
    eye[2] += -drift * 0.35 + (1 - revealEase) * 420;

    // A portrait frame turns a vertical field of view into a very narrow
    // horizontal one: sixty-six degrees at 390x844 leaves thirty-three degrees
    // across, against ninety-two on a laptop. The galaxy is a wide, flat thing
    // and that slice cut it into a smudge — most of the reason the sky read as
    // nothing much on a phone.
    //
    // So the vertical field opens up until the horizontal one is respectable,
    // capped before the wide-angle stretch at the top and bottom of the frame
    // starts to tell. A landscape viewport never reaches the floor and is left
    // exactly as it was.
    const aspect = width / Math.max(height, 1);
    const fovy = Math.min(
      Math.max((66 * Math.PI) / 180, 2 * Math.atan(Math.tan((70 * Math.PI) / 360) / aspect)),
      (94 * Math.PI) / 180
    );
    perspective(proj, fovy, aspect, 0.35, 34000);
    lookAt(view, eye, look, [0, 1, 0]);
    multiply(viewProj, proj, view);
    invert(invViewProj, viewProj);

    // ---- volume ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, vol.fbo);
    gl.viewport(0, 0, vol.w, vol.h);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(progVolume);
    gl.uniformMatrix4fv(uVol.uInvViewProj, false, invViewProj);
    gl.uniform3fv(uVol.uCamPos, eye);
    gl.uniform1f(uVol.uTime, t);
    gl.uniform1i(uVol.uSteps, cfg.steps);
    gl.uniform1f(uVol.uDensity, 0.0026);
    gl.uniform1f(uVol.uDust, 0.0750);
    gl.uniform1f(uVol.uEnergy, 1.60);
    gl.uniform1f(uVol.uSmooth, tier === 0 ? 0.35 : 0.0);
    gl.uniform1f(uVol.uArmPitch, 0.235);
    // The gas waits for the stars. Second stage of the three.
    const gasReveal = Math.max(0, (revealEase - 0.16) / 0.84);
    gl.uniform1f(uVol.uReveal, gasReveal * gasReveal * (3 - 2 * gasReveal));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, noiseTex);
    gl.uniform1i(uVol.uNoise, 0);
    fullscreen(progVolume);

    // ---- scene ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(progCopy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, vol.tex);
    gl.uniform1i(uCopy.uSrc, 0);
    gl.uniform1f(uCopy.uScale, 1.0);
    fullscreen(progCopy);

    gl.useProgram(progStar);
    gl.uniformMatrix4fv(uStar.uViewProj, false, viewProj);
    gl.uniform3fv(uStar.uCamPos, eye);
    gl.uniform1f(uStar.uTime, t);
    gl.uniform1f(uStar.uPixelScale, height * 0.5);
    gl.uniform1f(uStar.uSizeScale, 1.35);
    gl.uniform1f(uStar.uFlux, 5.2e5);
    gl.uniform1f(uStar.uExtinction, 0.0480);
    gl.uniform1f(uStar.uFar, 32000);
    gl.uniform1f(uStar.uArmPitch, 0.235);
    gl.uniform1f(uStar.uReveal, revealEase);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, noiseTex);
    gl.uniform1i(uStar.uNoise, 0);

    gl.bindVertexArray(starCloud.vao);
    gl.drawArrays(gl.POINTS, 0, Math.round(buffers.starCount * cfg.stars));
    gl.bindVertexArray(distantCloud.vao);
    gl.drawArrays(gl.POINTS, 0, buffers.distantCount);

    gl.useProgram(progMote);
    gl.uniformMatrix4fv(uMote.uViewProj, false, viewProj);
    gl.uniform3fv(uMote.uCamPos, eye);
    gl.uniform3f(uMote.uDrift, 0.06, -0.03, 0.11);
    gl.uniform1f(uMote.uTime, t);
    gl.uniform1f(uMote.uPixelScale, height * 0.5);
    gl.uniform1f(uMote.uBox, 26);
    gl.uniform1f(uMote.uReveal, revealEase);
    gl.bindVertexArray(moteCloud.vao);
    gl.drawArrays(gl.POINTS, 0, Math.round(buffers.moteCount * cfg.motes));

    // Meteors and the ship. Premultiplied rather than additive: a meteor is
    // light and emits zero alpha, so it blends exactly as it always did, but
    // the ship's hull is a solid black object and additive blending made it a
    // ghost — you could read the star field straight through it, which is most
    // of why it looked fake. Alpha here is coverage, so the hull erases what
    // is behind it and the exhaust still only adds.
    //
    // Before the planets, not after. There is no depth buffer in this scene,
    // so whatever is drawn last wins, and a meteor drawn afterwards cut
    // straight across the face of the nearest moon like a scratch on the lens.
    // Drawing them first lets the planets paint over the ones behind them,
    // which is wrong for the few genuinely in front and right for all the
    // rest.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progTraveller);
    gl.uniformMatrix4fv(uTrav.uViewProj, false, viewProj);
    gl.uniform3fv(uTrav.uCamPos, eye);
    gl.uniform3f(uTrav.uRight, view[0], view[4], view[8]);
    gl.uniform3f(uTrav.uUp, view[1], view[5], view[9]);
    // The camera looks down its own negative z, so forward is the negated
    // third row of the view matrix.
    gl.uniform3f(uTrav.uFwd, -view[2], -view[6], -view[10]);
    gl.uniform1f(uTrav.uTime, t);
    gl.uniform1f(uTrav.uReveal, revealEase);
    gl.uniform1f(uTrav.uRocketLoaded, rocketLoaded);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, rocketTex ?? blankTex);
    gl.uniform1i(uTrav.uRocket, 6);
    gl.bindVertexArray(travVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, travCount);
    gl.bindVertexArray(null);

    // Planets last, and the only thing in the scene that is not additive —
    // they are solid objects and have to cover what is behind them rather than
    // glow on top of it.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progPlanet);
    gl.uniformMatrix4fv(uPlanet.uViewProj, false, viewProj);
    gl.uniform3fv(uPlanet.uCamPos, eye);
    // The view matrix's first two rows are the camera's right and up in world
    // space, which is exactly what the billboard needs.
    gl.uniform3f(uPlanet.uRight, view[0], view[4], view[8]);
    gl.uniform3f(uPlanet.uUp, view[1], view[5], view[9]);
    gl.uniform1f(uPlanet.uTime, t);
    gl.uniform1f(uPlanet.uReveal, Math.max(0, (revealEase - 0.45) / 0.55));
    gl.uniform1f(uPlanet.uDetail, tier === 0 ? 0 : 1);
    gl.uniform1f(uPlanet.uMapsLoaded, mapsLoaded);
    gl.uniform2f(uPlanet.uReliefTexel, 1 / RELIEF_W, 1 / RELIEF_H);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, albedoArr ?? blankArr);
    gl.uniform1i(uPlanet.uPlanetAlbedo, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, reliefArr ?? blankArr);
    gl.uniform1i(uPlanet.uPlanetRelief, 5);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, noiseTex);
    gl.uniform1i(uPlanet.uNoise, 0);
    gl.uniform1f(uPlanet.uEarthLoaded, earthLoaded);
    // Always bound, and never to unit 0 — see blankTex above.
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, earthDay ?? blankTex);
    gl.uniform1i(uPlanet.uEarthDay, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, earthNight ?? blankTex);
    gl.uniform1i(uPlanet.uEarthNight, 3);
    gl.bindVertexArray(planetVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, PLANETS.length);
    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE);


    // ---- bloom ----
    if (cfg.bloom) {
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
      gl.viewport(0, 0, bloomA.w, bloomA.h);
      gl.useProgram(progBright);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
      gl.uniform1i(uBright.uSrc, 0);
      gl.uniform1f(uBright.uThreshold, 0.85);
      fullscreen(progBright);

      for (const [src, dst, dx, dy] of [
        [bloomA, bloomB, 1 / bloomA.w, 0],
        [bloomB, bloomA, 0, 1 / bloomA.h],
      ] as const) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, (dst as Target).fbo);
        gl.viewport(0, 0, (dst as Target).w, (dst as Target).h);
        gl.useProgram(progBlur);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, (src as Target).tex);
        gl.uniform1i(uBlur.uSrc, 0);
        gl.uniform2f(uBlur.uDir, dx as number, dy as number);
        fullscreen(progBlur);
      }
    }

    // ---- composite ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(progComposite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
    gl.uniform1i(uComp.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cfg.bloom ? bloomA.tex : hdr.tex);
    gl.uniform1i(uComp.uBloom, 1);
    gl.uniform1f(uComp.uBloomAmount, cfg.bloom ? 0.45 : 0.0);
    gl.uniform1f(uComp.uExposure, 0.80);
    gl.uniform1f(uComp.uTime, t);
    gl.uniform1f(uComp.uVignette, 0.55);
    fullscreen(progComposite);

    // ---- watch the frame time ----
    if (lastFrame && now > settleUntil) {
      times.push(now - lastFrame);
      // Forty frames, not ninety. On a machine that is genuinely struggling,
      // ninety frames is twenty seconds of the visitor watching it struggle
      // before anything is done about it.
      if (times.length >= 40) {
        times.sort((a, b) => a - b);
        const median = times[times.length >> 1];
        times.length = 0;
        // 21ms is comfortably past a 60Hz frame and not so tight that a single
        // slow moment demotes a machine that is otherwise fine.
        if (median > 21) {
          stepDown(median);
        } else if (median < 11) {
          // And upwards, if there is obvious room.
          //
          // The opening guess is made from core count and memory, which are a
          // poor proxy for a GPU — a thin laptop reporting four cores may have
          // a perfectly good one, and it would otherwise be pinned to the
          // lowest tier for the life of the page on the strength of a number
          // that says nothing about rendering. Eleven milliseconds is half the
          // demotion threshold, so a tier is only offered to a device with
          // room to spare rather than one scraping past.
          stepUp();
        }
      }
    }
    lastFrame = now;

    raf = requestAnimationFrame(frame);
  }

  return {
    // A getter, not a copy: the tier changes underneath the caller when the
    // renderer demotes itself, and a snapshot taken at construction would
    // report the starting tier forever.
    get tier() { return tier; },
    setProgress(p) {
      progress = Math.min(Math.max(p, 0), 1);
      if (progress > 0.55) loadEarth();
    },
    setPointer(x, y) { pointerX = x; pointerY = y; },
    resize,
    start() {
      if (running) return;
      running = true;
      resize();
      loadSurfaces();
      start = performance.now();
      settleUntil = start + 1000;
      raf = requestAnimationFrame(frame);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      dropTargets();
      gl.deleteTexture(noiseTex);
      for (const c of [starCloud, distantCloud, moteCloud]) {
        gl.deleteVertexArray(c.vao);
        gl.deleteBuffer(c.vbo);
      }
      gl.deleteVertexArray(emptyVao);
      gl.deleteVertexArray(planetVao);
      gl.deleteVertexArray(travVao);
      gl.deleteBuffer(travQuad);
      gl.deleteBuffer(travInst);
      gl.deleteBuffer(planetQuad);
      gl.deleteBuffer(planetInst);
      for (const p of [progStar, progMote, progPlanet, progTraveller, progVolume, progBright, progBlur, progComposite, progCopy]) {
        gl.deleteProgram(p);
      }
    },
  };
}
