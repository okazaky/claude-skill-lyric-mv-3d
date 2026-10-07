// s04 helpers: the engraved glass wall (a tilted plane at the end of a dark corridor, cracks radiating
// from the impact after 好き hits it), the HUD rings stacked in front of it at different depths, and the
// corridor gates/floor that give the void its perspective.
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";
import { LineBatch } from "../engine/lines";
import { LIN } from "../engine/palette";
import { ease, hash, clamp } from "../engine/util";

export const WALL_W = 22;
export const WALL_H = 12.4;
export const WALL_POS = new THREE.Vector3(1.5, 0.6, -14);
export const WALL_RY = -0.52; // ~30 deg yaw: the glass is seen at an angle, not face-on
export const RING_L = { x: 0.4, y: 0.2 }; // ring centre in wall-local coords
export const IMP_L = { x: -0.3, y: 0.35 }; // impact point in wall-local coords
const RING_DZ = [0.35, 1.0, 1.75, 2.6, 3.6, 4.7]; // ring offsets along the wall normal (toward camera)

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
out vec2 vL;
void main() {
  vL = position.xy;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vL;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec2 uImp, uHalf; uniform float uCrack, uKick, uCold, uFlash;
float crackD(vec2 p, float k) {
  float a0 = hash11(k * 3.7) * TAU;
  float len = (0.7 + 2.3 * hash11(k * 9.1)) * uCrack;
  vec2 d = vec2(cos(a0), sin(a0));
  float s = dot(p, d);
  vec2 n = vec2(-d.y, d.x);
  float jag = 0.06 * snoise(vec2(s * 4.0, k * 7.0)) + 0.025 * snoise(vec2(s * 13.0, k));
  float off = dot(p, n) - jag * s;
  return s < 0.0 || s > len ? 1e3 : abs(off);
}
void main() {
  vec2 p = vL;
  float streak = smoothstep(0.55, 0.0, abs(fract((p.x + p.y * 0.55) * 0.09 + 0.2) - 0.5) * 2.0 - 0.15);
  float vign = exp(-dot(p, p) * 0.012);
  float dark = (0.025 + 0.13 * streak) * vign * (1.0 + 0.6 * uKick);
  float eng = engrave(p, dark, 5.0, 0.62);
  vec2 g = abs(fract(p / vec2(5.2, 3.6) + 0.5) - 0.5) * vec2(5.2, 3.6);
  float gm = min(g.x, g.y);
  float mull = pxLine(gm / max(fwidth(gm), 1e-5), 0.5, 1.6);
  // the pane's outer frame: a double hairline so the plane reads as an object in perspective
  vec2 e = uHalf - abs(p);
  float em = min(e.x, e.y);
  float frame = pxLine(em / max(fwidth(em), 1e-5), 0.5, 1.8) + 0.6 * pxLine(abs(em - 0.18) / max(fwidth(em), 1e-5), 0.4, 1.4);
  vec3 col = C_INK + C_INK2 * 0.35 * vign;
  col += C_BONE * (0.065 * eng + 0.2 * mull * vign) * mix(1.0, 0.75, uCold);
  col += C_BONE * 0.55 * frame;
  if (uCrack > 0.0) {
    vec2 q = p - uImp;
    float d = 1e3;
    for (int k = 0; k < 16; k++) d = min(d, crackD(q, float(k)));
    float r = length(q);
    float ringR = 0.55 * uCrack;
    float ringJ = abs(r - ringR - 0.05 * snoise(vec2(atan(q.y, q.x) * 3.0, 2.0)));
    float ring = r < 2.0 ? ringJ : 1e3;
    float cl = pxLine(min(d, ring) / max(fwidth(q.x) + fwidth(q.y), 1e-5) * 0.7, 0.5, 1.6);
    col += C_BONE * cl * 0.9;
    col += C_BONE * 0.08 * hatch((q.x - q.y) * 22.0, 0.5 * exp(-r * 2.2));
    col += heat(0.45) * exp(-r * 3.5) * uFlash;
  }
  fragColor = vec4(col, 1.0);
}`;

export function wallMesh(): { mesh: THREE.Mesh; mat: THREE.RawShaderMaterial } {
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uImp: { value: new THREE.Vector2(IMP_L.x, IMP_L.y) },
      uHalf: { value: new THREE.Vector2(WALL_W / 2, WALL_H / 2) },
      uCrack: { value: 0 },
      uKick: { value: 0 },
      uCold: { value: 0 },
      uFlash: { value: 0 },
    },
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), mat);
  mesh.position.copy(WALL_POS);
  mesh.rotation.y = WALL_RY;
  mesh.frustumCulled = false;
  mesh.updateMatrixWorld(true);
  return { mesh, mat };
}

const _v = new THREE.Vector3();
/** Wall-local (x, y, offset along the normal) -> world. */
export function wallToWorld(m: THREE.Matrix4, x: number, y: number, z: number) {
  _v.set(x, y, z).applyMatrix4(m);
  return { x: _v.x, y: _v.y, z: _v.z };
}

/**
 * HUD rings etched in front of the glass, each at its own depth along the wall normal (so the camera
 * move shows parallax): bundles of hairlines, segmented arcs and tick rings, stepping round on the beat.
 */
export function drawRings(
  L: LineBatch,
  m: THREE.Matrix4,
  t: number,
  beat: number,
  jolt: number,
  cold: number,
) {
  const b = LIN.bone,
    s = LIN.signal;
  const step = beat; // turns steadily instead of stepping on each beat
  const rings = [
    { r: 0.75, n: 4, gap: 0.0, ticks: 0, dir: 1 },
    { r: 1.35, n: 7, gap: 0.5, ticks: 0, dir: -1 },
    { r: 2.05, n: 1, gap: 0.0, ticks: 120, dir: 1 },
    { r: 2.8, n: 11, gap: 0.6, ticks: 0, dir: -1 },
    { r: 3.7, n: 2, gap: 0.0, ticks: 60, dir: 1 },
    { r: 4.9, n: 5, gap: 0.3, ticks: 0, dir: -1 },
  ];
  const seg = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    w: number,
    c: number[],
    a: number,
  ) => {
    const A = wallToWorld(m, RING_L.x + x0, RING_L.y + y0, z);
    const B = wallToWorld(m, RING_L.x + x1, RING_L.y + y1, z);
    L.seg(A.x, A.y, A.z, B.x, B.y, B.z, w, c[0]!, c[1]!, c[2]!, a);
  };
  rings.forEach((g, gi) => {
    // the small rings float furthest from the glass: a tunnel converging on the impact
    const z = RING_DZ[RING_DZ.length - 1 - gi]! - jolt * 0.4 * (1 - gi / 6);
    const rot =
      g.dir * (step * 0.13 * (1 + gi * 0.25) + t * 0.03) + g.dir * jolt * (0.5 + gi * 0.2);
    const a = (0.34 + 0.1 * (gi % 2)) * (1 - 0.3 * cold);
    for (let k = 0; k < g.ticks; k++) {
      const ang = rot + (k / g.ticks) * Math.PI * 2;
      const long = k % 10 === 0 ? 0.16 : 0.06;
      const c = Math.cos(ang),
        sn = Math.sin(ang);
      seg(c * g.r, sn * g.r, c * (g.r + long), sn * (g.r + long), z, 1, b, a * 1.3);
    }
    const lines = gi % 2 === 0 ? 3 : 5;
    const N = Math.ceil(64 * g.r);
    for (let li = 0; li < lines; li++) {
      const rr = g.r + li * 0.035;
      for (let i = 0; i < N; i++) {
        const u0 = i / N,
          u1 = (i + 1) / N;
        const sg = Math.floor(u0 * g.n);
        if (g.n > 1 && u0 * g.n - sg >= 1 - g.gap * 0.5) continue;
        const a0 = rot + u0 * Math.PI * 2,
          a1 = rot + u1 * Math.PI * 2;
        seg(
          Math.cos(a0) * rr,
          Math.sin(a0) * rr,
          Math.cos(a1) * rr,
          Math.sin(a1) * rr,
          z,
          1,
          b,
          a * (li === 0 ? 1 : 0.5),
        );
      }
    }
    const am = rot + hash(gi, 3) * Math.PI * 2;
    const ss = [s[0] * 1.6, s[1] * 1.6, s[2] * 1.6];
    seg(
      Math.cos(am) * (g.r - 0.08),
      Math.sin(am) * (g.r - 0.08),
      Math.cos(am) * (g.r + 0.2),
      Math.sin(am) * (g.r + 0.2),
      z,
      2.4,
      ss,
      0.9,
    );
    // a strut from each ring back to the glass: makes the stacking depth legible
    const P = wallToWorld(
      m,
      RING_L.x + Math.cos(am + 1.3) * g.r,
      RING_L.y + Math.sin(am + 1.3) * g.r,
      z,
    );
    const Q = wallToWorld(
      m,
      RING_L.x + Math.cos(am + 1.3) * g.r,
      RING_L.y + Math.sin(am + 1.3) * g.r,
      0.02,
    );
    L.seg(P.x, P.y, P.z, Q.x, Q.y, Q.z, 1, b[0], b[1], b[2], a * 0.6);
  });
  seg(-5.6, 0, 5.6, 0, 0.02, 1, b, 0.18);
  seg(0, -5.6, 0, 5.6, 0.02, 1, b, 0.18);
}

/**
 * The corridor: a floor grid and a row of thin gate frames between the camera and the glass. Their
 * alpha falls off with distance; the gates brighten on the kick.
 */
export function drawCorridor(L: LineBatch, kick: number, beat: number) {
  const b = LIN.bone,
    s = LIN.signal;
  const y0 = -3.2,
    y1 = 6.2,
    zNear = 9,
    zFar = -15;
  const fade = (z: number) => clamp((z - zFar) / (zNear - zFar)) * 0.8 + 0.2;
  for (let x = -12; x <= 14; x += 1.5) {
    for (let z = zNear; z > zFar; z -= 1.5)
      L.seg(x, y0, z, x, y0, z - 1.5, 1, b[0], b[1], b[2], 0.1 * fade(z));
  }
  for (let z = zNear; z >= zFar; z -= 1.5)
    L.seg(-12, y0, z, 14, y0, z, 1, b[0], b[1], b[2], 0.1 * fade(z));
  const gates = [3, -2, -7];
  const bi = Math.floor(beat) % gates.length;
  gates.forEach((z, gi) => {
    const a = (0.16 + 0.12 * kick) * fade(z);
    const xl = -6.5,
      xr = 8.5;
    const c = gi === bi ? s : b;
    const k = gi === bi ? 1.2 : 1;
    L.seg(xl, y0, z, xl, y1, z, 1, c[0] * k, c[1] * k, c[2] * k, a);
    L.seg(xr, y0, z, xr, y1, z, 1, c[0] * k, c[1] * k, c[2] * k, a);
    L.seg(xl, y1, z, xr, y1, z, 1, c[0] * k, c[1] * k, c[2] * k, a);
    for (let i = 0; i <= 10; i++) {
      const y = y0 + ((y1 - y0) * i) / 10;
      L.seg(xl, y, z, xl + (i % 5 === 0 ? 0.4 : 0.18), y, z, 1, b[0], b[1], b[2], a);
    }
  });
}
