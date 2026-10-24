import * as THREE from "three";
import { SMOKE_FRAGMENT, SMOKE_VERTEX, SPARK_FRAGMENT, SPARK_VERTEX } from "./fxShaders";
import { MAX_SMOKE, MAX_SPARKS } from "./fxTiers";

function quadGeometry(): THREE.InstancedBufferGeometry {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  quad.dispose();
  geometry.instanceCount = 0;
  return geometry;
}

function dynamic(count: number, size: number): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

/** Upload the `count` slots written from `start` (wrapping at most once). */
function flushRange(attributes: readonly THREE.InstancedBufferAttribute[], capacity: number, start: number, count: number): void {
  if (count <= 0 || capacity === 0) return;
  const firstRun = Math.min(count, capacity - start);
  for (const attribute of attributes) {
    attribute.addUpdateRange(start * attribute.itemSize, firstRun * attribute.itemSize);
    if (firstRun < count) attribute.addUpdateRange(0, (count - firstRun) * attribute.itemSize);
    attribute.needsUpdate = true;
  }
}

const rnd = Math.random;

/**
 * Sparks: tiny curl-driven points. One instanced quad geometry and a ring buffer; a spawn
 * writes one slot and the vertex shader does the rest (drag, rise, curl swirl, fade), so
 * the CPU never touches a live spark and nothing is allocated per frame.
 */
export class SparkPool {
  readonly geometry = quadGeometry();
  readonly mesh: THREE.Mesh;
  readonly emissiveMesh: THREE.Mesh;
  readonly uniforms = { uRise: { value: 50 }, uSwirl: { value: 0.5 }, uSize: { value: 1.5 } };
  private readonly spawn = dynamic(MAX_SPARKS, 4);
  private readonly velocity = dynamic(MAX_SPARKS, 4);
  private readonly color = dynamic(MAX_SPARKS, 3);
  private readonly attributes = [this.spawn, this.velocity, this.color];
  private readonly materials: THREE.ShaderMaterial[];
  private capacity = 0;
  private cursor = 0;
  private batchStart = 0;
  private batchCount = 0;

