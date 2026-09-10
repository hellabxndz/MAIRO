// GLSL for the galaxy. WebGL2 / GLSL ES 3.00 throughout.
//
// The scene is drawn in four passes into a floating-point buffer:
//
//   1. the volume — one fullscreen raymarch through the galactic disc, at a
//      fraction of the canvas resolution, giving the dust, the nebulae and the
//      glow of the core;
//   2. the stars — three sets of GPU points, additively blended over it;
//   3. bloom — bright-pass, then a separable blur at quarter resolution;
//   4. the composite — tone map, bloom, vignette, grain.
//
// Float buffers matter here. The core is hundreds of times brighter than the
// faint halo, and an 8-bit intermediate would clip the first and quantise the
// second into bands. Working in HDR and tone mapping once at the end is what
// keeps a genuinely dark sky dark while the core still blooms.

/** Shared: the density field of the galaxy. Used by the volume and the stars. */
const FIELD = /* glsl */ `
uniform sampler3D uNoise;
uniform float uArmPitch;
uniform float uReveal;

const float R_DISC   = 1000.0;
const float R_SCALE  = 250.0;
const float H_DISC   = 18.0;
const float R_BULGE  = 135.0;

/** Four octaves of tileable value noise from a single fetch. */
float fbm(vec3 p) {
  vec4 n = texture(uNoise, p);
  return n.r * 0.5333 + n.g * 0.2667 + n.b * 0.1333 + n.a * 0.0667;
}

/**
 * Where the arms are, as a number from zero to one.
 *
 * Two major arms and two minor ones between them, which is the structure the
 * Milky Way actually has — a grand-design two-armed spiral is prettier and
 * belongs to a different galaxy. The minor pair carries about a third of the
 * weight and is offset in phase so it does not simply thicken the major arms.
 *
 * Shared by the gas and the dust, with the dust passing a phase shift, so the
 * dark lanes track the same arms the light does instead of drifting across
 * them.
 */
float armField(float r, float theta, float shift) {
  float w = log(max(r, 40.0) / 40.0) / uArmPitch;
  float major = pow(0.5 + 0.5 * cos(theta * 2.0 - w * 2.0 + shift), 2.2);
  float minor = pow(0.5 + 0.5 * cos(theta * 4.0 - w * 4.0 + 1.9 + shift), 2.8);
  return major * 0.68 + minor * 0.32;
}

/**
 * How much gas sits at a point, before any noise.
 *
 * An exponential disc with a flare, a bar-stretched bulge, and a spiral term.
 * The spiral is deliberately a little too clean — a pure cosine ridge in the
 * arm phase — because the brief is not a photograph of the galaxy, it is what
 * the galaxy would look like if something had tidied it up.
 */
float discDensity(vec3 p) {
  float r = length(p.xz);
  float t = r / R_DISC;

  // Radial falloff, with the very centre hollowed slightly so the bulge reads
  // as a distinct object rather than the disc getting brighter forever.
  float radial = exp(-r / R_SCALE) * smoothstep(0.0, 0.10, t);

  // Flare: thin at the centre, thicker at the rim.
  float h = H_DISC * (0.55 + t * 1.15);
  float vert = exp(-abs(p.y) / h);

  // Spiral arms.
  float theta = atan(p.z, p.x);
  float arm = armField(r, theta, 0.0);
  // The arms lose definition towards the middle, where the bar takes over.
  float armMix = smoothstep(0.05, 0.42, t);
  // Pushed harder than a photograph would be. The arms are meant to be a
  // little too well defined and the space between them a little too clean —
  // this is the galaxy as something extremely capable would have drawn it, not
  // as a telescope found it.
  float spiral = mix(1.0, 0.18 + 2.35 * arm, armMix);

  float disc = radial * vert * spiral;

  // The bulge, flattened and stretched into a bar.
  vec3 b = vec3(p.x / 1.55, p.y / 0.60, p.z);
  float bulge = exp(-length(b) / (R_BULGE * 0.40)) * 2.30;

  return disc + bulge;
}

/**
 * The dust: the same disc, but in a thinner layer and with much heavier
 * structure.
 *
 * Concentrating the dust into a thinner sheet than the light is the whole
 * reason a galaxy has a dark lane down the middle of it rather than just
 * looking dimmer in places.
 */
/**
 * Everything in dustDensity except the second noise octave.
 *
 * The star pass evaluates dust four times per star, and at four hundred
 * thousand stars the difference between one texture fetch and two is over a
 * million fetches a frame in the vertex shader. The second octave decides what
 * the edge of a dust lane looks like up close, and a star is a single pixel:
 * it cannot show the difference. The volume pass, which can, still uses both.
 */
float dustDensityFast(vec3 p) {
  float r = length(p.xz);
  float t = r / R_DISC;
  float h = H_DISC * (0.22 + t * 0.62);
  float base = exp(-r / (R_SCALE * 1.15)) * exp(-abs(p.y) / h);

  float arm = armField(r, atan(p.z, p.x), -0.85);
  float lane = mix(1.0, 0.16 + 2.80 * arm, smoothstep(0.04, 0.34, t));

  float n = pow(clamp(fbm(p * 0.00135) * 2.05, 0.0, 1.0), 2.1);
  return base * lane * n;
}

float dustDensity(vec3 p, float smooth_) {
  float r = length(p.xz);
  float t = r / R_DISC;
  // Thinner than the light by a factor of three or so. This is the whole
  // reason a spiral galaxy has a dark lane through it rather than simply
  // looking dimmer in patches: the absorbing layer is a sheet inside the
  // emitting one, so edge-on there is always more dust in the way than there
  // is light in front of it.
  float h = H_DISC * (0.22 + t * 0.62);
  float base = exp(-r / (R_SCALE * 1.15)) * exp(-abs(p.y) / h);

  // Dust piles up on the inner edge of each arm, a quarter turn ahead of the
  // stars. Giving it its own phase is what produces lanes *between* the arms
  // instead of a haze that dims everything equally.
  float arm = armField(r, atan(p.z, p.x), -0.85);
  float lane = mix(1.0, 0.16 + 2.80 * arm, smoothstep(0.04, 0.34, t));

  vec3 q = p * 0.00135;
  float n = fbm(q) * 0.62 + fbm(q * 3.1 + 11.3) * 0.38;
  n = pow(clamp(n * 2.05, 0.0, 1.0), 2.1);
  return base * lane * mix(n, 0.5, smooth_);
}
`;

