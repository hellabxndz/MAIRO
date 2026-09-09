// The volume texture the nebulae are carved out of.
//
// One 64³ RGBA texture holds four octaves of tileable value noise — frequency
// 4, 8, 16 and 32 in R, G, B and A. The shader gets all four from a single
// trilinear fetch, so a four-octave fBm costs one texture read instead of four,
// and the raymarch does one read per step per scale rather than a dozen hash
// evaluations. On a volume pass that runs thirty steps a pixel that difference
// is the whole frame budget.
//
// Tileable matters: the density field is sampled at world positions that run to
// thousands of units, so the texture wraps many times. A non-tiling texture
// would put a visible lattice of seams through the galaxy.

const SIZE = 64;

/** Deterministic hash → [0,1). Seeded so the galaxy is the same on every load. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Tileable value noise sampled onto the 64³ grid at `freq` lattice points per
 * axis. `freq` must divide SIZE for the wrap to be exact.
 */
function octave(freq: number, seed: number): Float32Array {
  const r = rand(seed);
  const lattice = new Float32Array(freq * freq * freq);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r();

  const at = (x: number, y: number, z: number) =>
    lattice[((z % freq) * freq + (y % freq)) * freq + (x % freq)];

  const out = new Float32Array(SIZE * SIZE * SIZE);
  const scale = freq / SIZE;

  for (let z = 0; z < SIZE; z++) {
    const fz = z * scale;
    const z0 = Math.floor(fz);
    const tz = smootherstep(fz - z0);
    for (let y = 0; y < SIZE; y++) {
      const fy = y * scale;
      const y0 = Math.floor(fy);
      const ty = smootherstep(fy - y0);
      for (let x = 0; x < SIZE; x++) {
        const fx = x * scale;
        const x0 = Math.floor(fx);
        const tx = smootherstep(fx - x0);

        const c000 = at(x0, y0, z0);
        const c100 = at(x0 + 1, y0, z0);
        const c010 = at(x0, y0 + 1, z0);
        const c110 = at(x0 + 1, y0 + 1, z0);
        const c001 = at(x0, y0, z0 + 1);
        const c101 = at(x0 + 1, y0, z0 + 1);
        const c011 = at(x0, y0 + 1, z0 + 1);
        const c111 = at(x0 + 1, y0 + 1, z0 + 1);

        const x00 = c000 + (c100 - c000) * tx;
        const x10 = c010 + (c110 - c010) * tx;
        const x01 = c001 + (c101 - c001) * tx;
        const x11 = c011 + (c111 - c011) * tx;
        const y0v = x00 + (x10 - x00) * ty;
        const y1v = x01 + (x11 - x01) * ty;

        out[(z * SIZE + y) * SIZE + x] = y0v + (y1v - y0v) * tz;
      }
    }
  }
  return out;
}

export const NOISE_SIZE = SIZE;

/** RGBA8 data for a 64³ 3D texture: four tileable octaves, one per channel. */
export function buildNoiseVolume(): Uint8Array {
  const a = octave(4, 0x9e3779b9);
  const b = octave(8, 0x85ebca6b);
  const c = octave(16, 0xc2b2ae35);
  const d = octave(32, 0x27d4eb2f);

  const data = new Uint8Array(SIZE * SIZE * SIZE * 4);
  for (let i = 0; i < a.length; i++) {
    data[i * 4 + 0] = (a[i] * 255) | 0;
    data[i * 4 + 1] = (b[i] * 255) | 0;
    data[i * 4 + 2] = (c[i] * 255) | 0;
    data[i * 4 + 3] = (d[i] * 255) | 0;
  }
  return data;
}
