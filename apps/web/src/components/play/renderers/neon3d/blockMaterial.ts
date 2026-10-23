import * as THREE from "three";

/**
 * The note blocks: one instanced quad per visible note, shaded in the fragment shader as
 * a bevelled glass block with an emissive core. The quad is the block's exact rectangle
 * (plus a few pixels of padding for the wait outline and anti-aliasing), so a block's
 * centre is its key's centre to the pixel: the bevel, rim and corners are signed-distance
 * shading inside that rectangle, never geometry that could stretch with the block length.
 *
 * Per-instance data:
 *   aRect   x, y (bottom-left), w, h — world px
 *   aBase   rgb at the bottom of the block (the hand's base, hue-shifted by pitch)
 *   aHi     rgb at the top (the hand's hi)
 *   aState  emissive 0..1, flash 0..1, missed 0/1, waiting 0/1
 */

export const BLOCK_PAD_PX = 5;

const BLOCK_VERTEX = /* glsl */ `
uniform float uPad;

attribute vec4 aRect;
attribute vec3 aBase;
attribute vec3 aHi;
attribute vec4 aState;

varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vBase;
varying vec3 vHi;
varying vec4 vState;

void main() {
  vHalf = aRect.zw * 0.5;
  vec2 centre = aRect.xy + vHalf;
  // position.xy is the unit quad (-0.5..0.5); grow it by the padding on every side.
  vLocal = position.xy * (aRect.zw + 2.0 * uPad);
  vBase = aBase;
  vHi = aHi;
  vState = aState;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(centre + vLocal, 0.0, 1.0);
}
`;

const BLOCK_FRAGMENT = /* glsl */ `
uniform float uEmissivePass;
uniform vec3 uMiss;
uniform vec3 uMissEdge;
uniform vec3 uWaiting;
uniform float uPxSize;

varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vBase;
varying vec3 vHi;
varying vec4 vState;

float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - (halfSize - radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// Outward direction of the rounded box's surface, for the bevel normal.
vec2 boxGradient(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - (halfSize - radius);
  vec2 s = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  if (q.x > 0.0 && q.y > 0.0) return normalize(q) * s;
  return q.x > q.y ? vec2(s.x, 0.0) : vec2(0.0, s.y);
}

void main() {
  float emissive = vState.x;
  float flash = vState.y;
  float missed = vState.z;
  float waiting = vState.w;

  // Fully rounded ends, as Classic: radius = min(width / 2, 10 px).
  float radius = min(min(vHalf.x, 10.0), vHalf.y);
  float sd = roundedBox(vLocal, vHalf, radius);
  float aa = uPxSize;
  float cover = clamp(0.5 - sd / aa, 0.0, 1.0);

  // Wait-mode target: a 2px outline 2px outside the block (colour pass only).
  if (waiting > 0.5 && uEmissivePass < 0.5) {
    float ring = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, abs(sd - 3.0));
    if (cover <= 0.0) {
      if (ring <= 0.0) discard;
      gl_FragColor = vec4(uWaiting * ring, ring);
      return;
    }
  }
  if (cover <= 0.0) discard;

  // Bevel: a quarter-round profile over the outer few pixels gives a normal that tilts
  // towards the edge; the interior is flat and faces the camera.
  float bevel = max(1.5, min(4.0, min(vHalf.x, vHalf.y) * 0.4));
  float s = clamp(1.0 + sd / bevel, 0.0, 1.0); // 0 inside, 1 at the edge
  vec2 g = boxGradient(vLocal, vHalf, radius);
  vec3 n = normalize(vec3(g * s, sqrt(max(1.0 - s * s, 0.0)) + 0.0001));

  // Along the block: the hand's base at the bottom easing into hi at the top.
  float along = clamp(vLocal.y / max(vHalf.y * 2.0, 1.0) + 0.5, 0.0, 1.0);
  vec3 body = mix(vBase, vHi, smoothstep(0.0, 1.0, along));

  // The emissive core: a bright band down the middle, strongest away from the bevel.
  float across = vLocal.x / max(vHalf.x, 1.0);
  float core = exp(-across * across * 3.2) * (1.0 - s);

  if (missed > 0.5) {
    // Colour-blind safe miss: desaturated grey, hatched, a dashed edge, emissive at 10%.
    body = uMiss;
    emissive = 0.1;
    float hatch = step(mod(vLocal.x + vLocal.y, 8.0), 1.5);
    body = mix(body, uMissEdge, hatch * 0.5);
  }

  if (uEmissivePass > 0.5) {
    // What blooms: the core and a whisper of rim, scaled by how lit the note is.
    float rim = pow(1.0 - n.z, 1.5);
    vec3 glow = body * (core * 1.25 + rim * 0.35) * emissive * (1.0 + flash * 1.5);
    gl_FragColor = vec4(glow * cover, 0.0);
    return;
  }

  vec3 light = normalize(vec3(-0.35, 0.6, 0.72));
  float diffuse = max(dot(n, light), 0.0);
  vec3 h = normalize(light + vec3(0.0, 0.0, 1.0));
  float specular = pow(max(dot(n, h), 0.0), 40.0);
  float fresnel = pow(1.0 - n.z, 2.0);
  // A glassy sheen: a soft diagonal highlight streak across the face.
  float sheen = smoothstep(0.55, 1.0, 1.0 - abs(across + 0.45)) * 0.18 * (1.0 - s);

  vec3 colour = body * (0.32 + 0.38 * diffuse)
    + body * core * (0.35 + 0.65 * emissive)
    + vec3(1.0) * (specular * 0.4 + sheen)
    + mix(body, vec3(1.0), 0.3) * fresnel * 0.5;
  colour *= 1.0 + flash * 0.3;

  float alpha = 0.86 + 0.14 * fresnel;
  if (missed > 0.5) {
    alpha = 0.9;
    // Dashed edge: the outer pixel and a half, dashed along the perimeter.
    float edge = 1.0 - smoothstep(0.0, 1.5 * aa + 0.75, -sd);
    float dash = step(mod(vLocal.x - vLocal.y, 7.0), 4.0);
    colour = mix(colour, uMissEdge, edge * dash);
  }
  float a = alpha * cover;
  gl_FragColor = vec4(colour * a, a);
}
`;

