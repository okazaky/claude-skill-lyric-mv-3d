// Night floor for m01/m06: one fullscreen pass that casts a ray from the real perspective camera
// onto the plane y = 0. Bone hairline grid (minor/major, LOD-faded), sparse engraved burin lines that
// thicken toward the horizon, hatched contact shadows under up to 2 tops, and up to 4 signal rings
// running out from landing points (events on lyric words, not beats). Sky: ink with a faint haze.
// Writes no depth: draw meshes after it with a cleared depth buffer.
import * as THREE from 'three';
import { FSPass, W, H } from '../engine/gl';

const FRAG = /* glsl */ `
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos;
uniform float uGrid, uT, uFog;
uniform vec4 uShadow[2];   // xz, radius, strength
uniform vec4 uRing[4];     // xz, start time, strength

vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
float gridL(vec2 q, float s) {
  vec2 g = q / s;
  vec2 w = fwidth(g);
  vec2 d = abs(fract(g - 0.5) - 0.5) / max(w, 1e-5);
  float lod = 1.0 - smoothstep(0.2, 0.6, max(w.x, w.y));
  return max(pxLine(d.x, 0.3, 1.3), pxLine(d.y, 0.3, 1.3)) * lod;
}
void main() {
  vec3 d = rayDir(vUv);
  vec3 col = C_INK + C_GRAPHITE * 0.05 * exp(-abs(d.y) * 22.0);
  if (d.y < -1e-4) {
    float t = -uCamPos.y / d.y;
    vec3 p = uCamPos + d * t;
    vec2 g = p.xz;
    float fade = exp(-t * uFog);
    vec3 c = C_INK;
    c += C_GRAPHITE * 0.55 * gridL(g, 0.5) * uGrid;
    c += C_ASH * 0.5 * gridL(g, 2.0) * uGrid;
    // engraved floor: sparse horizontal burin lines (world z), heavier far away
    c += C_GRAPHITE * 0.07 * hatch(g.y * 2.2, 0.05 + 0.25 * (1.0 - fade)) * uGrid;
    // contact shadows: hatched discs (ink lines across the grid)
    for (int i = 0; i < 2; i++) {
      vec4 s = uShadow[i];
      if (s.w <= 0.0) continue;
      float r = length(g - s.xy) / s.z;
      float sh = (1.0 - smoothstep(0.35, 1.0, r)) * s.w;
      float lines = hatch((g.x + g.y) * 14.0, 0.5 + 0.4 * sh);
      c = mix(c, C_INK, sh * mix(0.55, 1.0, lines));
    }
    // landing rings
    for (int i = 0; i < 4; i++) {
      vec4 rg = uRing[i];
      float a = uT - rg.z;
      if (rg.w <= 0.0 || a < 0.0 || a > 1.6) continue;
      float rr = length(g - rg.xy);
      float R = 0.25 + 1.9 * (1.0 - exp(-a * 2.6));
      float fw = max(fwidth(rr), 1e-5);
      float ring = pxLine(abs(rr - R) / fw, 0.6, 1.8);
      float ring2 = pxLine(abs(rr - R * 0.72) / fw, 0.3, 1.1) * 0.5;
      float life = rg.w * (1.0 - smoothstep(0.2, 1.6, a));
      c += C_SIGNAL * 1.4 * (ring + ring2) * life;
    }
    col = mix(C_INK + C_GRAPHITE * 0.05, c, fade);
  }
  col += C_ASH * 0.10 * pxLine(abs(d.y) / max(fwidth(d.y), 1e-6), 0.4, 1.4) * uGrid;
  fragColor = vec4(col, 1.0);
}`;

export class NightFloor {
  cam: THREE.PerspectiveCamera;
  pass = new FSPass(FRAG, {
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uGrid: { value: 1 },
    uT: { value: 0 },
    uFog: { value: 0.05 },
    uShadow: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uRing: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  });
  constructor(fov = 46) {
    this.cam = new THREE.PerspectiveCamera(fov, W / H, 0.05, 300);
  }
  look(px: number, py: number, pz: number, tx: number, ty: number, tz: number, roll = 0, fov?: number) {
    const c = this.cam;
    if (fov) c.fov = fov;
    c.position.set(px, py, pz);
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    c.lookAt(tx, ty, tz);
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }
  shadow(i: number, x: number, z: number, r: number, k: number) { (this.pass.u.uShadow!.value as THREE.Vector4[])[i]!.set(x, z, r, k); }
  ring(i: number, x: number, z: number, t0: number, k: number) { (this.pass.u.uRing!.value as THREE.Vector4[])[i]!.set(x, z, t0, k); }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, t: number, grid = 1) {
    const u = this.pass.u;
    (u.uInvProj!.value as THREE.Matrix4).copy(this.cam.projectionMatrixInverse);
    (u.uCamWorld!.value as THREE.Matrix4).copy(this.cam.matrixWorld);
    (u.uCamPos!.value as THREE.Vector3).copy(this.cam.position);
    u.uGrid!.value = grid;
    u.uT!.value = t;
    this.pass.render(renderer, out);
  }
  /** World point -> logical screen px (y down) and depth; null behind the camera. */
  project(x: number, y: number, z: number, v = new THREE.Vector3()) {
    v.set(x, y, z).applyMatrix4(this.cam.matrixWorldInverse);
    const depth = -v.z;
    if (depth <= 0.01) return null;
    v.applyMatrix4(this.cam.projectionMatrix);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, depth };
  }
}
