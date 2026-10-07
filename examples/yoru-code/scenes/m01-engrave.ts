// Engraving material for real THREE meshes (m01 / m06: tops, extruded words, the vinyl disc).
// Lambert light from the upper left is rendered as burin lines (hatch()) whose width follows the
// light, plus a thin rim light so silhouettes stay readable on ink. Modes:
//  0 EXTRUDE: front/back faces get horizontal lines in object y; side walls get lines along depth
//  1 LATHE:   helical lines around the axis (so the spin is visible) + meridian crosshatch in shadow;
//             an optional object-y band is painted in `bandCol` (top B's orange rim)
//  2 DISC:    top face = concentric grooves with an anisotropic sheen fixed in world space; label
//             disc in the centre with an orange ring and a bone index mark (shows the rotation)
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LIN, type PaletteKey } from '../engine/palette';

const VERT = /* glsl */ `precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 projectionMatrix, modelViewMatrix, modelMatrix;
out vec3 vW; out vec3 vN; out vec3 vO; out vec3 vNo;
void main() {
  vO = position; vNo = normal;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; in vec3 vO; in vec3 vNo;
out vec4 fragColor;
uniform float mode, freq, lineLo, lineHi, glow, alpha, rimK, sideK, fogK, helix, sheenA;
uniform vec3 col, sideCol, bandCol, lightDir, camPos, hotCol;
uniform vec2 band; uniform float labelR, discR, hot;

void main() {
  vec3 n = normalize(vN);
  vec3 no = normalize(vNo);
  if (!gl_FrontFacing) { n = -n; no = -no; }
  vec3 L = normalize(lightDir);
  float diff = max(dot(n, L), 0.0);
  vec3 V = normalize(camPos - vW);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  float lit = 0.08 + 0.92 * diff;
  vec3 c = C_INK;
  if (mode < 0.5) {
    // extruded word
    bool front = abs(no.z) > 0.6;
    float u = front ? vO.y * freq : (vO.z * 0.7 + (abs(no.x) > abs(no.y) ? vO.y : vO.x) * 0.7) * freq * 1.4;
    float a = hatch(u, mix(lineLo, lineHi, lit));
    float b = hatch((vO.x * 0.7 - vO.y * 0.7) * freq * 1.15, sat(lit * 2.0 - 1.2));
    float ink = max(a, b);
    vec3 base = front ? col : sideCol * sideK;
    c = mix(C_INK, base, ink);
    // solid hairline where the face meets the bevel keeps the glyph readable at any size
    c += base * rim * rimK;
    c += hotCol * hot * ink;
  } else {
    // lathe (spinning top)
    float ang = atan(vO.z, vO.x);
    float u = vO.y * freq + ang / TAU * helix;
    float a = hatchD(u, mix(lineLo, lineHi, lit), fwidth(vO.y * freq) + 0.002);
    float mer = ang * 9.0 / TAU * 2.0;
    float b = hatchD(mer, 0.35 * smoothstep(0.45, 0.05, diff), fwidth(vO.y) * 30.0 + 0.004);
    float ink = max(a, b * 0.8);
    float inBand = step(band.x, vO.y) * step(vO.y, band.y);
    vec3 base = mix(col, bandCol, inBand);
    float bandInk = mix(ink, max(ink, 0.55 + 0.45 * lit), inBand);
    c = mix(C_INK, base, bandInk);
    c += mix(col, bandCol, inBand) * rim * rimK;
  }
  float fog = exp(-length(camPos - vW) * fogK);
  c = mix(C_INK, c, fog) * (1.0 + glow);
  fragColor = vec4(c * alpha, alpha);
}`;