export interface BlockLayer {
  geometry: THREE.InstancedBufferGeometry;
  colorMesh: THREE.Mesh;
  emissiveMesh: THREE.Mesh;
  rect: THREE.InstancedBufferAttribute;
  base: THREE.InstancedBufferAttribute;
  hi: THREE.InstancedBufferAttribute;
  state: THREE.InstancedBufferAttribute;
  capacity: number;
  uniforms: {
    uPad: { value: number };
    uMiss: { value: THREE.Vector3 };
    uMissEdge: { value: THREE.Vector3 };
    uWaiting: { value: THREE.Vector3 };
    uPxSize: { value: number };
  };
  dispose(): void;
}

function attribute(capacity: number, size: number): THREE.InstancedBufferAttribute {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
  attr.setUsage(THREE.DynamicDrawUsage);
  return attr;
}

export function createBlockLayer(capacity: number): BlockLayer {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  quad.dispose();

  const rect = attribute(capacity, 4);
  const base = attribute(capacity, 3);
  const hi = attribute(capacity, 3);
  const state = attribute(capacity, 4);
  geometry.setAttribute("aRect", rect);
  geometry.setAttribute("aBase", base);
  geometry.setAttribute("aHi", hi);
  geometry.setAttribute("aState", state);
  geometry.instanceCount = 0;

  const uniforms = {
    uPad: { value: BLOCK_PAD_PX },
    uMiss: { value: new THREE.Vector3() },
    uMissEdge: { value: new THREE.Vector3() },
    uWaiting: { value: new THREE.Vector3(1, 1, 1) },
    uPxSize: { value: 1 },
  };
  const make = (emissivePass: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
      uniforms: { ...uniforms, uEmissivePass: { value: emissivePass ? 1 : 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: emissivePass ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  const colorMaterial = make(false);
  const emissiveMaterial = make(true);
  const colorMesh = new THREE.Mesh(geometry, colorMaterial);
  const emissiveMesh = new THREE.Mesh(geometry, emissiveMaterial);
  colorMesh.frustumCulled = false;
  emissiveMesh.frustumCulled = false;
  colorMesh.renderOrder = 1;

  return {
    geometry,
    colorMesh,
    emissiveMesh,
    rect,
    base,
    hi,
    state,
    capacity,
    uniforms,
    dispose() {
      geometry.dispose();
      colorMaterial.dispose();
      emissiveMaterial.dispose();
    },
  };
}

// ── Flat rectangles: C-lane guides, falling barlines, the hit line ─────────────

const FLAT_VERTEX = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aColor; // premultiplied rgba
attribute float aFade; // 1 = fade towards the left and right ends (the hit line)

varying vec4 vColor;
varying float vFade;
varying float vU;

void main() {
  vec2 p = aRect.xy + (position.xy + 0.5) * aRect.zw;
  vColor = aColor;
  vFade = aFade;
  vU = position.x + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

const FLAT_FRAGMENT = /* glsl */ `
varying vec4 vColor;
varying float vFade;
varying float vU;

void main() {
  float fade = mix(1.0, 1.0 - abs(vU * 2.0 - 1.0), vFade);
  gl_FragColor = vColor * fade;
}
`;

export interface FlatLayer {
  mesh: THREE.Mesh;
  rect: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  fade: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
  dispose(): void;
}

export function createFlatLayer(capacity: number): FlatLayer {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  quad.dispose();
  const rect = attribute(capacity, 4);
  const color = attribute(capacity, 4);
  const fade = attribute(capacity, 1);
  geometry.setAttribute("aRect", rect);
  geometry.setAttribute("aColor", color);
  geometry.setAttribute("aFade", fade);
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    vertexShader: FLAT_VERTEX,
    fragmentShader: FLAT_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return {
    mesh,
    rect,
    color,
    fade,
    capacity,
    count: 0,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ── Judgement marks and key light ─────────────────────────────────────────────

/** Mark kinds, matching the shader's `kind` switch. */
export const MARK_KIND = { hit: 0, early: 1, late: 2, miss: 3, keyLight: 4 } as const;

const MARK_VERTEX = /* glsl */ `
uniform float uTime;

attribute vec4 aMark;  // centre x, centre y, size (px), kind
attribute vec4 aTiming; // spawn time (s), lifetime (s), ring time (s; 0 = no ring growth), ring reach (px)
attribute vec3 aColor;

varying vec2 vLocal;
varying float vKind;
varying float vAge;
varying vec4 vTiming;
varying vec3 vColor;
varying float vSize;

void main() {
  float age = uTime - aTiming.x;
  if (age < 0.0 || age > aTiming.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAge = -1.0;
    vLocal = vec2(0.0);
    vKind = 0.0;
    vTiming = vec4(0.0);
    vColor = vec3(0.0);
    vSize = 0.0;
    return;
  }
  // Large enough for the ring at full reach (or the key light's pool).
  float extent = aMark.z + aTiming.w + 4.0;
  vec2 scale = aMark.w > 3.5 ? vec2(aMark.z * 1.6, aMark.z * 2.6) : vec2(extent * 2.0);
  vLocal = position.xy * scale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aMark.xy + vLocal, 0.0, 1.0);
  vKind = aMark.w;
  vAge = age;
  vTiming = aTiming;
  vColor = aColor;
  vSize = aMark.z;
}
`;

const MARK_FRAGMENT = /* glsl */ `
uniform float uPxSize;
uniform float uEmissivePass;

varying vec2 vLocal;
varying float vKind;
varying float vAge;
varying vec4 vTiming;
varying vec3 vColor;
varying float vSize;

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float stroke(float d, float halfWidth) {
  return 1.0 - smoothstep(halfWidth - uPxSize, halfWidth + uPxSize, d);
}

void main() {
  if (vAge < 0.0) discard;
  float life = vTiming.y;
  float fade = clamp((1.0 - vAge / life) * 1.6, 0.0, 1.0);
  vec2 p = vLocal;
  float g = vSize;

  if (vKind > 3.5) {
    // Key light: a soft pool of the note's colour at the hit line, lighting the key top.
    vec2 q = p / vec2(g * 0.8, g * 1.3);
    float pool = exp(-dot(q, q) * 2.2) * (1.0 - vAge / life);
    gl_FragColor = vec4(vColor * pool, uEmissivePass > 0.5 ? 0.0 : pool * 0.6);
    return;
  }
  if (uEmissivePass > 0.5) discard;

  // The ring grows from the key top over the burst time and fades as it goes; under
  // reduced motion (ring time 0) it is a still ring that fades with the glyph.
  float ring = 0.0;
  if (vKind < 2.5) {
    float ringTime = vTiming.z;
    float reach = vTiming.w;
    if (ringTime <= 0.0) {
      ring = stroke(abs(length(p) - g * 1.6), 1.0) * fade;
    } else if (vAge < ringTime) {
      float progress = vAge / ringTime;
      ring = stroke(abs(length(p) - (g + progress * reach)), 1.0) * (1.0 - progress);
    }
  }
  float glyph = 0.0;
  if (vKind < 0.5) {
    glyph = min(segment(p, vec2(-0.6, 0.0) * g, vec2(-0.15, -0.5) * g), segment(p, vec2(-0.15, -0.5) * g, vec2(0.65, 0.55) * g));
  } else if (vKind < 2.5) {
    // ˄ early, ˅ late (y up in world space).
    float dir = vKind < 1.5 ? 1.0 : -1.0;
    glyph = min(segment(p, vec2(-0.55, -0.3 * dir) * g, vec2(0.0, 0.3 * dir) * g), segment(p, vec2(0.0, 0.3 * dir) * g, vec2(0.55, -0.3 * dir) * g));
  } else {
    glyph = min(segment(p, vec2(-0.6, -0.6) * g, vec2(0.6, 0.6) * g), segment(p, vec2(0.6, -0.6) * g, vec2(-0.6, 0.6) * g));
  }
  float a = clamp(max(ring, stroke(glyph, 1.0) * fade), 0.0, 1.0);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export const MAX_MARKS = 256;

export interface MarkLayer {
  geometry: THREE.InstancedBufferGeometry;
  mesh: THREE.Mesh;
  emissiveMesh: THREE.Mesh;
  mark: THREE.InstancedBufferAttribute;
  timing: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  uniforms: { uPxSize: { value: number } };
  cursor: number;
  dispose(): void;
}

export function createMarkLayer(timeUniform: { value: number }): MarkLayer {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  quad.dispose();
  const mark = attribute(MAX_MARKS, 4);
  const timing = attribute(MAX_MARKS, 4);
  const color = attribute(MAX_MARKS, 3);
  geometry.setAttribute("aMark", mark);
  geometry.setAttribute("aTiming", timing);
  geometry.setAttribute("aColor", color);
  geometry.instanceCount = MAX_MARKS;
  const uniforms = { uPxSize: { value: 1 } };
  const make = (emissivePass: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: MARK_VERTEX,
      fragmentShader: MARK_FRAGMENT,
      uniforms: { uTime: timeUniform, uPxSize: uniforms.uPxSize, uEmissivePass: { value: emissivePass ? 1 : 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: emissivePass ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  const material = make(false);
  const emissiveMaterial = make(true);
  const mesh = new THREE.Mesh(geometry, material);
  const emissiveMesh = new THREE.Mesh(geometry, emissiveMaterial);
  mesh.frustumCulled = false;
  emissiveMesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return {
    geometry,
    mesh,
    emissiveMesh,
    mark,
    timing,
    color,
    uniforms,
    cursor: 0,
    dispose() {
      geometry.dispose();
      material.dispose();
      emissiveMaterial.dispose();
    },
  };
}

export interface MarkOptions {
  x: number;
  y: number;
  size: number;
  kind: number;
  timeS: number;
  lifeS: number;
  ringS: number;
  ringReach: number;
  color: ArrayLike<number>;
}

export function pushMark(layer: MarkLayer, options: MarkOptions): void {
  const slot = layer.cursor;
  layer.cursor = (slot + 1) % MAX_MARKS;
  (layer.mark.array as Float32Array).set([options.x, options.y, options.size, options.kind], slot * 4);
  (layer.timing.array as Float32Array).set([options.timeS, options.lifeS, options.ringS, options.ringReach], slot * 4);
  const colour = layer.color.array as Float32Array;
  colour[slot * 3] = options.color[0]!;
  colour[slot * 3 + 1] = options.color[1]!;
  colour[slot * 3 + 2] = options.color[2]!;
  layer.mark.addUpdateRange(slot * 4, 4);
  layer.timing.addUpdateRange(slot * 4, 4);
  layer.color.addUpdateRange(slot * 3, 3);
  layer.mark.needsUpdate = true;
  layer.timing.needsUpdate = true;
  layer.color.needsUpdate = true;
}

/** Hide every mark (a new run). */
export function clearMarks(layer: MarkLayer): void {
  (layer.timing.array as Float32Array).fill(0);
  layer.timing.clearUpdateRanges();
  layer.timing.needsUpdate = true;
}
