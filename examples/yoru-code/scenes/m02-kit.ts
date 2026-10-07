// Shared kit for m02 / m03 / m04 (「夜をほどくコード」): a night grid world, engraved materials for
// spheres and box fields, and a camera rig with projection to logical screen px.
//  - GridWorld: one fullscreen pass casting a ray per fragment from a real perspective camera onto a
//    flat floor (y = 0): bone hairline grid (major line every 4), faint engraved rings around a focus,
//    fog to ink; sky = ink with a thin bone haze on the horizon.
//  - sphereMaterial(): woodcut sphere (latitude hatch weighted by light, graphite cross lines in the
//    shadow, bone silhouette rim) — the MV's sphere look (dots, MOON).
//  - boxField()/boxMaterial(): many boxes in one geometry (keys, slabs, bezels) rendered as engraved
//    plates: hatch on the sides, crosshatch on the tops, crisp edge lines; per-box slot for presses/heat.
import * as THREE from "three";
import { FSPass, W, H } from "../engine/gl";
import { GLSL_COMMON } from "../engine/glsl/common";

// ------------------------------------------------------------------------------------------ world
const WORLD_FRAG = /* glsl */ `
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos;
uniform vec3 uFocus; // x, z, ring alpha
uniform float uGrid, uFog, uHaze, uFloorY;

vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
void main() {
  vec3 d = rayDir(vUv);
  vec3 col = C_INK + C_BONE * 0.03 * uHaze * exp(-abs(d.y) * 16.0);
  float h = uCamPos.y - uFloorY;
  if (d.y < -1e-4 && h > 0.0) {
    float t = h / -d.y;
    vec3 p = uCamPos + d * t;
    vec2 g = p.xz;
    float fog = exp(-t * uFog);
    vec2 w = fwidth(g);
    vec2 gd = abs(fract(g - 0.5) - 0.5) / max(w, 1e-5);
    float gl = max(pxLine(gd.x, 0.5, 1.4), pxLine(gd.y, 0.5, 1.4));
    vec2 g4 = g * 0.25;
    vec2 gd4 = abs(fract(g4 - 0.5) - 0.5) / max(fwidth(g4), 1e-5);
    float gM = max(pxLine(gd4.x, 0.8, 1.9), pxLine(gd4.y, 0.8, 1.9));
    float lod = 1.0 - smoothstep(0.15, 0.5, max(w.x, w.y));
    vec3 ground = C_INK;
    ground += C_BONE * (0.13 * gl * lod + 0.16 * gM) * uGrid;
    // engraved rings around the focus (the plate's centre), fading outward
    float rr = length(g - uFocus.xy);
    float ring = hatch(rr * 1.6, 0.07) * (1.0 - smoothstep(2.0, 11.0, rr));
    ground += C_BONE * 0.06 * ring * uFocus.z;
    col = mix(col, ground, fog);
  }
  col += C_BONE * 0.10 * pxLine(abs(d.y) / max(fwidth(d.y), 1e-6), 0.5, 1.5);
  fragColor = vec4(col, 1.0);
}`;

export interface GridParams {
  grid?: number;
  fog?: number;
  haze?: number;
  focus?: [number, number, number];
  floorY?: number;
}

export class GridWorld {
  pass = new FSPass(WORLD_FRAG, {
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uFocus: { value: new THREE.Vector3(0, 0, 1) },
    uGrid: { value: 1 },
    uFog: { value: 0.05 },
    uHaze: { value: 1 },
    uFloorY: { value: 0 },
  });
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: THREE.PerspectiveCamera, p: GridParams = {}) {
    const u = this.pass.u;
    (u.uInvProj!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    (u.uCamWorld!.value as THREE.Matrix4).copy(cam.matrixWorld);
    (u.uCamPos!.value as THREE.Vector3).copy(cam.position);
    const fo = p.focus ?? [0, 0, 1];
    (u.uFocus!.value as THREE.Vector3).set(fo[0], fo[1], fo[2]);
    u.uGrid!.value = p.grid ?? 1;
    u.uFog!.value = p.fog ?? 0.05;
    u.uHaze!.value = p.haze ?? 1;
    u.uFloorY!.value = p.floorY ?? 0;
    this.pass.render(renderer, out);
  }
}