export const STAR_VERT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

// Locations are pinned in the shader rather than bound from JavaScript.
// glBindAttribLocation only takes effect if it is called before linking, and
// getting that order wrong silently mismaps every attribute — the galaxy still
// draws, out of colours and brightnesses read from the wrong offsets.
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aBright;
layout(location = 3) in float aSeed;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uPixelScale;   // half the drawing-buffer height, for point sizing
uniform float uSizeScale;
uniform float uExtinction;
uniform float uFlux;
uniform float uFar;

out vec3 vColor;
out float vIntensity;
out float vSeed;

${FIELD}

void main() {
  vec3 toCam = uCamPos - aPos;
  float dist = max(length(toCam), 1.0);
  vec3 dir = toCam / dist;

  // How much dust the light had to come through to reach us.
  //
  // Four taps along the line of sight rather than a single lookup at the star:
  // one sample tells you how dusty it is where the star is, which is not the
  // question. Dust lanes are foreground objects, and a star is dimmed by what
  // lies between, so the samples have to be spread along the path. Four is the
  // point where adding more stops changing the picture.
  float span = min(dist, 900.0);
  float tau = 0.0;
  for (int i = 0; i < 3; i++) {
    float s = (float(i) + 0.5) / 3.0;
    tau += dustDensityFast(aPos + dir * (span * s));
  }
  tau *= span * (1.0 / 3.0) * uExtinction;

  // Redder light gets through thicker dust. This is why dust lanes go amber at
  // their edges instead of simply fading to grey, and it is most of what makes
  // the warm side of the picture feel like starlight rather than a colour wash.
  vec3 transmit = exp(-tau * vec3(0.72, 1.00, 1.42));

  gl_Position = uViewProj * vec4(aPos, 1.0);

  // Inverse square, once. The received light from a point falls off with the
  // square of the distance and that is the only distance term there should be;
  // an earlier version also scaled by the lost sprite area, which is the same
  // physics applied twice and made everything past a thousand units vanish.
  float lum = aBright * uFlux / (dist * dist + 1.0);

  // The sprite grows with brightness, and the peak is divided by the area it
  // now covers, so the total light a star puts on the screen stays fixed as it
  // spreads. Below a pixel the size pins at one and the peak falls instead,
  // which is what stops distant stars flickering as they cross that boundary.
  //
  // The exponent is well under a half and the cap is small on purpose. Sizing
  // by the square root is the physically tidy choice and it is wrong to look
  // at: flying into the core, the nearest stars grew to forty pixels and the
  // galaxy turned into a wall of glowing balls. A star is a point at every
  // distance. Brightness should carry almost all of the range, and the size
  // should only open up enough to give the bloom something to catch.
  float size = clamp(uSizeScale * pow(lum, 0.28), 1.0, 9.0);
  gl_PointSize = size;

  // A slow, very slight variation in brightness. Real stars do not twinkle in
  // vacuum; this is here because a completely static field of points reads as
  // a texture, and the eye needs a little life to accept it as distance.
  float tw = 0.90 + 0.10 * sin(uTime * (0.35 + aSeed * 0.9) + aSeed * 40.0);

  // Reveal. Each star has its own threshold, so they arrive scattered across
  // the opening rather than all fading up together — and because the seed is
  // uncorrelated with position, the galaxy assembles out of the dark evenly
  // instead of wiping in from one side.
  //
  // The stars finish well before the reveal does. They are the first stage of
  // three: points, then dust, then the shape of the galaxy behind both.
  float gate = smoothstep(aSeed * 0.52, aSeed * 0.52 + 0.20, uReveal);

  // Fades out entirely before the far plane, so nothing pops as it crosses it.
  float horizon = 1.0 - smoothstep(uFar * 0.72, uFar, dist);

  vColor = aColor * transmit;
  vIntensity = (lum / (size * size)) * tw * gate * horizon;
  vSeed = aSeed;
}
`;

export const STAR_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec3 vColor;
in float vIntensity;
in float vSeed;

out vec4 outColor;

void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;

  // A tight core with a wide, faint skirt. One Gaussian gives a fuzzy ball;
  // the second, much broader term is the halo every real optical system puts
  // around a bright point, and it is what stops the brightest stars looking
  // like stickers.
  float core = exp(-r2 * 7.5);
  float skirt = exp(-r2 * 1.6) * 0.16;

  outColor = vec4(vColor * (core + skirt) * vIntensity, 1.0);
}
`;

/** The near dust motes: same idea, but positioned relative to the camera. */
export const MOTE_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aBright;
layout(location = 3) in float aSeed;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uDrift;
uniform float uTime;
uniform float uPixelScale;
uniform float uBox;
uniform float uReveal;

out vec3 vColor;
out float vIntensity;

