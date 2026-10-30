// MAIRO's particle renderer: thousands of points on the GPU, morphing from
// one shape to another, lit like light rather than drawn like dots.
//
// Written directly on WebGL2 rather than with three.js: the whole job is one
// draw call of point sprites, and a 3D library would add hundreds of
// kilobytes to every visit for a scene graph this never uses. What it does:
//
//   - every shape lives on the GPU once; a morph only rebinds two buffers
//   - each particle leaves its shape a little after its neighbour (a stagger
//     from its seed), swirls mid-flight and settles, so a morph reads as a
//     swarm moving rather than a crossfade
//   - perspective, slow drift, a pulse that travels outward from the centre,
//     depth of field (out-of-focus points grow and dim, like a lens), and
//     additive light so dense areas glow on their own
//
// It draws only when asked (see stage.tsx, which stops it off screen, in a
// background tab and under reduced motion).

import type { Points } from "@/lib/cinematic/shapes";

export type Frame = {
  from: string;
  to: string;
  /** 0 at `from`, 1 at `to`. */
  morph: number;
  time: number;
  /** How busy MAIRO is: faster, wider drift. 0..1 */
  energy: number;
  /** A ripple outward from the centre. 0..1 */
  pulse: number;
  /** Mid-morph swirl. */
  turbulence: number;
  /** Pushes every point outward, into the dark. */
  disperse: number;
  yaw: number;
  pitch: number;
  distance: number;
  /** Point size, in scene units. */
  size: number;
  /** Overall brightness. */
  gain: number;
  /** Distance of the plane in focus. */
  focus: number;
  /** Where on screen the shape sits, in scene units from the centre. */
  offsetX: number;
  offsetY: number;
};

const VERT = `#version 300 es
in vec3 aA;
in vec3 aB;
in vec4 aSeed;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uMorph, uTime, uEnergy, uPulse, uDisperse, uTurb, uSize, uDpr, uFocus;
uniform vec2 uOffset;
out float vAlpha;
out float vHot;
void main() {
  float s = aSeed.x;
  float t = clamp(uMorph * 1.4 - s * 0.4, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 p = mix(aA, aB, t);
  float mid = sin(3.14159265 * t);
  p += vec3(sin(s * 91.0 + uTime * 0.9), cos(aSeed.y * 77.0 + uTime * 0.8), sin(aSeed.z * 63.0 + uTime * 0.7)) * mid * uTurb;
  float drift = 0.018 + uEnergy * 0.05;
  p += drift * vec3(sin(uTime * 0.7 + s * 40.0), cos(uTime * 0.6 + aSeed.y * 40.0), sin(uTime * 0.5 + aSeed.z * 40.0));
  float r = length(p);
  p *= 1.0 + uPulse * 0.06 * sin(uTime * 5.0 - r * 4.0);
  if (r > 0.0001) p += (p / r) * uDisperse * (0.4 + aSeed.w * 2.2);
  vec4 mv = uView * vec4(p, 1.0);
  mv.xy += uOffset;
  gl_Position = uProj * mv;
  float depth = -mv.z;
  float blur = abs(depth - uFocus);
  float size = uSize * (0.55 + aSeed.w * 0.9) * (1.0 + blur * 0.32);
  gl_PointSize = clamp(size * uDpr * 260.0 / max(depth, 0.1), 1.0, 72.0);
  vAlpha = (0.5 + 0.5 * aSeed.y) / (1.0 + blur * blur * 0.22);
  vAlpha *= smoothstep(22.0, 7.0, depth);
  vHot = step(0.9, aSeed.z) * 0.8 + uEnergy * 0.25 + uPulse * 0.2;
}`;

