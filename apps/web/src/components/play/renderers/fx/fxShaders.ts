/**
 * GLSL for the FX style. World units are CSS pixels, y up, origin at the bottom-left of
 * the stage (the hit line is y = 0). Everything that moves is driven by uniform time and
 * per-instance spawn data, so the CPU writes an instance once and never touches it again.
 * `uNoise` is a small tiling noise texture (r, g, b, a are four independent noises); it
 * stands in for per-pixel noise maths everywhere.
 */

// ── Notes ────────────────────────────────────────────────────────────────────

export const NOTE_VERTEX = /* glsl */ `
uniform float uPad;
attribute vec4 aRect;   // x, y (bottom-left), w, h
attribute vec3 aColor;  // colour in the per-note modes
attribute vec4 aState;  // sounding 0..1, flash 0..1, seed 0..1, flags (0 none, 1 missed, 2 waiting)
varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vColor;
varying vec4 vState;
varying float vWorldY;
void main() {
  vHalf = aRect.zw * 0.5;
  vec2 centre = aRect.xy + vHalf;
  vLocal = position.xy * (aRect.zw + 2.0 * uPad);
  vColor = aColor;
  vState = aState;
  vec2 world = centre + vLocal;
  vWorldY = world.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const NOTE_FRAGMENT = /* glsl */ `
uniform float uEmissive;
uniform float uMode;        // 0 solid, 1 gradient, 2 outline, 3 glass
uniform float uColorHeight; // 1: colour from the height gradient
uniform vec3 uStops[4];
uniform float uHeight;
uniform float uTopFade;
uniform float uCorner;
uniform float uRim;
uniform float uNoiseAmt;
uniform float uNoiseSpeed;
uniform float uGlassNoise;
uniform float uNoteGlow;
uniform float uTime;
uniform float uPxSize;
uniform sampler2D uNoise;

varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vColor;
varying vec4 vState;
varying float vWorldY;

