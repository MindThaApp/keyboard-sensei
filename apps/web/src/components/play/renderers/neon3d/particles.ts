import * as THREE from "three";
import { PARTICLE_FRAGMENT, PARTICLE_VERTEX } from "./particles.glsl";

/** The largest pool any tier uses; the buffers are allocated once at this size. */
export const MAX_PARTICLES = 6000;

export interface BurstOptions {
  /** Centre of the key, world px. */
  x: number;
  /** Width of the key: particles start spread across it. */
  width: number;
  count: number;
  /** 0..1 rgb. */
  color: ArrayLike<number>;
  /** Seconds on the shared shader clock. */
  timeS: number;
}

/**
 * A pooled particle cloud: one InstancedBufferGeometry and a ring buffer. A burst writes
 * `count` consecutive slots (wrapping, so the oldest particles are recycled first) and
 * uploads just that range; nothing is allocated per frame or per burst.
 */
export class ParticlePool {
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  /** Shares geometry with `points` but draws into the bloom target. */
  readonly emissiveMaterial: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  readonly emissiveMesh: THREE.Mesh;
  private readonly spawn: THREE.InstancedBufferAttribute;
  private readonly velocity: THREE.InstancedBufferAttribute;
  private readonly color: THREE.InstancedBufferAttribute;
  private capacity = 0;
  private cursor = 0;
  /** Shader-clock time at which the last particle dies. */
  private aliveUntilS = 0;

  constructor(timeUniform: { value: number }) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute("position", quad.getAttribute("position"));
    quad.dispose();

    this.spawn = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4);
    this.velocity = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4);
    for (const attribute of [this.spawn, this.velocity, this.color]) attribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("aSpawn", this.spawn);
    this.geometry.setAttribute("aVelocity", this.velocity);
    this.geometry.setAttribute("aColor", this.color);
    this.geometry.instanceCount = 0;

    const make = (gain: number) =>
      new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        uniforms: { uTime: timeUniform, uGain: { value: gain } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        premultipliedAlpha: true,
        blending: THREE.AdditiveBlending,
      });
    this.material = make(1.25);
    this.emissiveMaterial = make(1.4);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.emissiveMesh = new THREE.Mesh(this.geometry, this.emissiveMaterial);
    // The instances move in the shader, so three's bounds would be wrong: never cull.
    this.mesh.frustumCulled = false;
    this.emissiveMesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** Change the pool size (a quality tier change). Existing particles are dropped. */
  setCapacity(capacity: number): void {
    this.capacity = Math.max(0, Math.min(MAX_PARTICLES, Math.floor(capacity)));
    this.cursor = 0;
    this.clear();
  }

  /** Drop every particle (a new run, or a tier change). */
  clear(): void {
    (this.velocity.array as Float32Array).fill(0);
    this.velocity.clearUpdateRanges();
    this.velocity.needsUpdate = true;
    this.geometry.instanceCount = this.capacity;
    this.mesh.visible = this.capacity > 0;
    this.emissiveMesh.visible = this.capacity > 0;
    this.aliveUntilS = 0;
  }

  isAlive(timeS: number): boolean {
    return timeS < this.aliveUntilS;
  }

  burst({ x, width, count, color, timeS }: BurstOptions): void {
    if (this.capacity === 0 || count <= 0) return;
    const total = Math.min(count, this.capacity);
    const spawn = this.spawn.array as Float32Array;
    const velocity = this.velocity.array as Float32Array;
    const colours = this.color.array as Float32Array;
    const start = this.cursor;
    let longest = 0;
    for (let n = 0; n < total; n++) {
      const slot = (start + n) % this.capacity;
      const o = slot * 4;
      const angle = (Math.random() - 0.5) * 1.6; // mostly upwards, fanning out
      const speed = 110 + Math.random() * 330;
      const life = 0.6 + Math.random() * 0.3; // 600–900 ms
      spawn[o] = x + (Math.random() - 0.5) * width * 0.8;
      spawn[o + 1] = Math.random() * 6;
      spawn[o + 2] = timeS + Math.random() * 0.03;
      spawn[o + 3] = Math.random();
      velocity[o] = Math.sin(angle) * speed * 0.55;
      velocity[o + 1] = Math.cos(angle) * speed;
      velocity[o + 2] = (Math.random() - 0.5) * 240;
      velocity[o + 3] = life;
      // A little white mixed into some particles keeps the cloud sparkling.
      const sparkle = Math.random() < 0.18 ? 0.55 : 0;
      colours[o] = color[0]! + (1 - color[0]!) * sparkle;
      colours[o + 1] = color[1]! + (1 - color[1]!) * sparkle;
      colours[o + 2] = color[2]! + (1 - color[2]!) * sparkle;
      colours[o + 3] = 3 + Math.random() * 6;
      if (life > longest) longest = life;
    }
    this.cursor = (start + total) % this.capacity;
    this.aliveUntilS = Math.max(this.aliveUntilS, timeS + longest + 0.05);

    // Upload only the slots just written: one range, or two when the ring wrapped.
    const firstRun = Math.min(total, this.capacity - start);
    for (const attribute of [this.spawn, this.velocity, this.color]) {
      attribute.addUpdateRange(start * 4, firstRun * 4);
      if (firstRun < total) attribute.addUpdateRange(0, (total - firstRun) * 4);
      attribute.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.emissiveMaterial.dispose();
  }
}
