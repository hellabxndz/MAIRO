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
  STAR_VERT, STAR_FRAG, MOTE_VERT, MOTE_FRAG,
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
  { at: 0.58, eye: [ 110,   48,  250], look: [-120,    8, -120] },
  { at: 0.76, eye: [-120,   28,  130], look: [ -20,    2,  -40] },
  { at: 0.90, eye: [ -48,   16,   62], look: [   6,    0,  -10] },
  // And then all the way out, so the last thing the page does is show how far
  // the journey went.
  { at: 1.00, eye: [ 840,  980, 1950], look: [   0,    0,    0] },
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

  // Frame-time watch. The first second is ignored: shader compilation and the
  // first upload of a million vertices land there and say nothing about how the
  // scene will actually run.
  const times: number[] = [];
  let lastFrame = 0;
  let settleUntil = 0;

  function stepDown(median: number) {
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

    // Six and a half seconds, and deliberately slow at the start.
    //
    // The opening is meant to read as the universe coming up rather than an
    // image fading in, and that needs the first second and a half to be almost
    // nothing — a few distant points — so that the dust arriving, and then the
    // galaxy behind it, land as separate events.
    const reveal = Math.min(t / 6.5, 1);
    const revealEase = Math.pow(reveal, 1.45) * (2 - Math.pow(reveal, 1.45));

    sampleSpline(easedProgress, "eye", eye);
    sampleSpline(easedProgress, "look", look);

    // A slow continuous drift on top of the scroll, so the scene is alive even
    // when nobody is touching it, plus the last of the opening dolly.
    const drift = t * 0.9;
    eye[0] += Math.sin(t * 0.045) * 26 + easedPX * 42;
    eye[1] += Math.cos(t * 0.037) * 14 + easedPY * -26;
    eye[2] += -drift * 0.35 + (1 - revealEase) * 420;

    const aspect = width / Math.max(height, 1);
    perspective(proj, (66 * Math.PI) / 180, aspect, 0.35, 34000);
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
    const gasReveal = Math.max(0, (revealEase - 0.30) / 0.70);
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
    gl.bindVertexArray(null);

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
        if (median > 21) stepDown(median);
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
    setProgress(p) { progress = Math.min(Math.max(p, 0), 1); },
    setPointer(x, y) { pointerX = x; pointerY = y; },
    resize,
    start() {
      if (running) return;
      running = true;
      resize();
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
      for (const p of [progStar, progMote, progVolume, progBright, progBlur, progComposite, progCopy]) {
        gl.deleteProgram(p);
      }
    },
  };
}
