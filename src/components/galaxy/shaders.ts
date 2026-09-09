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

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;

out vec2 vLocal;
out vec3 vCentre;
out vec3 vColor;
out float vSeed;
out float vRadius;

void main() {
  vec3 world = aCentre + (uRight * aCorner.x + uUp * aCorner.y) * aRadius;
  gl_Position = uViewProj * vec4(world, 1.0);
  vLocal = aCorner;
  vCentre = aCentre;
  vColor = aColor;
  vSeed = aSeed;
  vRadius = aRadius;
}
`;

export const PLANET_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vLocal;
in vec3 vCentre;
in vec3 vColor;
in float vSeed;
in float vRadius;

out vec4 outColor;

uniform sampler3D uNoise;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uReveal;
uniform float uTime;

float fbm3(vec3 p) {
  vec4 n = texture(uNoise, p);
  return n.r * 0.5333 + n.g * 0.2667 + n.b * 0.1333 + n.a * 0.0667;
}

void main() {
  float r2 = dot(vLocal, vLocal);
  if (r2 > 1.0) discard;

  vec3 toCam = normalize(uCamPos - vCentre);
  float z = sqrt(max(1.0 - r2, 0.0));

  // The surface normal, rebuilt from the flat quad. The two screen axes give
  // the across-the-disc part and the square root gives the height, which is
  // all a sphere is from this side.
  vec3 n = normalize(uRight * vLocal.x + uUp * vLocal.y + toCam * z);

  // Lit by the galaxy. Not by an invented sun off-camera — the core is the
  // brightest thing in the scene and it would be the light source, so the
  // terminator always sits at the right angle relative to what the viewer can
  // already see.
  vec3 L = normalize(-vCentre);

  // Wrapped, not clamped. A galaxy is not a point source — from a planet
  // sitting inside one it is an enormous extended light filling half the sky,
  // and light from a source that large wraps well past the terminator. Clamped
  // Lambert gave a hard-edged black hemisphere and every world read as a hole
  // cut out of the frame rather than an object in it.
  float wrap = dot(n, L) * 0.5 + 0.5;
  float lit = pow(wrap, 1.5);

  // Surface. Sampled in the sphere's own frame so it turns with the world
  // rather than sliding across it as the camera moves.
  vec3 q = n * (1.35 + vSeed * 1.4) + vSeed * 27.0;
  float detail = fbm3(q) * 0.62 + fbm3(q * 2.9 + 4.1) * 0.38;

  // Above a threshold the planet is banded instead of mottled: gas giants and
  // rocky worlds in the same handful, so they do not all read as siblings.
  float banded = step(0.55, vSeed);
  float bands = 0.5 + 0.5 * sin(n.y * (9.0 + vSeed * 14.0) + detail * 3.4);
  float surface = mix(0.42 + detail * 1.30, 0.52 + bands * 0.80, banded);

  vec3 albedo = vColor * surface;

  // And a floor under it, for the light coming from everything that is not the
  // core: the rest of the disc, the arms, the stars nearby.
  vec3 ambient = vColor * 0.115;

  // Atmosphere, on the lit limb only. Strongest where the surface turns away
  // from the camera, which is where a real one is thickest along the sightline.
  float fres = pow(1.0 - z, 3.2);
  vec3 rim = vec3(0.42, 0.60, 1.05) * fres * (0.25 + lit * 1.5);

  vec3 col = albedo * (0.16 + lit * 1.25) + ambient + rim;

  // Edge coverage, so the silhouette is not a staircase.
  float edge = smoothstep(1.0, 0.965, r2);

  outColor = vec4(col * uReveal, edge * uReveal);
}
`;