float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - (halfSize - radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec3 heightColour(float t) {
  float s = t * 3.0;
  if (s < 1.0) return mix(uStops[0], uStops[1], s);
  if (s < 2.0) return mix(uStops[1], uStops[2], s - 1.0);
  return mix(uStops[2], uStops[3], min(s - 2.0, 1.0));
}

void main() {
  float sounding = vState.x;
  float flash = vState.y;
  float seed = vState.z;
  float missed = step(0.5, vState.w) * (1.0 - step(1.5, vState.w));
  float waiting = step(1.5, vState.w);

  float radius = uCorner * min(min(vHalf.x, 10.0), vHalf.y);
  float sd = roundedBox(vLocal, vHalf, radius);
  float aa = uPxSize;
  float cover = clamp(0.5 - sd / aa, 0.0, 1.0);

  float fade = 1.0;
  if (uTopFade > 0.0) fade = clamp((1.0 - vWorldY / uHeight) / uTopFade, 0.0, 1.0);

  if (waiting > 0.5 && uEmissive < 0.5) {
    float ring = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, abs(sd - 3.0));
    if (cover <= 0.0) {
      if (ring <= 0.0) discard;
      gl_FragColor = vec4(vec3(ring), ring);
      return;
    }
  }
  if (cover <= 0.0) discard;

  vec3 c = uColorHeight > 0.5 ? heightColour(clamp(vWorldY / uHeight, 0.0, 1.0)) : vColor;
  if (missed > 0.5) c = vec3(dot(c, vec3(0.3, 0.59, 0.11)) * 0.55);

  float along = clamp(vLocal.y / max(vHalf.y * 2.0, 1.0) + 0.5, 0.0, 1.0);
  float depth = max(-sd, 0.0);
  float edge = exp(-depth / 1.7);
  float lit = 1.0 + sounding * 0.3 + flash * 0.6;
  float t = uTime * uNoiseSpeed;

  vec3 col;
  float a;
  float smoky = 0.0;
  if (uMode > 2.5) {
    // Glass: dark tinted body with a smoky inside that drifts, a bright rim and a sheen.
    vec2 uv = (vLocal + vec2(seed * 57.0, seed * 91.0)) / 84.0;
    if (uGlassNoise > 0.5) {
      float n1 = texture2D(uNoise, uv + vec2(t * 0.09, -t * 0.21)).r;
      float n2 = texture2D(uNoise, uv * 1.85 + vec2(-t * 0.15, -t * 0.33) + 0.37).g;
      smoky = smoothstep(0.28, 0.92, n1 * 0.62 + n2 * 0.52);
    } else {
      smoky = 0.5;
    }
    float base = 0.2 + (1.0 - uNoiseAmt) * 0.22 + smoky * uNoiseAmt * 0.95;
    float sheen = smoothstep(0.55, 1.0, 1.0 - abs(vLocal.x / max(vHalf.x, 1.0) + 0.45)) * 0.16;
    col = c * base * mix(1.2, 0.8, along)
      + mix(c, vec3(1.0), 0.55) * edge * (0.25 + 0.9 * uRim)
      + vec3(sheen) * c;
    a = clamp(0.5 + smoky * uNoiseAmt * 0.38 + edge * 0.5 * (0.4 + uRim), 0.0, 1.0);
  } else if (uMode > 1.5) {
    float ring = smoothstep(0.0, aa, depth) * (1.0 - smoothstep(1.6, 1.6 + aa, depth));
    col = c * (0.14 + ring * 1.1);
    a = clamp(0.14 + ring, 0.0, 1.0);
  } else if (uMode > 0.5) {
    col = c * mix(1.12, 0.7, along);
    col += mix(c, vec3(1.0), 0.6) * edge * uRim;
    a = 0.97;
  } else {
    col = c * 0.94;
    col += mix(c, vec3(1.0), 0.6) * edge * uRim;
    a = 0.97;
  }

  if (uEmissive > 0.5) {
    float body = uMode > 2.5 ? 0.45 + smoky * uNoiseAmt * 0.8 : 0.6;
    vec3 glow = c * (0.2 + 0.6 * sounding + flash) * uNoteGlow * (0.35 + 0.65 * edge + 0.5 * body);
    gl_FragColor = vec4(glow * cover * fade, 0.0);
    return;
  }
  col *= lit;
  a *= cover * fade;
  gl_FragColor = vec4(col * a, a);
}
`;

// ── Hit line ─────────────────────────────────────────────────────────────────

export const LINE_VERTEX = /* glsl */ `
uniform vec2 uSize; // width, height of the quad
varying vec2 vP;
void main() {
  vP = (position.xy + 0.5) * uSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vP, 0.0, 1.0);
}
`;

export const LINE_FRAGMENT = /* glsl */ `
uniform float uEmissive;
uniform vec3 uAccent;
uniform float uBright;
uniform float uFlame;
uniform float uFlick;
uniform float uTimeF; // time, frozen under reduced motion
uniform sampler2D uNoise;
varying vec2 vP;
void main() {
  float y = vP.y;
  float slow = texture2D(uNoise, vec2(vP.x / 90.0, uTimeF * 0.6)).r;
  float fast = texture2D(uNoise, vec2(uTimeF * 2.6, 0.3)).g;
  float flick = 1.0 + uFlick * ((fast - 0.5) * 1.0 + (slow - 0.5) * 0.9);
  float core = exp(-y / 1.5) * 0.85 + exp(-y / 7.0) * 0.22;
  float h = uFlame * 0.4 * (0.35 + slow * 0.9);
  float tongue = smoothstep(h, 0.0, y) * texture2D(uNoise, vec2(vP.x / 8.0, -y / 26.0 + uTimeF * 1.1)).b;
  vec3 hot = mix(uAccent, vec3(1.0), 0.55);
  vec3 rgb = (hot * core + mix(uAccent, hot, 0.3) * tongue * 0.75) * uBright * flick;
  if (uEmissive > 0.5) rgb *= 0.8;
  gl_FragColor = vec4(rgb, 0.0);
}
`;

// ── Pressed keys: flare, flame tongues and the key's tint ─────────────────────

export const KEY_VERTEX = /* glsl */ `
uniform float uFlame;
attribute vec4 aKey;    // centre x, key width, intensity, seed
attribute vec4 aColor;  // rgb, age since the press (s)
varying vec2 vP;
varying vec4 vKey;
varying vec4 vColor;
void main() {
  float halfW = max(aKey.y * 1.9, 26.0);
  float height = uFlame * 1.7 + 46.0;
  vP = vec2(position.x * 2.0 * halfW, (position.y + 0.5) * height);
  vKey = aKey;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aKey.x + vP.x, vP.y, 0.0, 1.0);
}
`;

export const KEY_FRAGMENT = /* glsl */ `
uniform float uEmissive;
uniform float uFlame;
uniform float uFlare;
uniform float uTint;
uniform float uFlick;
uniform float uTimeF;
uniform sampler2D uNoise;
varying vec2 vP;
varying vec4 vKey;
varying vec4 vColor;
void main() {
  vec2 p = vP;
  float w = vKey.y;
  float env = vKey.z;
  float seed = vKey.w;
  vec3 col = vColor.rgb;
  float age = vColor.a;
  // A press blooms: bright for the first moments, then holds at a lower level.
  float pulse = env * (0.6 + 0.4 * exp(-age * 7.0));
  float shimmer = 1.0 + uFlick * (texture2D(uNoise, vec2(uTimeF * 3.7 + seed * 9.0, 0.7)).b - 0.5) * 0.9;

  float s = 5.0 + w * 0.55;
  float core = exp(-dot(p, p) / (s * s));
  float streakX = exp(-abs(p.y) / 2.2) * exp(-abs(p.x) / (w * 1.5));
  float streakY = exp(-abs(p.x) / (w * 0.1 + 1.0)) * exp(-max(p.y, 0.0) / (12.0 + uFlame * 0.5)) * step(0.0, p.y);
  float star = (core * 1.3 + streakX * 0.9 + streakY * 0.6) * uFlare * pulse * shimmer;
  vec3 rgb = mix(col, vec3(1.0), 0.5 * clamp(core + streakX * 0.5, 0.0, 1.0)) * star;

  // Flame tongues rising from the key.
  float h = uFlame * pulse * (0.45 + 0.95 * texture2D(uNoise, vec2(p.x / 15.0 + seed * 5.0, uTimeF * (0.4 + uFlick * 1.3))).a);
  float across = exp(-pow(p.x / (w * 0.62), 2.0));
  float wisp = 0.45 + 0.85 * texture2D(uNoise, vec2(p.x / 19.0 + seed * 3.0, -p.y / 34.0 + uTimeF * (0.8 + uFlick))).b;
  float flame = smoothstep(h, 0.0, max(p.y, 0.0)) * step(0.0, p.y) * across * wisp;
  rgb += mix(vec3(1.0, 0.95, 0.8), col, smoothstep(0.0, h * 0.8 + 1.0, p.y)) * flame * 0.85;

  if (uEmissive < 0.5) {
    // The key's tint, lit up from below and spilling up into the notes.
    vec2 q = vec2(p.x / (w * 1.25), p.y / (36.0 + uFlame * 1.4));
    rgb += col * exp(-dot(q, q) * 1.7) * uTint * pulse * 0.9;
  }
  gl_FragColor = vec4(rgb, 0.0);
}
`;

// ── Sparks ───────────────────────────────────────────────────────────────────

export const SPARK_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uRise;
uniform float uSwirl;
uniform float uSize;
attribute vec4 aSpawn;  // x, y, spawn time (s), seed
attribute vec4 aVel;    // vx, vy, life (s), size factor
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

// Two octaves of a curl field: the velocity of the divergence-free flow of
// psi = sin(ax + t) cos(by - t), so sparks curl into filaments rather than fan out.
vec2 curl(vec2 p, float t, float seed) {
  float a = 0.034;
  float b = 0.041;
  vec2 v = vec2(-b * sin(a * p.x + t * 0.9 + seed * 6.2) * sin(b * p.y - t * 1.4 + seed * 3.1),
                -a * cos(a * p.x + t * 0.9 + seed * 6.2) * cos(b * p.y - t * 1.4 + seed * 3.1));
  float a2 = 0.09;
  float b2 = 0.11;
  v += 0.45 * vec2(-b2 * sin(a2 * p.x - t * 1.7 + seed * 2.0) * sin(b2 * p.y + t * 2.1),
                   -a2 * cos(a2 * p.x - t * 1.7 + seed * 2.0) * cos(b2 * p.y + t * 2.1));
  return v;
}

void main() {
  float age = uTime - aSpawn.z;
  float life = aVel.z;
  if (age < 0.0 || age > life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0; vUv = vec2(0.0); vColor = vec3(0.0);
    return;
  }
  float t = age / life;
  float drag = 2.2;
  float travelled = (1.0 - exp(-drag * age)) / drag;
  vec2 p = aSpawn.xy + vec2(aVel.x, aVel.y) * travelled + vec2(0.0, uRise * (0.55 + 0.9 * aSpawn.w) * age);
  p += curl(p, uTime, aSpawn.w) * uSwirl * 520.0 * age * (0.4 + t);
  float size = uSize * aVel.w * (1.0 - 0.45 * t);
  float extent = max(size * 2.6, 3.2);
  vUv = position.xy * 2.0;
  vColor = aColor;
  float twinkle = 0.7 + 0.3 * sin(uTime * 31.0 + aSpawn.w * 53.0);
  vAlpha = smoothstep(0.0, 0.05, age) * (1.0 - t) * (1.0 - t) * twinkle * clamp(size * 1.1, 0.35, 1.2);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + position.xy * extent, 0.0, 1.0);
}
`;

