// m05 helper: an engraved 3D tube knot (a (3,4) torus knot) cut into K strands. Each strand can straighten
// independently (uM[k] 0..1) into a straight rod lying on the floor, all rods parallel and receding toward
// the vanishing point — "the night is untied". The tube centre line and its frame are computed in the
// vertex shader for both states and blended, so the morph is one draw call and fully deterministic.
// Shading: ring hatch across the tube (bone lines whose width follows the light), a silhouette hairline,
// fog to ink with distance. One strand (HOT) is signal orange.
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";

export const K = 14;
export const HOT = 9;
const NS = 140; // segments per strand
const NR = 14; // radial segments

export function knotGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (let k = 0; k < K; k++) {
    for (let i = 0; i <= NS; i++) {
      const u = i / NS;
      for (let j = 0; j <= NR; j++) pos.push(u, (j / NR) * Math.PI * 2, k);
    }
    for (let i = 0; i < NS; i++)
      for (let j = 0; j < NR; j++) {
        const a = base + i * (NR + 1) + j,
          b = a + NR + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    base += (NS + 1) * (NR + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `precision highp float;
in vec3 position;
uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform float uM[${K}];
uniform float uR, uKR, uL, uRotY, uRotX, uFloorY, uSpace, uZ0, uKLen;
uniform vec3 uKPos;
out vec3 vN; out vec3 vW; out float vU; out float vK; out float vM;
const float TAU_ = 6.28318530718;
vec3 knotP(float s) {
  float ph = s * TAU_;
  float r = 1.0 + 0.45 * cos(4.0 * ph);
  vec3 p = vec3(r * cos(3.0 * ph), r * sin(3.0 * ph), 0.55 * sin(4.0 * ph)) * uKR;
  float cy = cos(uRotY), sy = sin(uRotY), cx = cos(uRotX), sx = sin(uRotX);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  return p + uKPos;
}
void main() {
  float u = position.x, ang = position.y, k = position.z;
  float s = (k + u) / ${K}.0;
  float m = uM[int(k + 0.5)];
  // knot state
  float e = 0.0015;
  vec3 c0 = knotP(s), cp = knotP(s + e), cm = knotP(s - e);
  vec3 T0 = normalize(cp - cm);
  vec3 N0 = normalize(cp - 2.0 * c0 + cm + T0 * 1e-6);
  N0 = normalize(N0 - T0 * dot(N0, T0));
  // straight state: a rod on the floor along -z
  float x = (k - ${((K - 1) / 2).toFixed(2)}) * uSpace;
  vec3 c1 = vec3(x, uFloorY + uR, uZ0 - u * uL);
  vec3 T1 = vec3(0.0, 0.0, -1.0);
  vec3 N1 = vec3(0.0, 1.0, 0.0);
  float mm = m * m * (3.0 - 2.0 * m);
  vec3 c = mix(c0, c1, mm);
  vec3 T = normalize(mix(T0, T1, mm) + 1e-5);
  vec3 N = mix(N0, N1, mm);
  N = normalize(N - T * dot(N, T) + vec3(1e-5, 0.0, 0.0));
  vec3 B = cross(T, N);
  vec3 n = N * cos(ang) + B * sin(ang);
  float r = uR * (1.0 - 0.25 * mm);
  vec3 w = c + n * r;
  vN = n; vW = w; vK = k; vM = mm;
  vU = mix(s * uKLen, u * uL, mm);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec3 vN; in vec3 vW; in float vU; in float vK; in float vM;
out vec4 fragColor;
uniform vec3 uCam; uniform float uFog, uHot, uRing;
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.5, 0.75, 0.45));
  float lamb = sat(dot(n, L));
  vec3 V = normalize(uCam - vW);
  float fres = 1.0 - abs(dot(n, V));
  float rings = hatch(vU * uRing, mix(0.05, 0.6, lamb));
  float sil = smoothstep(0.72, 0.95, fres);
  vec3 col = C_INK2 * (0.5 + 0.5 * lamb) + C_BONE * (0.62 * rings * (0.4 + 0.6 * lamb) + 0.35 * sil);
  if (abs(vK - ${HOT}.0) < 0.5) {
    vec3 hot = heat(mix(0.38, 0.62, lamb)) * (0.5 + 0.9 * rings) + C_SIGNAL * sil * 0.8;
    col = mix(col, hot * (0.9 + 0.8 * uHot), 0.85);
  }
  float d = length(vW - uCam);
  col = mix(C_INK, col, exp(-max(d - 8.0, 0.0) / uFog));
  fragColor = vec4(col, 1.0);
}`;

export function knotMaterial(): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uM: { value: new Array(K).fill(0) },
      uR: { value: 0.115 },
      uKR: { value: 1.55 },
      uL: { value: 95 },
      uRotY: { value: 0 },
      uRotX: { value: 0 },
      uFloorY: { value: -2.2 },
      uSpace: { value: 0.62 },
      uZ0: { value: 4 },
      uKLen: { value: 30 },
      uKPos: { value: new THREE.Vector3() },
      uCam: { value: new THREE.Vector3() },
      uFog: { value: 26 },
      uHot: { value: 0 },
      uRing: { value: 10 },
    },
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

/** Arc length of the knot curve (same formula as the shader, before rotation). */
export function knotLength(kr: number) {
  let L = 0;
  let px = 0,
    py = 0,
    pz = 0;
  const N = 4000;
  for (let i = 0; i <= N; i++) {
    const ph = (i / N) * Math.PI * 2;
    const r = 1 + 0.45 * Math.cos(4 * ph);
    const x = r * Math.cos(3 * ph) * kr,
      y = r * Math.sin(3 * ph) * kr,
      z = 0.55 * Math.sin(4 * ph) * kr;
    if (i > 0) L += Math.hypot(x - px, y - py, z - pz);
    px = x;
    py = y;
    pz = z;
  }
  return L;
}
