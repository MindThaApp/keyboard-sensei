/**
 * "Neon powder": GPU particles simulated entirely in the vertex shader from their spawn
 * time, seed and velocity, so the CPU writes a particle once (when it bursts) and never
 * touches it again. World units are CSS pixels, y up, origin on the hit line.
 */

export const PARTICLE_VERTEX = /* glsl */ `
uniform float uTime;

attribute vec4 aSpawn;   // x, y, spawn time (s), seed
attribute vec4 aVelocity; // vx, vy, depth velocity, lifetime (s)
attribute vec4 aColor;   // rgb, size (px)

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

// Curl of the stream function psi = sin(a x + p) cos(b y + q): a divergence-free swirl,
// so the powder curls and drifts instead of spreading like a fan.
vec2 curl(vec2 p, float t, float seed) {
  float a = 0.021;
  float b = 0.027;
  float px = a * p.x + t * 0.9 + seed * 6.283;
  float py = b * p.y - t * 1.3 + seed * 3.17;
  return vec2(-b * sin(px) * sin(py), -a * cos(px) * cos(py)) * 1400.0;
}

void main() {
  float age = uTime - aSpawn.z;
  float life = aVelocity.w;
  if (age < 0.0 || age > life || life <= 0.0) {
    // Not alive: a degenerate vertex outside the clip volume, so nothing rasterises.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    vUv = vec2(0.0);
    vColor = vec3(0.0);
    return;
  }
  float t = age / life;
  // Air drag on the launch velocity, a little buoyancy, then the curl swirl grows in.
  float drag = 2.6;
  float travelled = (1.0 - exp(-drag * age)) / drag;
  vec2 origin = aSpawn.xy;
  vec2 p = origin + aVelocity.xy * travelled + vec2(0.0, 18.0 * age * age);
  p += curl(p, uTime, aSpawn.w) * age * age * 0.5;
  // Depth: particles nearer the camera are larger and brighter, which reads as a 3D cloud
  // through an orthographic lens.
  float depth = clamp(aVelocity.z * travelled / 120.0, -1.0, 1.0);
  float size = aColor.w * (1.0 + 0.45 * depth) * (1.0 - 0.55 * t);
  vec2 corner = position.xy * size;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + corner, 0.0, 1.0);
  vUv = position.xy * 2.0;
  vColor = aColor.rgb * (1.0 + 0.35 * depth);
  float fadeIn = smoothstep(0.0, 0.04, age);
  vAlpha = fadeIn * (1.0 - t) * (1.0 - t) * (0.7 + 0.3 * depth);
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
uniform float uGain;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(vUv);
  if (d > 1.0 || vAlpha <= 0.0) discard;
  // A hot core inside a soft halo.
  float core = exp(-d * d * 7.0);
  float halo = (1.0 - d) * 0.35;
  float energy = (core * 1.5 + halo) * vAlpha * uGain;
  vec3 colour = mix(vColor, vec3(1.0), core * 0.35) * energy;
  // Premultiplied and additive: light adds up where the cloud is dense.
  gl_FragColor = vec4(colour, min(1.0, energy));
}
`;