// ------------------------------------------------------------------------------------------ shots
/** Which shot t falls in, given cut times [T0, c1, ..., T1]; p = 0..1 progress inside the shot. */
export function shotAt(t: number, cuts: number[]) {
  let i = 0;
  while (i < cuts.length - 2 && t >= cuts[i + 1]!) i++;
  const a = cuts[i]!,
    b = cuts[i + 1]!;
  return { i, p: Math.min(1, Math.max(0, (t - a) / Math.max(1e-4, b - a))), a, b };
}

// ------------------------------------------------------------------------------------------ camera
export class Rig {
  cam: THREE.PerspectiveCamera;
  private v = new THREE.Vector3();
  constructor(fov = 50) {
    this.cam = new THREE.PerspectiveCamera(fov, W / H, 0.05, 400);
  }
  look(px: number, py: number, pz: number, tx: number, ty: number, tz: number, roll = 0, fov?: number) {
    const c = this.cam;
    if (fov !== undefined) c.fov = fov;
    c.position.set(px, py, pz);
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    c.lookAt(tx, ty, tz);
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }
  /** World point -> logical screen px (y down) and view depth; null when behind the camera. */
  project(x: number, y: number, z: number) {
    const v = this.v.set(x, y, z).applyMatrix4(this.cam.matrixWorldInverse);
    const depth = -v.z;
    if (depth <= 0.01) return null;
    v.applyMatrix4(this.cam.projectionMatrix);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, depth };
  }
  /**
   * Put an object at view depth `depth` under logical screen point (sx, sy), facing the camera,
   * then turned by `yaw` / `pitch` (radians) so it shows its perspective.
   */
  placeOnScreen(obj: THREE.Object3D, sx: number, sy: number, depth: number, yaw = 0, pitch = 0) {
    const c = this.cam;
    const v = this.v.set((sx / W) * 2 - 1, 1 - (sy / H) * 2, 0.5).unproject(c).sub(c.position).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    const d = depth / Math.max(0.05, v.dot(fwd));
    obj.position.copy(c.position).addScaledVector(v, d);
    obj.quaternion.copy(c.quaternion);
    obj.rotateY(yaw);
    obj.rotateX(pitch);
  }
  /** World units per logical px at a view depth. */
  pxPerUnit(depth: number) {
    return H / (2 * depth * Math.tan((this.cam.fov * Math.PI) / 360));
  }
}

// ------------------------------------------------------------------------------------------ sphere
const SPH_VERT = /* glsl */ `precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
uniform mat3 uNormalMat;
out vec3 vW; out vec3 vN; out vec3 vON;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vON = normal; vN = normalize(uNormalMat * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SPH_FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; in vec3 vON; out vec4 fragColor;
uniform vec3 uCam, uL, uCol, uRim;
uniform float uFreq, uHot, uTilt, uFogK, uOpacity, uGlow;
void main() {
  vec3 n = normalize(vN);
  vec3 no = normalize(vON);
  vec3 v = normalize(uCam - vW);
  float lam = sat(dot(n, normalize(uL)));
  float ca = cos(uTilt), sa = sin(uTilt);
  float ny = no.y * ca + no.z * sa;
  float lat = asin(clamp(ny, -1.0, 1.0));
  float lines = hatch(lat * uFreq, mix(0.07, 0.78, lam));
  float mer = atan(no.x, no.z * ca - no.y * sa) * uFreq * 0.7;
  float cross2 = hatchD(mer, 0.28 * smoothstep(0.35, 0.05, lam), fwidth(lat * uFreq) * 0.7 / max(abs(cos(lat)), 0.2));
  float nv = sat(dot(n, v));
  float rim = pxLine(nv / max(fwidth(nv), 1e-5), 0.7, 2.0);
  vec3 col = C_INK + C_INK2 * lam * 0.5;
  col += uCol * (0.62 * lines + 0.22 * cross2) * (1.0 + uGlow);
  col += uRim * rim;
  vec3 hot = heat(mix(0.35, 0.7, lam)) * (0.5 + 0.9 * lines);
  col = mix(col, hot + C_SIGNAL * rim, sat(uHot));
  float fog = exp(-max(length(vW - uCam) - 8.0, 0.0) * uFogK);
  col = mix(C_INK, col, fog);
  fragColor = vec4(col * uOpacity, 1.0);
}`;

