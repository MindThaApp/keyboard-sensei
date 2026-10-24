import * as THREE from "three";
import { generateNoise, NOISE_SIZE } from "./fxNoise";
import { KEY_FRAGMENT, KEY_VERTEX, LINE_FRAGMENT, LINE_VERTEX, NOTE_FRAGMENT, NOTE_VERTEX } from "./fxShaders";

export const NOTE_PAD_PX = 6;
/** Most keys lit at once (a ten-finger chord with the pedal down is well under this). */
export const MAX_LIT_KEYS = 96;

export function createNoiseTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(generateNoise(), NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function attribute(capacity: number, size: number): THREE.InstancedBufferAttribute {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
  attr.setUsage(THREE.DynamicDrawUsage);
  return attr;
}

function quad(): THREE.InstancedBufferGeometry {
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.setAttribute("position", plane.getAttribute("position"));
  plane.dispose();
  geometry.instanceCount = 0;
  return geometry;
}

export const BODY_MODE = { solid: 0, gradient: 1, outline: 2, glass: 3 } as const;

export interface NoteLayer {
  geometry: THREE.InstancedBufferGeometry;
  colorMesh: THREE.Mesh;
  emissiveMesh: THREE.Mesh;
  rect: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  state: THREE.InstancedBufferAttribute;
  capacity: number;
  uniforms: {
    uMode: { value: number };
    uColorHeight: { value: number };
    uStops: { value: Float32Array };
    uHeight: { value: number };
    uTopFade: { value: number };
    uCorner: { value: number };
    uRim: { value: number };
    uNoiseAmt: { value: number };
    uNoiseSpeed: { value: number };
    uGlassNoise: { value: number };
    uNoteGlow: { value: number };
    uPxSize: { value: number };
    uPad: { value: number };
    uTime: { value: number };
    uNoise: { value: THREE.Texture };
  };
  dispose(): void;
}

export function createNoteLayer(capacity: number, time: { value: number }, noise: THREE.Texture, previous?: NoteLayer): NoteLayer {
  const geometry = quad();
  const rect = attribute(capacity, 4);
  const color = attribute(capacity, 3);
  const state = attribute(capacity, 4);
  geometry.setAttribute("aRect", rect);
  geometry.setAttribute("aColor", color);
  geometry.setAttribute("aState", state);
  const uniforms = previous?.uniforms ?? {
    uMode: { value: 0 },
    uColorHeight: { value: 0 },
    uStops: { value: new Float32Array(12) },
    uHeight: { value: 1 },
    uTopFade: { value: 0 },
    uCorner: { value: 1 },
    uRim: { value: 0.2 },
    uNoiseAmt: { value: 0 },
    uNoiseSpeed: { value: 0.5 },
    uGlassNoise: { value: 1 },
    uNoteGlow: { value: 0.3 },
    uPxSize: { value: 1 },
    uPad: { value: NOTE_PAD_PX },
    uTime: time,
    uNoise: { value: noise },
  };
  const make = (emissive: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: NOTE_VERTEX,
      fragmentShader: NOTE_FRAGMENT,
      uniforms: { ...uniforms, uEmissive: { value: emissive ? 1 : 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: emissive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  const colorMaterial = make(false);
  const emissiveMaterial = make(true);
  const colorMesh = new THREE.Mesh(geometry, colorMaterial);
  const emissiveMesh = new THREE.Mesh(geometry, emissiveMaterial);
  colorMesh.frustumCulled = false;
  emissiveMesh.frustumCulled = false;
  colorMesh.renderOrder = 2;
  return {
    geometry,
    colorMesh,
    emissiveMesh,
    rect,
    color,
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

// ── Pressed keys ─────────────────────────────────────────────────────────────

export interface KeyLayer {
  geometry: THREE.InstancedBufferGeometry;
  mesh: THREE.Mesh;
  emissiveMesh: THREE.Mesh;
  key: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  uniforms: { uFlame: { value: number }; uFlare: { value: number }; uTint: { value: number }; uFlick: { value: number }; uTimeF: { value: number } };
  dispose(): void;
}

export function createKeyLayer(noise: THREE.Texture, timeF: { value: number }): KeyLayer {
  const geometry = quad();
  const key = attribute(MAX_LIT_KEYS, 4);
  const color = attribute(MAX_LIT_KEYS, 4);
  geometry.setAttribute("aKey", key);
  geometry.setAttribute("aColor", color);
  const uniforms = { uFlame: { value: 20 }, uFlare: { value: 0.7 }, uTint: { value: 0.5 }, uFlick: { value: 0.5 }, uTimeF: timeF };
  const make = (emissive: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: KEY_VERTEX,
      fragmentShader: KEY_FRAGMENT,
      uniforms: { ...uniforms, uNoise: { value: noise }, uEmissive: { value: emissive ? 1 : 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
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
    key,
    color,
    uniforms,
    dispose() {
      geometry.dispose();
      material.dispose();
      emissiveMaterial.dispose();
    },
  };
}

// ── Hit line ─────────────────────────────────────────────────────────────────

export interface LineLayer {
  mesh: THREE.Mesh;
  emissiveMesh: THREE.Mesh;
  uniforms: {
    uSize: { value: THREE.Vector2 };
    uAccent: { value: THREE.Vector3 };
    uBright: { value: number };
    uFlame: { value: number };
    uFlick: { value: number };
    uTimeF: { value: number };
  };
  dispose(): void;
}

export function createLineLayer(noise: THREE.Texture, timeF: { value: number }): LineLayer {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uniforms = {
    uSize: { value: new THREE.Vector2(1, 1) },
    uAccent: { value: new THREE.Vector3(1, 0.5, 0.2) },
    uBright: { value: 0.6 },
    uFlame: { value: 20 },
    uFlick: { value: 0.5 },
    uTimeF: timeF,
  };
  const make = (emissive: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      uniforms: { ...uniforms, uNoise: { value: noise }, uEmissive: { value: emissive ? 1 : 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
    });
  const material = make(false);
  const emissiveMaterial = make(true);
  const mesh = new THREE.Mesh(geometry, material);
  const emissiveMesh = new THREE.Mesh(geometry, emissiveMaterial);
  mesh.frustumCulled = false;
  emissiveMesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return {
    mesh,
    emissiveMesh,
    uniforms,
    dispose() {
      geometry.dispose();
      material.dispose();
      emissiveMaterial.dispose();
    },
  };
}
