// s03 helpers: a landscape of token-probability bars (one merged box geometry) and its
// engraving shader. Each row of bars is one next-token distribution; the chosen row holds
// the candidates of the line's key word (優しさ is the sampled one).
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";
import { hash, noise1 } from "../engine/util";

export const COLS = 17; // columns either side of x = 0
export const ROWS = 72; // rows toward -z
export const FOOT = 0.64; // bar footprint (world units)
export const CHOSEN_ROW = 22; // z = -CHOSEN_ROW
export const HSCALE = 20; // world height per unit of probability

/** The candidates in the chosen row: [token, p, column]. index 0 is sampled. */
export const CANDS: [string, number, number][] = [
  ["優しさ", 0.41, 0],
  ["計算", 0.22, 3],
  ["演技", 0.12, -3],
  ["礼儀", 0.09, 6],
  ["本心", 0.04, -6],
];

export interface Bar {
  x: number;
  z: number;
  h: number;
  flag: number;
  row: number;
}

/** Deterministic heights: each row a lumpy distribution around a drifting mode. */
export function makeBars(): Bar[] {
  const bars: Bar[] = [];
  for (let r = 0; r < ROWS; r++) {
    const z = -r;
    const mode = 7 * Math.sin(r * 0.29) + 4 * noise1(r * 0.17, 3);
    const sig = 2.2 + 1.6 * (0.5 + 0.5 * Math.sin(r * 0.41 + 1.3));
    const amp = 2.4 + 2.6 * hash(r, 5);
    for (let c = -COLS; c <= COLS; c++) {
      let h =
        0.12 +
        amp * Math.exp(-((c - mode) ** 2) / (2 * sig * sig)) * (0.55 + 0.45 * hash(r, c, 9)) +
        0.6 * hash(r, c, 2) ** 4;
      let flag = 0;
      if (r === CHOSEN_ROW) {
        const cd = CANDS.find((k) => k[2] === c);
        if (cd) {
          h = cd[1] * HSCALE;
          flag = cd === CANDS[0] ? 1 : 2;
        } else h = 0.1 + 0.25 * hash(c, 4);
      } else if (Math.abs(r - CHOSEN_ROW) <= 2) h *= 0.35; // a clearing around the sampled row
      bars.push({ x: c, z, h, flag, row: r });
    }
  }
  return bars;
}

/** One merged geometry: per vertex the unit box corner + per-bar data (x, z, h, flag). */
export function barGeometry(bars: Bar[]): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(FOOT, 1, FOOT).toNonIndexed();
  box.translate(0, 0.5, 0);
  const bp = box.getAttribute("position") as THREE.BufferAttribute;
  const bn = box.getAttribute("normal") as THREE.BufferAttribute;
  const nv = bp.count;
  const pos = new Float32Array(bars.length * nv * 3);
  const nor = new Float32Array(bars.length * nv * 3);
  const dat = new Float32Array(bars.length * nv * 4);
  const row = new Float32Array(bars.length * nv);
  bars.forEach((b, i) => {
    for (let v = 0; v < nv; v++) {
      const o = i * nv + v;
      pos.set([bp.getX(v), bp.getY(v), bp.getZ(v)], o * 3);
      nor.set([bn.getX(v), bn.getY(v), bn.getZ(v)], o * 3);
      dat.set([b.x, b.z, b.h, b.flag], o * 4);
      row[o] = b.row;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("aBar", new THREE.BufferAttribute(dat, 4));
  g.setAttribute("aRow", new THREE.BufferAttribute(row, 1));
  return g;
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal; in vec4 aBar; in float aRow;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform float uRise, uBeat, uWave, uChosenRow, uKick, uTilt;
out vec3 vW; out vec3 vN; out vec3 vL; out float vH; out float vFlag; out float vRowD;
void main() {
  float h = aBar.z;
  float rowD = abs(aRow - uChosenRow);
  // the field rises in a wave from the front rows toward the horizon
  float grow = smoothstep(0.0, 1.0, uRise * 1.35 - aRow / 72.0 * 0.35);
  // a ripple leaves the sampled bar on every beat
  float d = length(vec2(aBar.x, aBar.y + uChosenRow));
  float ripple = exp(-pow(d - uWave * 26.0, 2.0) * 0.35) * (1.0 - uWave);
  float hh = h * grow * (1.0 + 0.55 * ripple + 0.06 * uKick) * (1.0 + uTilt * 0.6 * step(0.5, aBar.w));
  if (aBar.w < 0.5) hh = max(hh, 0.06);
  vec3 p = vec3(aBar.x + position.x, position.y * hh, aBar.y + position.z);
  vW = (modelMatrix * vec4(p, 1.0)).xyz;
  vN = normal;
  vL = vec3(position.x, position.y * hh, position.z);
  vH = hh;
  vFlag = aBar.w;
  vRowD = rowD;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vW; in vec3 vN; in vec3 vL; in float vH; in float vFlag; in float vRowD;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 uCam; uniform float uFogStart, uFogLen, uHot, uTime, uCandLit;
float edgeLine(float e) {
  float d = e / max(fwidth(e), 1e-5);
  return pxLine(d, 0.35, 1.35);
}
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.55, 0.75, 0.38));
  float lamb = sat(dot(n, L));
  float half_ = ${(FOOT / 2).toFixed(3)};
  // face-local coords: a = across the face, b = along height (or depth on the top)
  float top = step(0.5, n.y);
  float a = abs(n.x) > 0.5 ? vL.z : vL.x;
  float b = vL.y;
  float eA = half_ - abs(a);
  float eB = top > 0.5 ? half_ - abs(vL.z) : min(b, vH - b);
  float edge = top > 0.5 ? edgeLine(min(half_ - abs(vL.x), half_ - abs(vL.z))) : edgeLine(min(eA, eB));
  // engraving: horizontal hatch on the sides (heavier in the light), crosshatch on the tops
  float side = hatch(vW.y * 7.0, 0.06 + 0.34 * lamb);
  float topE = engrave(vW.xz, 0.25 + 0.5 * lamb, 9.0, 0.7);
  float ink = mix(side, topE, top);
  float dist = length(vW - uCam);
  float fog = exp(-max(dist - uFogStart, 0.0) / uFogLen);
  vec3 col = C_INK + C_INK2 * lamb * 0.8;
  col += C_BONE * (0.30 * ink * (0.35 + 0.65 * lamb) + 0.55 * edge);
  if (vFlag > 1.5) {
    col += C_BONE * (0.25 * edge + 0.12 * ink) * uCandLit;
  }
  if (vFlag > 0.5 && vFlag < 1.5) {
    // the sampled token: hot metal, still engraved
    float k = sat(0.35 + 0.45 * lamb + 0.25 * top);
    vec3 hot = heat(mix(0.32, 0.62, k)) * (0.6 + 0.8 * ink);
    col = mix(col, hot * (0.8 + 1.6 * uHot) + C_SIGNAL * edge * (0.6 + 1.5 * uHot), sat(uHot * 1.5));
  }
  // base shadow line where bars meet the ground
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.25, vW.y));
  col = mix(C_INK, col, fog);
  fragColor = vec4(col, 1.0);
}`;

export function barMaterial(): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uRise: { value: 1 },
      uBeat: { value: 0 },
      uWave: { value: 1 },
      uChosenRow: { value: CHOSEN_ROW },
      uKick: { value: 0 },
      uTilt: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uFogStart: { value: 14 },
      uFogLen: { value: 22 },
      uHot: { value: 0 },
      uTime: { value: 0 },
      uCandLit: { value: 0 },
    },
    depthTest: true,
    depthWrite: true,
  });
}