// The disc needs its centre in world space, so it gets its own fragment body.
const FRAG_DISC = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; in vec3 vO; in vec3 vNo;
out vec4 fragColor;
uniform float freq, glow, alpha, rimK, fogK, sheenA, labelR, discR, spin;
uniform vec3 col, lightDir, camPos, centre, hotCol;
void main() {
  vec3 n = normalize(vN);
  vec3 no = normalize(vNo);
  vec3 V = normalize(camPos - vW);
  float diff = max(dot(n, normalize(lightDir)), 0.0);
  vec3 c = C_INK;
  float r = length(vO.xz);
  if (no.y > 0.5) {
    vec2 d = vW.xz - centre.xz;
    float aw = atan(d.y, d.x);
    float ao = atan(vO.z, vO.x);
    // sheen: two opposite wedges fixed in world (light catching the grooves)
    float sheen = pow(abs(cos(aw - sheenA)), 10.0);
    float rr = r / discR;
    // grooves, with three blank bands (track gaps)
    float gap = 1.0;
    gap *= smoothstep(0.004, 0.008, abs(rr - 0.52));
    gap *= smoothstep(0.004, 0.008, abs(rr - 0.68));
    gap *= smoothstep(0.004, 0.008, abs(rr - 0.84));
    float u = r * freq;
    float g = hatch(u, mix(0.10, 0.75, sheen) * smoothstep(labelR + 0.02, labelR + 0.06, r)) * gap;
    c = mix(C_INK, col, g * (0.55 + 0.45 * sheen));
    // outer lip hairline
    c += col * 0.5 * pxLine(abs(r - discR * 0.985) / max(fwidth(r), 1e-5), 0.4, 1.3);
    // label: engraved crosshatch disc, an orange ring and a bone index mark that turns with it
    if (r < labelR) {
      float lab = engrave(vO.xz * 6.0, 0.22, 4.0, 0.6);
      c = mix(C_INK2, col * 0.6, lab);
      float ring = pxLine(abs(r - labelR * 0.82) / max(fwidth(r), 1e-5), 0.8, 2.2);
      c = mix(c, C_SIGNAL * 1.6, ring);
      float mark = step(abs(sin(ao * 0.5)), 0.06) * step(labelR * 0.35, r) * step(r, labelR * 0.7) * step(0.0, cos(ao));
      c = mix(c, col * 1.2, mark);
      c = mix(c, C_INK, step(r, labelR * 0.08));
    }
  } else {
    // side wall: vertical hatch
    float ao = atan(vO.z, vO.x);
    float hh = hatch(vO.y * 160.0, 0.12 + 0.45 * diff);
    c = mix(C_INK, col * 0.45, hh);
    c += col * 0.2 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
  }
  float fog = exp(-length(camPos - vW) * fogK);
  c = mix(C_INK, c, fog) * (1.0 + glow);
  fragColor = vec4(c * alpha, alpha);
}`;

export const MODE = { EXTRUDE: 0, LATHE: 1 } as const;

const v3 = (k: PaletteKey, s = 1) => new THREE.Vector3(LIN[k][0] * s, LIN[k][1] * s, LIN[k][2] * s);

export interface EngraveOpts {
  mode: number;
  col?: PaletteKey;
  colScale?: number;
  sideCol?: PaletteKey;
  sideK?: number;
  bandCol?: PaletteKey;
  band?: [number, number];
  freq?: number;
  lineLo?: number;
  lineHi?: number;
  helix?: number;
  rimK?: number;
  fogK?: number;
}

/** Engraved surface material for EXTRUDE / LATHE meshes. Depth-tested opaque. */
export function engraveMaterial(o: EngraveOpts): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      mode: { value: o.mode },
      freq: { value: o.freq ?? 22 },
      lineLo: { value: o.lineLo ?? 0.12 },
      lineHi: { value: o.lineHi ?? 0.92 },
      helix: { value: o.helix ?? 3 },
      glow: { value: 0 },
      alpha: { value: 1 },
      rimK: { value: o.rimK ?? 0.35 },
      sideK: { value: o.sideK ?? 1 },
      fogK: { value: o.fogK ?? 0.025 },
      sheenA: { value: 0 },
      col: { value: v3(o.col ?? 'bone', o.colScale ?? 0.92) },
      sideCol: { value: v3(o.sideCol ?? o.col ?? 'bone', 0.9) },
      bandCol: { value: v3(o.bandCol ?? 'signal', 1.25) },
      band: { value: new THREE.Vector2(...(o.band ?? [1e5, 1e5])) },
      lightDir: { value: new THREE.Vector3(-0.55, 0.8, 0.55) },
      camPos: { value: new THREE.Vector3() },
      hotCol: { value: v3('signal', 1.6) },
      hot: { value: 0 },
      labelR: { value: 0 },
      discR: { value: 1 },
    },
    side: THREE.DoubleSide,
  });
}

/** Engraved vinyl disc material (top face grooves + label, side hatch). */
export function discMaterial(discR: number, labelR: number): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG_DISC,
    uniforms: {
      freq: { value: 34 },
      glow: { value: 0 },
      alpha: { value: 1 },
      rimK: { value: 0.3 },
      fogK: { value: 0.02 },
      sheenA: { value: 0.6 },
      labelR: { value: labelR },
      discR: { value: discR },
      spin: { value: 0 },
      col: { value: v3('bone', 0.85) },
      lightDir: { value: new THREE.Vector3(-0.55, 0.8, 0.55) },
      camPos: { value: new THREE.Vector3() },
      centre: { value: new THREE.Vector3() },
      hotCol: { value: v3('signal', 1.6) },
    },
  });
}

/** Push the camera position into every engraved material of a scene graph. */
export function syncCam(root: THREE.Object3D, cam: THREE.Camera) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.RawShaderMaterial | undefined;
    const u = m?.uniforms?.camPos;
    if (u) (u.value as THREE.Vector3).copy(cam.position);
  });
}
