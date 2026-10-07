// Shared pinhole camera for s05/s06 raymarch passes (copied from paperclips.ts: z up, project to canvas px).
import * as THREE from "three";
import { W, H } from "../engine/gl";

export type V3 = [number, number, number];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const nrm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface Cam {
  pos: V3;
  R: V3;
  U: V3;
  F: V3;
  focal: number;
}

export const focalFor = (fovDeg: number) => H / 2 / Math.tan((fovDeg * Math.PI) / 360);

export function lookAt(pos: V3, target: V3, roll: number, focal: number): Cam {
  const Fw = nrm(sub(target, pos));
  let R = cross(Fw, [0, 0, 1]);
  if (Math.hypot(...R) < 1e-4) R = [1, 0, 0];
  R = nrm(R);
  const U = cross(R, Fw);
  const c = Math.cos(roll),
    s = Math.sin(roll);
  const R2: V3 = [R[0] * c + U[0] * s, R[1] * c + U[1] * s, R[2] * c + U[2] * s];
  const U2: V3 = [U[0] * c - R[0] * s, U[1] * c - R[1] * s, U[2] * c - R[2] * s];
  return { pos, R: R2, U: U2, F: Fw, focal };
}

/** World → canvas px (y down); z = depth along the view axis. */
export function project(c: Cam, p: V3): { x: number; y: number; z: number } {
  const d = sub(p, c.pos);
  const z = dot(d, c.F);
  return { x: W / 2 + (c.focal * dot(d, c.R)) / z, y: H / 2 - (c.focal * dot(d, c.U)) / z, z };
}

export const camUniforms = () => ({
  camPos: { value: new THREE.Vector3() },
  camR: { value: new THREE.Vector3() },
  camU: { value: new THREE.Vector3() },
  camF: { value: new THREE.Vector3() },
  focal: { value: 1000 },
  res: { value: new THREE.Vector2(W, H) },
  time: { value: 0 },
});

export function setCam(u: Record<string, THREE.IUniform>, c: Cam, t: number) {
  (u.camPos!.value as THREE.Vector3).set(...c.pos);
  (u.camR!.value as THREE.Vector3).set(...c.R);
  (u.camU!.value as THREE.Vector3).set(...c.U);
  (u.camF!.value as THREE.Vector3).set(...c.F);
  u.focal!.value = c.focal;
  u.time!.value = t;
}

export const GLSL_CAM = /* glsl */ `
uniform vec3 camPos, camR, camU, camF; uniform float focal; uniform vec2 res; uniform float time;
vec3 camRay() { vec2 px = vUv * res - 0.5 * res; return normalize(camF * focal + camR * px.x + camU * px.y); }
`;