  constructor(time: { value: number }) {
    this.geometry.setAttribute("aSpawn", this.spawn);
    this.geometry.setAttribute("aVel", this.velocity);
    this.geometry.setAttribute("aColor", this.color);
    const make = (gain: number) =>
      new THREE.ShaderMaterial({
        vertexShader: SPARK_VERTEX,
        fragmentShader: SPARK_FRAGMENT,
        uniforms: { uTime: time, ...this.uniforms, uGain: { value: gain } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        premultipliedAlpha: true,
        blending: THREE.AdditiveBlending,
      });
    this.materials = [make(1.2), make(1.5)];
    this.mesh = new THREE.Mesh(this.geometry, this.materials[0]);
    this.emissiveMesh = new THREE.Mesh(this.geometry, this.materials[1]);
    this.mesh.frustumCulled = false;
    this.emissiveMesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  get size(): number {
    return this.capacity;
  }

  /** Pool size (a look or quality tier change); sparks alive are dropped. */
  setCapacity(capacity: number): void {
    this.capacity = Math.max(0, Math.min(MAX_SPARKS, Math.floor(capacity)));
    this.cursor = 0;
    this.clear();
  }

  clear(): void {
    (this.velocity.array as Float32Array).fill(0);
    this.velocity.clearUpdateRanges();
    this.velocity.needsUpdate = true;
    this.geometry.instanceCount = this.capacity;
    this.mesh.visible = this.capacity > 0;
    this.emissiveMesh.visible = this.capacity > 0;
  }

  setLook(rise: number, swirl: number, size: number): void {
    this.uniforms.uRise.value = rise;
    this.uniforms.uSwirl.value = swirl;
    this.uniforms.uSize.value = size;
  }

  beginBatch(): void {
    this.batchStart = this.cursor;
    this.batchCount = 0;
  }

  /** One spark at the top of a pressed key. `life` seconds; `rgb` is the colour it keeps. */
  emit(x: number, keyWidth: number, timeS: number, life: number, r: number, g: number, b: number): void {
    if (this.capacity === 0) return;
    const slot = this.cursor;
    this.cursor = (slot + 1) % this.capacity;
    this.batchCount++;
    const o = slot * 4;
    const spawn = this.spawn.array as Float32Array;
    const velocity = this.velocity.array as Float32Array;
    const color = this.color.array as Float32Array;
    spawn[o] = x + (rnd() - 0.5) * keyWidth * 0.9;
    spawn[o + 1] = rnd() * 4;
    spawn[o + 2] = timeS;
    spawn[o + 3] = rnd();
    const angle = (rnd() - 0.5) * 1.5;
    const speed = 20 + rnd() * 90;
    velocity[o] = Math.sin(angle) * speed;
    velocity[o + 1] = Math.cos(angle) * speed;
    velocity[o + 2] = life * (0.55 + rnd() * 0.6);
    velocity[o + 3] = 0.6 + rnd() * 0.8;
    // Some sparks run hot: a little white in the note's colour.
    const hot = rnd() < 0.3 ? 0.5 : rnd() * 0.15;
    color[slot * 3] = r + (1 - r) * hot;
    color[slot * 3 + 1] = g + (1 - g) * hot;
    color[slot * 3 + 2] = b + (1 - b) * hot;
  }

  endBatch(): void {
    flushRange(this.attributes, this.capacity, this.batchStart, this.batchCount);
  }

  dispose(): void {
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

/**
 * Smoke: a few dozen large, soft, noise-textured sprites at low opacity, born at pressed
 * keys. No fluid simulation: each sprite drifts, swells and fades in the shader.
 */
export class SmokePool {
  readonly geometry = quadGeometry();
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uSwirl: { value: 0.4 },
    uDensity: { value: 0.3 },
    uSmoke: { value: new THREE.Vector3(0.5, 0.55, 0.65) },
    uNoise: { value: null as THREE.Texture | null },
  };
  private readonly spawn = dynamic(MAX_SMOKE, 4);
  private readonly info = dynamic(MAX_SMOKE, 4);
  private readonly color = dynamic(MAX_SMOKE, 3);
  private readonly attributes = [this.spawn, this.info, this.color];
  private readonly material: THREE.ShaderMaterial;
  private capacity = 0;
  private cursor = 0;
  private batchStart = 0;
  private batchCount = 0;

  constructor(time: { value: number }) {
    this.geometry.setAttribute("aSpawn", this.spawn);
    this.geometry.setAttribute("aInfo", this.info);
    this.geometry.setAttribute("aColor", this.color);
    this.material = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      uniforms: { uTime: time, ...this.uniforms },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  get size(): number {
    return this.capacity;
  }

  setCapacity(capacity: number): void {
    this.capacity = Math.max(0, Math.min(MAX_SMOKE, Math.floor(capacity)));
    this.cursor = 0;
    this.clear();
  }

  clear(): void {
    (this.info.array as Float32Array).fill(0);
    this.info.clearUpdateRanges();
    this.info.needsUpdate = true;
    this.geometry.instanceCount = this.capacity;
    this.mesh.visible = this.capacity > 0;
  }

  beginBatch(): void {
    this.batchStart = this.cursor;
    this.batchCount = 0;
  }

  emit(x: number, timeS: number, life: number, sizePx: number, risePxS: number, tint: number, r: number, g: number, b: number): void {
    if (this.capacity === 0) return;
    const slot = this.cursor;
    this.cursor = (slot + 1) % this.capacity;
    this.batchCount++;
    const o = slot * 4;
    const spawn = this.spawn.array as Float32Array;
    const info = this.info.array as Float32Array;
    const color = this.color.array as Float32Array;
    spawn[o] = x + (rnd() - 0.5) * 18;
    spawn[o + 1] = 6 + rnd() * 10;
    spawn[o + 2] = timeS;
    spawn[o + 3] = rnd();
    info[o] = life * (0.75 + rnd() * 0.5);
    info[o + 1] = sizePx * (0.7 + rnd() * 0.6);
    info[o + 2] = risePxS * (0.7 + rnd() * 0.6);
    info[o + 3] = tint;
    color[slot * 3] = r;
    color[slot * 3 + 1] = g;
    color[slot * 3 + 2] = b;
  }

  endBatch(): void {
    flushRange(this.attributes, this.capacity, this.batchStart, this.batchCount);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