export const SPARK_FRAGMENT = /* glsl */ `
uniform float uGain;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = dot(vUv, vUv);
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float e = exp(-d * 4.5) * vAlpha * uGain;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.3 * e) * e, min(1.0, e));
}
`;

// ── Smoke ────────────────────────────────────────────────────────────────────

export const SMOKE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSwirl;
attribute vec4 aSpawn;  // x, y, spawn time (s), seed
attribute vec4 aInfo;   // life (s), size (px), rise (px/s), tint mix
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vTex;      // seed, age, tint mix
void main() {
  float age = uTime - aSpawn.z;
  float life = aInfo.x;
  if (age < 0.0 || age > life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0; vUv = vec2(0.0); vColor = vec3(0.0); vTex = vec3(0.0);
    return;
  }
  float t = age / life;
  vec2 p = aSpawn.xy;
  p.x += sin(age * 0.9 + aSpawn.w * 6.283) * 26.0 * uSwirl + age * (aSpawn.w - 0.5) * 20.0;
  p.y += aInfo.z * age + cos(age * 0.7 + aSpawn.w * 3.1) * 8.0 * uSwirl;
  float size = aInfo.y * (0.55 + 0.95 * t);
  vUv = position.xy * 2.0;
  vColor = aColor;
  vTex = vec3(aSpawn.w, age, aInfo.w);
  vAlpha = smoothstep(0.0, 0.18, t) * pow(1.0 - t, 1.4);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + position.xy * size * 2.0, 0.0, 1.0);
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
uniform float uDensity;
uniform float uSwirl;
uniform vec3 uSmoke;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vTex;
void main() {
  float d = length(vUv);
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float fall = 1.0 - d;
  fall *= fall;
  float ang = vTex.x * 6.283 + vTex.y * 0.25 * uSwirl;
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 uv = mat2(cs, -sn, sn, cs) * vUv * 0.55 + vTex.x * 4.0 + vec2(0.0, -vTex.y * 0.09);
  float n = texture2D(uNoise, uv).r * 0.6 + texture2D(uNoise, uv * 2.3 + vTex.y * 0.04).g * 0.4;
  float a = fall * smoothstep(0.22, 0.85, n) * vAlpha * uDensity;
  vec3 col = mix(uSmoke, vColor, vTex.z);
  gl_FragColor = vec4(col * a, 0.0);
}
`;