const FRAG = `#version 300 es
precision mediump float;
in float vAlpha;
in float vHot;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uGain;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = exp(-d * 3.4);
  if (a < 0.012) discard;
  vec3 col = mix(uColA, uColB, clamp(vHot, 0.0, 1.0));
  float al = a * vAlpha * uGain;
  outColor = vec4(col * al, al);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

/** Column-major view: translate(0,0,-d) · rotX(pitch) · rotY(yaw). */
function view(yaw: number, pitch: number, d: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return new Float32Array([cy, sp * sy, -cp * sy, 0, 0, cp, sp, 0, sy, -sp * cy, cp * cy, 0, 0, 0, -d, 1]);
}

export const FOV = (40 * Math.PI) / 180;

export class ParticleEngine {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buffers = new Map<string, WebGLBuffer>();
  private u: Record<string, WebGLUniformLocation | null> = {};
  private loc: { a: number; b: number; seed: number };
  private aspect = 1;
  private dpr = 1;
  readonly count: number;

  constructor(
    canvas: HTMLCanvasElement,
    count: number,
    private look: { a: [number, number, number]; b: [number, number, number]; additive: boolean },
  ) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("no webgl2");
    this.gl = gl;
    this.count = count;
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    this.program = p;
    for (const n of ["uProj", "uView", "uMorph", "uTime", "uEnergy", "uPulse", "uDisperse", "uTurb", "uSize", "uDpr", "uFocus", "uColA", "uColB", "uGain", "uOffset"]) this.u[n] = gl.getUniformLocation(p, n);
    this.loc = { a: gl.getAttribLocation(p, "aA"), b: gl.getAttribLocation(p, "aB"), seed: gl.getAttribLocation(p, "aSeed") };
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    // Each particle's own randomness: stagger, brightness, colour, size.
    const seeds = new Float32Array(count * 4);
    let s = 1234567;
    for (let i = 0; i < seeds.length; i++) {
      s = (s * 16807) % 2147483647;
      seeds[i] = s / 2147483647;
    }
    const sb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.loc.seed);
    gl.vertexAttribPointer(this.loc.seed, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.loc.a);
    gl.enableVertexAttribArray(this.loc.b);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
  }

  /** Puts a shape on the GPU, once. */
  addShape(key: string, points: Points) {
    if (this.buffers.has(key)) return;
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, points.subarray(0, this.count * 3), gl.STATIC_DRAW);
    this.buffers.set(key, b);
  }

  has(key: string) {
    return this.buffers.has(key);
  }

  resize(width: number, height: number, dpr: number) {
    const c = this.gl.canvas as HTMLCanvasElement;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.aspect = width / Math.max(1, height);
    this.dpr = dpr;
    this.gl.viewport(0, 0, w, h);
  }

  render(f: Frame) {
    const gl = this.gl;
    const a = this.buffers.get(f.from);
    const b = this.buffers.get(f.to) ?? a;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!a || !b) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, a);
    gl.vertexAttribPointer(this.loc.a, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.vertexAttribPointer(this.loc.b, 3, gl.FLOAT, false, 0, 0);
    if (this.look.additive) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(this.u.uProj, false, perspective(FOV, this.aspect, 0.1, 60));
    gl.uniformMatrix4fv(this.u.uView, false, view(f.yaw, f.pitch, f.distance));
    gl.uniform1f(this.u.uMorph, f.morph);
    gl.uniform1f(this.u.uTime, f.time);
    gl.uniform1f(this.u.uEnergy, f.energy);
    gl.uniform1f(this.u.uPulse, f.pulse);
    gl.uniform1f(this.u.uDisperse, f.disperse);
    gl.uniform1f(this.u.uTurb, f.turbulence);
    gl.uniform1f(this.u.uSize, f.size);
    gl.uniform1f(this.u.uDpr, this.dpr);
    gl.uniform1f(this.u.uFocus, f.focus);
    gl.uniform3fv(this.u.uColA, this.look.a);
    gl.uniform3fv(this.u.uColB, this.look.b);
    gl.uniform1f(this.u.uGain, f.gain);
    gl.uniform2f(this.u.uOffset, f.offsetX, f.offsetY);
    gl.drawArrays(gl.POINTS, 0, this.count);
  }

  dispose() {
    const gl = this.gl;
    for (const b of this.buffers.values()) gl.deleteBuffer(b);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    // Not loseContext(): the same canvas can be mounted again (React does
    // exactly that in development), and a lost context never comes back.
  }
}

/** Whether this browser can run the engine at all. */
export function webgl2Available(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/** Electric blue, and the white-blue of its hottest points. */
export const ELECTRIC: { a: [number, number, number]; b: [number, number, number] } = { a: [0.16, 0.45, 1.0], b: [0.78, 0.9, 1.0] };
/** On a light page: deeper blue, drawn over rather than added as light. */
export const ELECTRIC_ON_LIGHT: { a: [number, number, number]; b: [number, number, number] } = { a: [0.05, 0.25, 0.85], b: [0.1, 0.45, 1.0] };