export function sphereMaterial(col: [number, number, number], rim: [number, number, number], freq = 9) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SPH_VERT,
    fragmentShader: SPH_FRAG,
    uniforms: {
      uNormalMat: { value: new THREE.Matrix3() },
      uCam: { value: new THREE.Vector3() },
      uL: { value: new THREE.Vector3(-0.5, 0.7, 0.55) },
      uCol: { value: new THREE.Vector3(...col) },
      uRim: { value: new THREE.Vector3(...rim) },
      uFreq: { value: freq },
      uHot: { value: 0 },
      uTilt: { value: 0.45 },
      uFogK: { value: 0.04 },
      uOpacity: { value: 1 },
      uGlow: { value: 0 },
    },
    depthTest: true,
    depthWrite: true,
  });
}

/** Sync the per-mesh uniforms a sphere material needs (normal matrix, camera). */
export function syncSphere(mesh: THREE.Mesh, cam: THREE.Camera) {
  mesh.updateMatrixWorld(true);
  const u = (mesh.material as THREE.RawShaderMaterial).uniforms;
  (u.uNormalMat!.value as THREE.Matrix3).getNormalMatrix(mesh.matrixWorld);
  (u.uCam!.value as THREE.Vector3).copy(cam.position);
}

// ------------------------------------------------------------------------------------------ boxes
export interface Box {
  /** centre */
  x: number;
  y: number;
  z: number;
  /** full size */
  w: number;
  h: number;
  d: number;
  /** press / heat slot (-1 = none) */
  slot?: number;
  /** 0 body (dim), 1 key/plate (normal), 2 glass (dark front, edges only), 3 bright bezel */
  kind?: number;
}