void main() {
  // A lattice fixed in world space, wrapped into the cell the camera is in.
  //
  // The distinction matters. Positioning these relative to the camera keeps
  // them permanently in front of it — they travel along, and the nearest thing
  // in the scene never moves, which is exactly what makes a background feel
  // like a background. Fixed in the world and wrapped, they stream past as the
  // camera flies, and they are the only layer close enough for that to read as
  // speed.
  vec3 base = aPos * uBox + uDrift * uTime;
  vec3 p = mod(base - uCamPos + uBox, 2.0 * uBox) - uBox;
  vec3 world = uCamPos + p;

  float dist = max(length(p), 0.05);
  gl_Position = uViewProj * vec4(world, 1.0);
  gl_PointSize = clamp(uPixelScale * aBright * 0.012 / dist, 1.0, 160.0);

  // Fade out both very close and very far, so nothing appears or vanishes
  // abruptly at the edge of the box.
  float near = smoothstep(0.0, 0.25, dist);
  float far = 1.0 - smoothstep(uBox * 0.55, uBox * 0.98, dist);
  vColor = aColor;
  vIntensity = 0.030 * near * far * smoothstep(0.55, 1.0, uReveal);
}
`;

export const MOTE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec3 vColor;
in float vIntensity;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.2);
  outColor = vec4(vColor * a * vIntensity, 1.0);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // One oversized triangle rather than two triangles. No diagonal seam, and
  // the fragments along it are never shaded twice.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const VOLUME_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vUv;
out vec4 outColor;

uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform float uTime;
uniform int uSteps;
uniform float uDensity;
uniform float uDust;
uniform float uEnergy;
uniform float uSmooth;

${FIELD}

/** Ray against the slab |y| < h intersected with the cylinder r < R. */
bool bounds(vec3 ro, vec3 rd, float R, float h, out float t0, out float t1) {
  // Slab.
  float ty0, ty1;
  if (abs(rd.y) < 1e-6) {
    if (abs(ro.y) > h) return false;
    ty0 = -1e9; ty1 = 1e9;
  } else {
    float a = (-h - ro.y) / rd.y;
    float b = (h - ro.y) / rd.y;
    ty0 = min(a, b); ty1 = max(a, b);
  }

  // Infinite cylinder about the y axis.
  vec2 o = ro.xz, d = rd.xz;
  float A = dot(d, d);
  float B = 2.0 * dot(o, d);
  float C = dot(o, o) - R * R;
  float tc0, tc1;
  if (A < 1e-9) {
    if (C > 0.0) return false;
    tc0 = -1e9; tc1 = 1e9;
  } else {
    float disc = B * B - 4.0 * A * C;
    if (disc < 0.0) return false;
    float s = sqrt(disc);
    tc0 = (-B - s) / (2.0 * A);
    tc1 = (-B + s) / (2.0 * A);
  }

  t0 = max(max(ty0, tc0), 0.0);
  t1 = min(ty1, tc1);
  return t1 > t0;
}

/** Colour of the gas at a point: gold at the core, silver, then violet out. */
vec3 gasColour(vec3 p) {
  float r = length(p.xz) / R_DISC;
  vec3 core   = vec3(1.00, 0.760, 0.470);
  vec3 mid    = vec3(0.780, 0.800, 0.930);
  vec3 outer  = vec3(0.430, 0.480, 0.960);
  vec3 c = mix(core, mid, smoothstep(0.045, 0.30, r));
  return mix(c, outer, smoothstep(0.28, 0.85, r));
}

void main() {
  // Reconstruct the world ray for this pixel.
  vec4 near = uInvViewProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 far  = uInvViewProj * vec4(vUv * 2.0 - 1.0,  1.0, 1.0);
  vec3 ro = uCamPos;
  vec3 rd = normalize(far.xyz / far.w - near.xyz / near.w);

  float t0, t1;
  if (!bounds(ro, rd, R_DISC * 1.25, H_DISC * 10.0, t0, t1)) {
    outColor = vec4(0.0);
    return;
  }
  t1 = min(t1, t0 + 4200.0);

  int steps = uSteps;
  float span = t1 - t0;

  // Jitter, so the sampling error becomes grain instead of visible shells
  // wherever the density changes quickly along the ray.
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

  vec3 acc = vec3(0.0);
  float trans = 1.0;

  for (int i = 0; i < 96; i++) {
    if (i >= steps || trans < 0.004) break;

    // Steps are spaced quadratically, not evenly.
    //
    // This scene has a depth range of four decades — motes a few units away
    // and a galaxy four thousand units deep — and an even march spends the
    // same effort on both. Once the camera is inside the disc that is fatal:
    // the first sample is already fifty units long, the ray saturates inside
    // it, and everything nearby renders as one flat smear. Quadratic spacing
    // puts most of the samples in the near field where the detail the viewer
    // can actually resolve is, and lets the far field, which is a smooth glow
    // anyway, be sampled coarsely.
    float u0 = float(i) / float(steps);
    float u1 = float(i + 1) / float(steps);
    float tA = t0 + span * u0 * u0;
    float tB = t0 + span * u1 * u1;
    float dt = tB - tA;
    float t = tA + dt * jitter;

    vec3 p = ro + rd * t;

    float gas = discDensity(p);
    if (gas > 0.0018) {
      vec3 q = p * 0.00092;
      // Two octaves, not three. The texture already carries four inside each
      // fetch, so a second lookup at a different scale is the sixth through
      // eighth octave — detail well below what a step this long can resolve.
      float n = fbm(q) * 0.66 + fbm(q * 3.4 + 5.1) * 0.34;
      n = mix(n, 0.55, uSmooth);
      // Log-normal-ish: a long bright tail, so a few clouds are luminous and
      // most are faint. A symmetric field averages into fog.
      float cloud = exp((n - 0.5) * 3.6);

      float emit = gas * cloud * uDensity;

      // The faint structure inside the clouds. It only shows up in a narrow
      // band of density, so it reads as something in the gas rather than as
      // lines drawn on top of it — the viewer should not be able to decide
      // whether it is really there.
      float ridge = 1.0 - abs(2.0 * fbm(p * 0.0043 + vec3(0.0, uTime * 0.004, 0.0)) - 1.0);
      float filament = pow(clamp(ridge, 0.0, 1.0), 9.0)
                     * smoothstep(0.02, 0.12, gas) * (1.0 - smoothstep(0.35, 1.1, gas));

      vec3 col = gasColour(p) + vec3(0.30, 0.55, 1.0) * filament * uEnergy;

      // Both terms are per unit length and multiplied by the step, so the
      // result does not change when the step count does. Getting that wrong is
      // why the first version rendered a solid blue puck: the emission was
      // being integrated over steps sixty units long without ever being scaled
      // by them, so every ray saturated within a handful of samples.
      float dust = dustDensity(p, uSmooth) * uDust;
      float sigma = (emit * 0.35 + dust) * dt;

      acc += trans * col * emit * dt;
      trans *= exp(-sigma);
    }
  }

  outColor = vec4(acc * uReveal, 1.0 - trans);
}
`;

