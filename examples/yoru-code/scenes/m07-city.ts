// m07 helper: a floor of tiny code-glyph tiles that lifts into an engraved 3D spectrum city.
// One merged box geometry (one box per tile); per-bar data: x, z, target height, band, glyph cell, flag.
// Bands rise one per sung character (uRise[band] 0..1, driven by the scene from the syllable starts).
// Tops carry a mono code glyph from an atlas (the "code"), sides are hatched along the height,
// edges get a bone hairline; the single flagged bar is hot signal metal (the sound).
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";
import { F, font } from "../engine/type";
import { hash, noise1 } from "../engine/util";

export const COLS = 8; // columns either side of 0
export const ROWS = 40;
export const BANDS = 10;
export const FOOT = 0.8;
export const HOT_ROW = 12;
export const HOT_COL = 3;
const CHARS = "{}();=<>/*01#$&|[]+-:%!?~^.,@_ABCDEFxyz0123456789fnif";
const AT = 8; // atlas cells per side

export function cityGeometry(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(FOOT, 1, FOOT).toNonIndexed();
  box.translate(0, 0.5, 0);
  const bp = box.getAttribute("position") as THREE.BufferAttribute;
  const bn = box.getAttribute("normal") as THREE.BufferAttribute;
  const nv = bp.count;
  const n = (COLS * 2 + 1) * ROWS;
  const pos = new Float32Array(n * nv * 3);
  const nor = new Float32Array(n * nv * 3);
  const dat = new Float32Array(n * nv * 4);
  const ext = new Float32Array(n * nv * 2);
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    const mode = 3.2 * Math.sin(r * 0.37) + 1.5 * noise1(r * 0.21, 4);
    const amp = 1.4 + 2.2 * hash(r, 7);
    for (let c = -COLS; c <= COLS; c++) {
      const f = Math.abs(c) / COLS;
      let h =
        0.35 +
        amp * (0.45 * Math.exp(-((c - mode) ** 2) / 6) + 0.55 * (1 - f) ** 1.6) * (0.5 + 0.5 * hash(r, c, 3)) +
        0.8 * hash(r, c, 5) ** 6;
      let flag = 0;
      if (r === HOT_ROW && c === HOT_COL) {
        h = 7.5;
        flag = 1;
      }
      const band = Math.min(BANDS - 1, Math.floor((r / ROWS) * BANDS * 1.4)); // front bands are thin, the last one is deep
      const cell = Math.floor(hash(r, c, 11) * CHARS.length);
      for (let v = 0; v < nv; v++) {
        const o = i * nv + v;
        pos.set([bp.getX(v), bp.getY(v), bp.getZ(v)], o * 3);
        nor.set([bn.getX(v), bn.getY(v), bn.getZ(v)], o * 3);
        dat.set([c, -r, h, flag], o * 4);
        ext.set([band, cell], o * 2);
      }
      i++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("aBar", new THREE.BufferAttribute(dat, 4));
  g.setAttribute("aExt", new THREE.BufferAttribute(ext, 2));
  return g;
}

export function glyphAtlas(): THREE.CanvasTexture {
  const S = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S * AT;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#000";
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#fff";
  c.font = font(F.mono(600), 44);
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (let k = 0; k < AT * AT; k++) {
    const ch = CHARS[k % CHARS.length]!;
    c.fillText(ch, (k % AT) * S + S / 2, Math.floor(k / AT) * S + S / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}

const VERT = /* glsl */ `precision highp float;
in vec3 position; in vec3 normal; in vec4 aBar; in vec2 aExt;
uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform float uRise[${BANDS}]; uniform float uHotRise; uniform vec4 uXform; // xyz offset, w scale (default 0,0,0,1)
uniform float uStreet; // columns with |c| < uStreet stay flat (a street to fly through); 0 = none
out vec3 vW; out vec3 vN; out vec3 vL; out float vH; out float vFlag; out float vCell; out float vRise;
void main() {
  float rise = uRise[int(aExt.x + 0.5)];
  if (aBar.w > 0.5) rise = uHotRise;
  float hh = abs(aBar.x) < uStreet ? 0.03 : mix(0.05, aBar.z, rise);
  vec3 p = vec3(aBar.x + position.x, position.y * hh, aBar.y + position.z) * uXform.w + uXform.xyz;
  vW = p; vN = normal; vL = vec3(position.x, position.y * hh, position.z);
  vH = hh; vFlag = aBar.w; vCell = aExt.y; vRise = rise;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec3 vW; in vec3 vN; in vec3 vL; in float vH; in float vFlag; in float vCell; in float vRise;
out vec4 fragColor;
uniform sampler2D uAtlas; uniform vec3 uCam; uniform float uFogStart, uFogLen, uHot;
float edgeLine(float e) { return pxLine(e / max(fwidth(e), 1e-5), 0.35, 1.35); }
void main() {
  vec3 n = normalize(vN);
  float lamb = sat(dot(n, normalize(vec3(-0.55, 0.75, 0.38))));
  float hf = ${(FOOT / 2).toFixed(3)};
  float top = step(0.5, n.y);
  float a = abs(n.x) > 0.5 ? vL.z : vL.x;
  float edge = top > 0.5 ? edgeLine(min(hf - abs(vL.x), hf - abs(vL.z))) : edgeLine(min(hf - abs(a), min(vL.y, vH - vL.y)));
  // top: the code glyph on the tile
  vec2 tuv = vec2(vL.x, -vL.z) / (2.0 * hf) + 0.5;
  float cx = mod(vCell, ${AT}.0), cy = floor(vCell / ${AT}.0);
  // canvas texture is flipY: v = 1 - canvasY
  vec2 cuv = (vec2(cx, cy) + vec2(tuv.x, 1.0 - tuv.y) * 0.9 + 0.05) / ${AT}.0;
  float g = texture(uAtlas, vec2(cuv.x, 1.0 - cuv.y)).r;
  float topE = engrave(vW.xz, 0.18 + 0.3 * lamb, 11.0, 0.7);
  float side = hatch(vW.y * 8.0, 0.06 + 0.4 * lamb);
  vec3 col = C_INK + C_INK2 * lamb * 0.9;
  col += C_BONE * mix(0.28 * side * (0.35 + 0.65 * lamb), 0.10 * topE + 0.55 * g, top) + C_BONE * 0.5 * edge;
  if (vFlag > 0.5) {
    float k = sat(0.35 + 0.45 * lamb + 0.25 * top);
    vec3 hot = heat(mix(0.32, 0.62, k)) * (0.6 + 0.8 * side) + C_SIGNAL * edge * 1.4;
    col = mix(col, hot * (0.9 + 1.2 * uHot), sat(vRise * 3.0));
  }
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.3, vW.y));
  float d = length(vW - uCam);
  col = mix(C_INK, col, exp(-max(d - uFogStart, 0.0) / uFogLen));
  fragColor = vec4(col, 1.0);
}`;

export function cityMaterial(atlas: THREE.Texture): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uRise: { value: new Array(BANDS).fill(0) },
      uStreet: { value: 0 },
      uXform: { value: new THREE.Vector4(0, 0, 0, 1) },
      uHotRise: { value: 0 },
      uAtlas: { value: atlas },
      uCam: { value: new THREE.Vector3() },
      uFogStart: { value: 9 },
      uFogLen: { value: 16 },
      uHot: { value: 0 },
    },
    depthTest: true,
    depthWrite: true,
  });
}