export function boxField(boxes: Box[]): THREE.BufferGeometry {
  const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const up = unit.getAttribute("position") as THREE.BufferAttribute;
  const un = unit.getAttribute("normal") as THREE.BufferAttribute;
  const nv = up.count;
  const pos = new Float32Array(boxes.length * nv * 3);
  const nor = new Float32Array(boxes.length * nv * 3);
  const cen = new Float32Array(boxes.length * nv * 3);
  const hal = new Float32Array(boxes.length * nv * 3);
  const sk = new Float32Array(boxes.length * nv * 2);
  boxes.forEach((b, i) => {
    for (let v = 0; v < nv; v++) {
      const o = i * nv + v;
      pos.set([up.getX(v) * b.w, up.getY(v) * b.h, up.getZ(v) * b.d], o * 3);
      nor.set([un.getX(v), un.getY(v), un.getZ(v)], o * 3);
      cen.set([b.x, b.y, b.z], o * 3);
      hal.set([b.w / 2, b.h / 2, b.d / 2], o * 3);
      sk.set([b.slot ?? -1, b.kind ?? 1], o * 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("aCenter", new THREE.BufferAttribute(cen, 3));
  g.setAttribute("aHalf", new THREE.BufferAttribute(hal, 3));
  g.setAttribute("aSK", new THREE.BufferAttribute(sk, 2));
  return g;
}

export const NSLOT = 16;

const BOX_VERT = /* glsl */ `precision highp float;
in vec3 position; in vec3 normal; in vec3 aCenter; in vec3 aHalf; in vec2 aSK;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
uniform float uPress[${NSLOT}];
uniform float uLift[${NSLOT}];
uniform float uPressDepth;
out vec3 vW; out vec3 vN; out vec3 vL; out vec3 vH; out float vSlot; out float vKind; out vec3 vObj;
void main() {
  int s = int(aSK.x + 0.5);
  vec3 p = aCenter + position;
  if (aSK.x > -0.5) { p.y += -uPress[s] * uPressDepth + uLift[s]; }
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz; vObj = p;
  vN = normalize(mat3(modelMatrix) * normal);
  vL = position; vH = aHalf; vSlot = aSK.x; vKind = aSK.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BOX_FRAG = /* glsl */ `precision highp float;
precision highp int;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; in vec3 vL; in vec3 vH; in float vSlot; in float vKind; in vec3 vObj;
out vec4 fragColor;
uniform vec3 uCam, uL, uCol;
uniform float uHot[${NSLOT}];
uniform float uFreq, uFogStart, uFogLen, uBright;
void main() {
  vec3 n = normalize(vN);
  float lamb = sat(dot(n, normalize(uL)));
  // face-local edge distance: the two axes lying in the face
  vec3 dd = vH - abs(vL);
  // which axis is the face normal (object space): the one where |vL| == half
  vec3 onFace = step(dd, vec3(min(dd.x, min(dd.y, dd.z)) + 1e-4));
  dd += onFace * 1e3;
  float e = min(dd.x, min(dd.y, dd.z));
  float edge = pxLine(e / max(fwidth(e), 1e-5), 0.35, 1.35);
  bool top = onFace.y > 0.5 && vL.y > 0.0;
  float side = hatch(vObj.y * uFreq, 0.06 + 0.34 * lamb);
  float topE = engrave(vObj.xz, 0.22 + 0.5 * lamb, uFreq * 0.9, 0.7);
  float ink = top ? topE : side;
  float kind = vKind;
  float kInk = kind < 0.5 ? 0.45 : (kind < 1.5 ? 1.0 : (kind < 2.5 ? 0.12 : 0.8));
  float kEdge = kind < 0.5 ? 0.45 : (kind < 1.5 ? 0.85 : (kind < 2.5 ? 0.7 : 1.1));
  vec3 col = C_INK + C_INK2 * lamb * (kind > 1.5 && kind < 2.5 ? 0.15 : 0.8);
  col += uCol * (0.30 * ink * kInk * (0.35 + 0.65 * lamb) + 0.55 * edge * kEdge) * uBright;
  if (vSlot > -0.5) {
    float h = uHot[int(vSlot + 0.5)];
    if (h > 0.001) {
      float k = sat(0.35 + 0.45 * lamb + (top ? 0.25 : 0.0));
      vec3 hot = heat(mix(0.32, 0.62, k)) * (0.6 + 0.8 * ink) + C_SIGNAL * edge * 1.4;
      col = mix(col, hot * (0.8 + 0.8 * h), sat(h * 1.4));
    }
  }
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.2, vW.y + 0.001));
  float dist = length(vW - uCam);
  float fog = exp(-max(dist - uFogStart, 0.0) / uFogLen);
  col = mix(C_INK, col, fog);
  fragColor = vec4(col, 1.0);
}`;

export function boxMaterial(col: [number, number, number] = [1, 1, 1], freq = 9) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: BOX_VERT,
    fragmentShader: BOX_FRAG,
    uniforms: {
      uPress: { value: new Array(NSLOT).fill(0) },
      uLift: { value: new Array(NSLOT).fill(0) },
      uHot: { value: new Array(NSLOT).fill(0) },
      uPressDepth: { value: 0.1 },
      uCam: { value: new THREE.Vector3() },
      uL: { value: new THREE.Vector3(-0.55, 0.75, 0.38) },
      uCol: { value: new THREE.Vector3(...col) },
      uFreq: { value: freq },
      uFogStart: { value: 10 },
      uFogLen: { value: 24 },
      uBright: { value: 1 },
    },
    depthTest: true,
    depthWrite: true,
  });
}