export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uThreshold;
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee: a hard cut makes the bloom switch on along a visible contour
  // wherever a gradient crosses the threshold.
  float k = smoothstep(uThreshold, uThreshold * 2.2, l);
  outColor = vec4(c * k, 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uDir;   // texel-sized step, horizontal or vertical
void main() {
  // Nine taps at linearly-interpolated offsets, which buys the reach of a
  // seventeen-tap Gaussian for nine fetches.
  vec3 sum = texture(uSrc, vUv).rgb * 0.2270270270;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  sum += (texture(uSrc, vUv + o1).rgb + texture(uSrc, vUv - o1).rgb) * 0.3162162162;
  sum += (texture(uSrc, vUv + o2).rgb + texture(uSrc, vUv - o2).rgb) * 0.0702702703;
  outColor = vec4(sum, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
uniform float uExposure;
uniform float uTime;
uniform float uVignette;

void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomAmount;
  c *= uExposure;

  // arcsinh, the stretch astronomers use. It holds faint nebulosity up where
  // it can be seen without driving the core to a flat white disc, which is
  // exactly what a plain gamma curve does to a picture with this much dynamic
  // range in it.
  float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  float s = asinh(l * 9.0) / asinh(9.0);
  c *= s / l;

  // The brightest parts desaturate, the way an overexposed sensor does.
  float peak = clamp((s - 0.75) / 0.25, 0.0, 1.0);
  c = mix(c, vec3(s), peak * 0.80);

  vec2 d = vUv - 0.5;
  c *= 1.0 - uVignette * dot(d, d) * 1.55;

  // A little noise, dithering the darkest values. Without it the near-black
  // areas quantise into visible contour rings on an 8-bit display, which after
  // all this work is a shame.
  float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  c += (g - 0.5) * 0.0035;

  outColor = vec4(max(c, 0.0), 1.0);
}
`;

/** Straight texture blit. Used to lift the low-resolution volume pass up. */
export const COPY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uScale;
void main() {
  vec4 c = texture(uSrc, vUv);
  outColor = vec4(c.rgb * uScale, 1.0);
}
`;

/**
 * Worlds, close enough to pass.
 *
 * Drawn as instanced camera-facing quads and turned into spheres in the
 * fragment shader: the quad's own coordinates give the disc, and the height of
 * the sphere above it is just sqrt(1 - r²), which is enough to build a real
 * surface normal from. Six planets is twelve triangles — the entire layer
 * costs less than a hundredth of what the dust does.
 *
 * The light comes from the galactic core. That is the detail that keeps these
 * from looking stuck on: they are lit by the thing behind them, so the lit
 * limb always faces the bright part of the frame and the rest of each world is
 * a silhouette against the stars.
 */
export const PLANET_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;    // the quad, -1..1
layout(location = 1) in vec3 aCentre;    // per instance
layout(location = 2) in float aRadius;
layout(location = 3) in vec3 aColor;
layout(location = 4) in float aSeed;
layout(location = 5) in vec4 aOrient;    // unit quaternion, planet space -> world
layout(location = 6) in float aKind;     // 0 rocky, 1 gas giant, 2 Earth
layout(location = 7) in float aLayer;    // which slice of the surface atlas

uniform mat4 uViewProj;
uniform vec3 uRight;
uniform vec3 uUp;

out vec2 vLocal;
out vec3 vCentre;
out vec3 vColor;
out float vSeed;
out vec4 vOrient;
out float vKind;
out float vLayer;

void main() {
  vec3 world = aCentre + (uRight * aCorner.x + uUp * aCorner.y) * aRadius;
  gl_Position = uViewProj * vec4(world, 1.0);
  vLocal = aCorner;
  vCentre = aCentre;
  vColor = aColor;
  vSeed = aSeed;
  vOrient = aOrient;
  vKind = aKind;
  vLayer = aLayer;
}
`;

export const PLANET_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
// GLSL ES 3.00 has no default precision for sampler array types, and omitting
// it is a compile error rather than a warning.
precision highp sampler2DArray;

in vec2 vLocal;
in vec3 vCentre;
in vec3 vColor;
in float vSeed;
in vec4 vOrient;
in float vKind;
in float vLayer;

out vec4 outColor;

uniform sampler3D uNoise;
uniform sampler2D uEarthDay;
uniform sampler2D uEarthNight;
uniform sampler2DArray uPlanetAlbedo;
uniform sampler2DArray uPlanetRelief;
uniform float uEarthLoaded;
uniform float uMapsLoaded;
uniform vec2 uReliefTexel;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uReveal;
uniform float uTime;
uniform float uDetail;

float fbm3(vec3 p) {
  vec4 n = texture(uNoise, p);
  return n.r * 0.5333 + n.g * 0.2667 + n.b * 0.1333 + n.a * 0.0667;
}

/** Rotate v by the inverse of unit quaternion q — world space into planet space. */
vec3 unrotate(vec4 q, vec3 v) {
  vec3 u = -q.xyz;
  return v + 2.0 * cross(u, cross(u, v) + q.w * v);
}

/** And the other way: planet space back out into world space. */
vec3 rotate(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

/**
 * Perturbs the surface normal from the elevation map.
 *
 * This is the single thing that separates a photographed surface from a
 * painted one. Without it every world is a smooth ball with a picture on it,
 * lit by one smooth gradient, and no amount of detail in the picture fixes
 * that — the eye reads the lighting, not the texture. With it, crater rims
 * catch the light on one side and shade on the other, and the terminator
 * breaks up into thousands of small shadows the way a real one does.
 *
 * The height difference across two texels gives the slope; the two tangent
 * directions on the sphere turn that into a tilt. Longitude is divided by the
 * cosine of latitude because an equirectangular map squeezes it towards the
 * poles, and without that correction every surface tilts harder the further
 * from the equator it gets.
 */
vec3 relief(vec3 np, vec2 uv, float layer, float lat, float strength) {
  vec2 t = uReliefTexel;
  float hl = texture(uPlanetRelief, vec3(uv - vec2(t.x, 0.0), layer)).r;
  float hr = texture(uPlanetRelief, vec3(uv + vec2(t.x, 0.0), layer)).r;
  float hd = texture(uPlanetRelief, vec3(uv - vec2(0.0, t.y), layer)).r;
  float hu = texture(uPlanetRelief, vec3(uv + vec2(0.0, t.y), layer)).r;

  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), np));
  vec3 north = cross(np, east);

  // The longitude correction blows up at the poles, where an equirectangular
  // map has squeezed a single point across an entire row. Clamping it is not
  // quite enough on its own — the last few degrees still amplify into a
  // starburst — so the relief also fades out there. Nothing is lost: the poles
  // are edge-on from anywhere the planet is worth looking at.
  float coslat = max(cos(lat), 0.35);
  float polar = 1.0 - smoothstep(0.80, 0.98, abs(np.y));
  float dlon = (hr - hl) / coslat;
  float dlat = (hu - hd);

  return normalize(np - (east * dlon + north * dlat) * strength * polar);
}

/**
 * Equirectangular lookup that survives the seam.
 *
 * Longitude wraps from +180 to -180 down one meridian, and the texture
 * derivatives across that column come out enormous, so the hardware picks the
 * smallest mip level it has and draws a blurred grey line from pole to pole.
 * Correcting the derivatives by a whole turn where they have obviously wrapped
 * and sampling with textureGrad removes it.
 */
vec4 equirect(sampler2D tex, vec2 uv) {
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  if (abs(dx.x) > 0.5) dx.x -= sign(dx.x);
  if (abs(dy.x) > 0.5) dy.x -= sign(dy.x);
  return textureGrad(tex, uv, dx, dy);
}

/**
 * Two octaves, with the second warped by the first — or one, on a device that
 * cannot afford it.
 *
 * Warping is what stops a surface looking like noise: the second octave is
 * displaced by the first, so features stretch and curl into each other instead
 * of sitting in an even lattice. It also doubles the texture fetches, and at
 * the lowest quality tier the planets are drawn into a third-resolution buffer
 * where the difference cannot be resolved anyway.
 */
float warped(vec3 p) {
  float a = fbm3(p);
  if (uDetail < 0.5) return a;
  vec3 q = p + vec3(a, a * 0.7, a * 1.3) * 0.55;
  return fbm3(q * 2.1) * 0.55 + a * 0.45;
}

void main() {
  float r2 = dot(vLocal, vLocal);
  if (r2 > 1.0) discard;

  vec3 toCam = normalize(uCamPos - vCentre);
  float z = sqrt(max(1.0 - r2, 0.0));

  // The surface normal, rebuilt from the flat quad: the two screen axes give
  // the across-the-disc part and the square root gives the height, which is
  // all a sphere is from this side.
  vec3 n = normalize(uRight * vLocal.x + uUp * vLocal.y + toCam * z);

  // Into the planet's own frame, so the surface turns with the world instead
  // of sliding across it as the camera moves.
  vec3 np = normalize(unrotate(vOrient, n));

  // Lit by the galaxy. Wrapped, not clamped: from inside a galaxy the light is
  // an enormous extended source filling half the sky, and light that broad
  // reaches well past the terminator. Clamped Lambert gave every world a hard
  // black hemisphere and they read as holes cut in the frame.
  vec3 L = normalize(-vCentre);
  float ndl = dot(n, L);
  // The exponent sets how hard the terminator falls. Low values wrap the light
  // most of the way round and every planet reads as evenly lit.
  //
  // Earth gets a much harder falloff than the rest. The others need the wrap,
  // because a dark hemisphere with nothing in it is a hole in the frame. Earth
  // has its own light on the dark side, and dimming the night down to almost
  // nothing is exactly what lets the cities carry it.
  float lit = pow(ndl * 0.5 + 0.5, vKind > 1.5 ? 3.6 : 1.5);

  vec3 albedo;
  vec3 emissive = vec3(0.0);
  vec3 atmosphere = vec3(0.42, 0.60, 1.05);

  // Latitude and longitude on this world, for every textured path below.
  float plat = asin(clamp(np.y, -1.0, 1.0));
  float plon = atan(np.z, np.x);
  vec2 puv = vec2(plon * 0.15915494 + 0.5, 0.5 - plat * 0.31830989);

  if (vKind > 1.5 && uEarthLoaded > 0.5) {
    // ---- Earth ----
    float lat = plat;
    vec2 uv = puv;

    vec3 surface = equirect(uEarthDay, uv).rgb;

    // Cloud. The one part of this planet that has no business being accurate —
    // weather is different every day, and a photograph of a specific afternoon
    // would be a stranger choice than something that simply looks like
    // weather. Two octaves of the volume noise, turning slowly.
    vec3 cq = np * 2.6 + vec3(uTime * 0.0045, 0.0, 0.0);
    float cloud = warped(cq);
    cloud = smoothstep(0.50, 0.78, cloud);
    // Thinner over the deserts and the poles, heavier over the tropics and the
    // storm belts, which is roughly where weather is.
    cloud *= 0.35 + 0.65 * smoothstep(0.0, 0.35, abs(sin(lat * 2.1)));

    surface = mix(surface, vec3(0.90, 0.93, 0.98), cloud * 0.70);
    albedo = surface;

    // ---- the lights ----
    vec3 lights = equirect(uEarthNight, uv).rgb;

    // Only on the night side, and only through gaps in the cloud.
    float night = 1.0 - smoothstep(-0.22, 0.16, ndl);
    lights *= night * (1.0 - cloud * 0.80);

    // The flicker. Cities do not actually twinkle from orbit — this is the
    // atmosphere doing to city light what it does to starlight, and without it
    // the night side is a static texture and reads as one. Two frequencies so
    // it never falls into an obvious rhythm, and shallow enough that you notice
    // it as life rather than as an effect.
    float h = fract(sin(dot(floor(uv * 1400.0), vec2(12.9898, 78.233))) * 43758.5);
    float flicker = 0.86
      + 0.14 * sin(uTime * (1.7 + h * 4.3) + h * 62.0)
      + 0.07 * sin(uTime * (5.2 + h * 6.1) + h * 17.0);

    emissive = lights * flicker * 5.2;
    atmosphere = vec3(0.32, 0.55, 1.15);
  } else if (uMapsLoaded > 0.5) {
    // ---- a rendered surface ----
    //
    // Built offline by scripts/render-planets.py, which can afford to place
    // craters with rims and ejecta, flood the low ground with lava, cut
    // canyons and shear cloud bands along a turbulent flow. None of that fits
    // in a fragment shader, and all of it is what the surfaces were missing.
    albedo = texture(uPlanetAlbedo, vec3(puv, vLayer)).rgb;

    // Cloud tops have almost no relief; rock has a great deal.
    n = rotate(vOrient, relief(np, puv, vLayer, plat, vKind > 0.5 ? 0.30 : 1.7));
    ndl = dot(n, L);
    lit = pow(ndl * 0.5 + 0.5, 1.5);

    atmosphere = vKind > 0.5 ? vColor * 1.1 : mix(vec3(0.55, 0.58, 0.70), vColor, 0.4);
  } else if (vKind > 0.5) {
    // ---- gas giant, before the maps arrive ----
    // Bands displaced by turbulence rather than drawn straight. Latitude
    // stripes on their own read as a beach ball; letting the noise push the
    // band coordinate around is what makes them shear and curl the way a real
    // atmosphere does.
    float turb = warped(np * 1.9 + vSeed * 31.0);
    float band = np.y * (7.0 + vSeed * 12.0) + turb * 2.9;
    float bands = 0.5 + 0.5 * sin(band);
    bands = pow(bands, 1.4);

    // One storm, placed by the seed.
    vec3 spot = normalize(vec3(cos(vSeed * 14.0), -0.28 + vSeed * 0.3, sin(vSeed * 14.0)));
    float d = 1.0 - dot(np, spot);
    float storm = smoothstep(0.055, 0.004, d) * 0.75;

    vec3 dark = vColor * 0.55;
    vec3 light = vColor * 1.28;
    albedo = mix(dark, light, bands);
    albedo = mix(albedo, vec3(0.78, 0.42, 0.30), storm);
    atmosphere = vColor * 1.1;
  } else {
    // ---- rocky, before the maps arrive ----
    float base = warped(np * (1.5 + vSeed * 1.6) + vSeed * 23.0);

    // Ridged noise, which is what a cratered or eroded surface looks like:
    // sharp lines with smooth ground between, rather than the even lumpiness a
    // plain fBm gives.
    float ridge = 1.0 - abs(2.0 * fbm3(np * (4.2 + vSeed * 3.0) + 9.7) - 1.0);
    ridge = pow(clamp(ridge, 0.0, 1.0), 3.4);

    float shade = 0.52 + base * 0.95 + ridge * 0.30;

    // Ice at the poles, cut back where the surface is rough.
    float polar = smoothstep(0.72, 0.95, abs(np.y)) * (0.55 + 0.45 * base);
    albedo = vColor * shade;
    albedo = mix(albedo, vec3(0.88, 0.91, 0.96), clamp(polar, 0.0, 1.0) * 0.8);
    atmosphere = mix(vec3(0.55, 0.58, 0.70), vColor, 0.4);
  }

  // A floor under the lit side, for the light coming from everything that is
  // not the core: the rest of the disc, the arms, the stars nearby.
  vec3 ambient = albedo * (vKind > 1.5 ? 0.018 : 0.075);

  // Atmosphere. Strongest where the surface turns away from the camera, which
  // is where a real one is thickest along the sightline, and brightest on the
  // lit limb.
  float fres = pow(1.0 - z, 3.0);
  vec3 rim = atmosphere * fres * (0.20 + lit * 1.70);

  // Warm scatter right at the terminator — the sunset seen from orbit.
  float term = exp(-abs(ndl) * 12.0) * (1.0 - z * 0.55);
  rim += vec3(1.0, 0.52, 0.24) * term * 0.55;

  // Forward scattering, for a world with the light behind it.
  //
  // Most of these are backlit: they sit between the camera and the core,
  // because that is where the camera is pointed. Lit only from the front they
  // would be near-black discs in a dark corner — which is what the hero planet
  // was. Light passing through the limb of an atmosphere towards the viewer is
  // both real and the reason a backlit planet is the most beautiful way to
  // photograph one: it comes apart into a ring.
  float behind = clamp(-dot(L, toCam), 0.0, 1.0);
  rim += atmosphere * pow(1.0 - z, 2.0) * pow(behind, 2.0) * 1.45;

  vec3 col = albedo * ((vKind > 1.5 ? 0.010 : 0.17) + lit * 1.90) + ambient + rim + emissive;

  // Edge coverage, so the silhouette is not a staircase.
  float edge = smoothstep(1.0, 0.965, r2);

  outColor = vec4(col * uReveal, edge * uReveal);
}
`;

/**
 * Meteors and one spacecraft.
 *
 * Both are the same thing geometrically — a quad stretched along a direction
 * of travel — so they share a pass. A meteor is a bright head with a tapering
 * tail; the craft is a slim hull with an engine plume behind it. One draw call
 * covers the lot.
 *
 * The quad is oriented by projecting the direction of travel into the plane
 * facing the camera. That is what keeps a streak pointing the way it is
 * actually going: billboarding it flat would leave every meteor drawn
 * horizontally regardless of its path, which is the thing that makes cheap
 * versions of this look like scratches on the lens.
 */
export const TRAVELLER_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;    // x: -1 tail .. 1 nose, y: across
// The next two mean different things for the two kinds, because the two kinds
// move in completely different ways. For a meteor: a starting point and a unit
// heading, both in camera axes. For the craft: the centre of its loop, and
// then the loop's lateral radius, depth radius and bank. See craftPath.
layout(location = 1) in vec3 aOrigin;    // in camera axes: right, up, forward
layout(location = 2) in vec3 aDir;       // meteor: unit heading; craft: A, B, bank
layout(location = 3) in vec4 aParams;    // speed, period, phase, size
layout(location = 4) in vec3 aTint;
layout(location = 5) in float aKind;     // 0 meteor, 1 craft

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uTime;
uniform float uReveal;

out vec2 vLocal;
out vec3 vTint;
out float vKind;
out float vFade;
out float vSide;

// Where the craft is, a fraction of the way round its lap.
//
// A closed loop around the camera rather than a line off into nothing: it
// sweeps out to one side, turns, comes back across at a different depth, and
// keeps going. Two things about the shape are not free.
//
// It never passes behind the camera — the depth radius is smaller than the
// centre's distance — because the hull is a picture of a ship seen side-on,
// and a ship crossing the lens would have to be drawn nose-on, which a
// picture cannot do.
//
// And the loop is banked rather than flat. On a flat loop the craft heads
// straight at, then straight away from, the camera at the near and far points
// of the lap. Its motion projects to nothing on screen there, and the
// billboard's along-vector — which is that projection — degenerates and spins.
// Tilting the plane of the loop means those two moments carry vertical motion
// instead, so there is always a direction left to point the nose.
vec3 craftPath(float ang, vec3 centre, vec3 shape) {
  vec3 e1 = normalize(vec3(1.0, 0.10, 0.0));
  vec3 e2 = normalize(vec3(0.0, shape.z, 1.0));
  return centre + e1 * (shape.x * cos(ang)) + e2 * (shape.y * sin(ang));
}

void main() {
  float speed = aParams.x;
  float period = aParams.y;
  float phase = aParams.z;
  float size = aParams.w;

  float t = mod(uTime + phase, period);

  // A meteor burns for a second and a half of a much longer cycle, so the sky
  // is mostly empty and one crosses it every so often. The craft is always on
  // its way somewhere.
  float life = aKind > 0.5 ? period : 1.6;
  float u = clamp(t / life, 0.0, 1.0);

  // Both the starting point and the heading are given in the camera's own
  // axes, so a meteor always crosses the view you are actually looking at.
  //
  // Fixing them in the world was the first attempt and it does not work: the
  // camera travels thousands of units down the page, so a meteor placed for
  // the hero is a long way behind you by the pricing table, and one placed for
  // the pricing table is invisibly distant from the hero. Anchoring to the
  // camera costs nothing in realism — each one exists for a second and a half,
  // far too briefly for anyone to notice it was not there before.
  // Both kinds work out where they are and which way they are pointing in the
  // camera's own axes first, and get transformed into the world once at the
  // end. The basis is orthonormal, so doing it in this order costs nothing and
  // means neither path has to think about where the camera is.
  vec3 pos;
  vec3 heading;
  if (aKind > 0.5) {
    float ang = t * (6.28318530718 / period);
    // The tangent, by stepping a little way further round the lap. Analytic
    // would be tidier and this is a curve whose derivative nobody will ever
    // need to keep in step with the curve itself.
    float d = 0.02;
    pos = craftPath(ang, aOrigin, aDir);
    heading = normalize(craftPath(ang + d, aOrigin, aDir) - pos);
  } else {
    pos = aOrigin + aDir * (speed * t);
    heading = normalize(aDir);
  }

  vec3 head = uCamPos + uRight * pos.x + uUp * pos.y + uFwd * pos.z;
  vec3 dir = normalize(uRight * heading.x + uUp * heading.y + uFwd * heading.z);

  vec3 toCam = normalize(uCamPos - head);
  // The travel direction, flattened into the plane facing the camera.
  vec3 along = dir - toCam * dot(dir, toCam);
  float alen = length(along);
  along = alen > 1e-4 ? along / alen : normalize(cross(toCam, vec3(0.0, 1.0, 0.0)));
  vec3 across = normalize(cross(along, toCam));

  // Meteors fade in and out across their life; the craft holds steady.
  float envelope = aKind > 0.5 ? 1.0 : sin(u * 3.14159) * step(t, life);

  // The craft's quad is long because most of it is trail: the hull lives in
  // the front third and the rest is what it leaves behind.
  float len = size * (aKind > 0.5 ? 4.2 : 1.0);
  // Very thin. The first attempt was three times this and every meteor read
  // as a grey rod laid across the sky — a streak is mostly length, and the
  // width only exists so the core has something to bloom into.
  // Very thin for a meteor. The first attempt was three times this and every
  // one read as a grey rod laid across the sky — a streak is mostly length,
  // and the width only exists so the core has something to bloom into.
  float wid = size * (aKind > 0.5 ? 0.42 : 0.045);

  vec3 world = head + along * (aCorner.x * len) + across * (aCorner.y * wid);
  gl_Position = uViewProj * vec4(world, 1.0);

  vLocal = aCorner;
  vTint = aTint;
  vKind = aKind;
  vFade = envelope * smoothstep(0.35, 0.85, uReveal);
  // Which side of the craft is facing us — that is, whether it is crossing the
  // screen left to right or right to left. The sprite ships as two rows and
  // this picks between them; see the note in scripts/render-rocket.py.
  vSide = step(dot(along, uRight), 0.0);
}
`;

export const TRAVELLER_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vLocal;
in vec3 vTint;
in float vKind;
in float vFade;
in float vSide;

out vec4 outColor;

uniform float uTime;
uniform sampler2D uRocket;
uniform float uRocketLoaded;

void main() {
  if (vFade <= 0.001) discard;

  float u = vLocal.x;        // -1 at the tail, +1 at the nose
  float v = abs(vLocal.y);

  vec3 col;
  float a;

  if (vKind > 0.5) {
    // ---- the craft ----
    //
    // The hull is a picture, not a distance field. A vehicle needs panel
    // seams, a cockpit, fins with a lit edge, an engine bell and a name down
    // the side, and none of that is worth writing as shader maths for one
    // object — it is drawn once by scripts/render-rocket.py and sampled here.
    // What stays procedural is the part that has to move: the exhaust.
    //
    // The hull occupies u in 0.20..1.0 — the front forty per cent of the quad
    // — and everything behind it is wake. That region's aspect has to match
    // the sprite's exactly or the ship comes out stretched, which is why the
    // numbers here and the quad's proportions in the vertex shader are tied
    // together.
    float tail = 0.20;

    // The sprite is two rows: starboard on top, port underneath, differing
    // only in which way round the wordmark is painted. vSide picks the one
    // facing us.
    vec2 sprite = vec2(
      (u - tail) / (1.0 - tail),
      (vLocal.y * 0.5 + 0.5) * 0.5 + vSide * 0.5
    );
    vec4 ship = vec4(0.0);
    if (uRocketLoaded > 0.5 && sprite.x >= 0.0 && sprite.x <= 1.0) {
      ship = texture(uRocket, sprite);
    }

    float body = ship.a;
    vec3 metal = ship.rgb;

    // The engine. Flickers on two frequencies, because a steady glow reads as
    // a light bulb rather than combustion.
    float flick = 0.80 + 0.14 * sin(uTime * 47.0) + 0.09 * sin(uTime * 113.0 + 1.7);

    // Bright, tight exhaust immediately behind the engine bell...
    float plume = smoothstep(tail, tail - 0.16, u) * exp((u - tail) * 5.0);
    plume *= exp(-v * v * 22.0) * flick;

    // ...the glow of the bell itself...
    float glow = exp(-((u - tail) * (u - tail)) * 90.0) * exp(-v * v * 5.0) * 0.9 * flick;

    // ...and the trail, running all the way to the end of the quad, spreading
    // as it goes and thinning out. This is what makes the ship read as moving
    // rather than parked.
    float spread = mix(0.10, 0.85, smoothstep(tail, -1.0, u));
    float wake = smoothstep(tail - 0.02, tail - 0.20, u)
               * exp((u - tail) * 1.25)
               * exp(-(v * v) / (spread * spread))
               * (0.85 + 0.15 * sin(u * 30.0 - uTime * 9.0))
               // Off to nothing before the quad runs out. Without this the
               // trail still had a fifth of its brightness at the edge and
               // ended in a straight vertical cut.
               * smoothstep(-1.0, -0.62, u);

    col = metal * body
        + vec3(0.60, 0.80, 1.35) * plume * 1.8
        + vec3(0.50, 0.74, 1.30) * glow * 1.4
        + vec3(0.34, 0.55, 1.10) * wake * 0.34;
    // Alpha is occlusion, not brightness. The hull is a solid object and has
    // to cover the stars behind it; the exhaust is light and must not.
    a = body;
  } else {
    // ---- a meteor ----
    // A hot point at the head with a trail falling away behind it, narrowing
    // as it goes. Two terms: a small intense core that the bloom pass picks
    // up, and a longer, dimmer trail that gives it its direction.
    float trail = exp((u - 1.0) * 2.6);
    float taper = mix(0.14, 1.0, clamp((u + 1.0) * 0.5, 0.0, 1.0));
    float body = exp(-(v * v) / (taper * taper * 0.55)) * trail;

    float core = exp((u - 1.0) * 26.0) * exp(-v * v * 14.0);

    col = vTint * body * 1.5 + vec3(1.0, 0.97, 0.92) * core * 3.2;
    // A meteor occludes nothing at all, and zero alpha under the premultiplied
    // blend below is exactly the additive draw it had before.
    a = 0.0;
  }

  // Premultiplied: col is already scaled by whatever coverage produced it, so
  // the pass blends ONE / ONE_MINUS_SRC_ALPHA and gets both behaviours from
  // one draw — solid where the hull is, purely additive everywhere else.
  outColor = vec4(col * vFade, a * vFade);
}
`;
