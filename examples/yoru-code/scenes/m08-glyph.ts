// m08: engraved display glyph on a 3D plane (adapted from AIと私 s10-glyph, reveal mode only).
// Glyph mask (R) + blurred relief height (G) baked to a canvas texture. The shader lights the relief
// from the upper left and renders it as engraving: horizontal lines weighted by the light (hatch()),
// plus an inner rim. `reveal` 0..1 cuts the lines left to right, each line with its own lag (a burin).
import * as THREE from "three";
import { font } from "../engine/type";
import { GLSL_COMMON } from "../engine/glsl/common";
import { SCALE } from "../engine/scale";

const VERT = /* glsl */ `precision highp float;
in vec3 position; in vec2 uv; uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec2 vUv; out vec4 fragColor;
uniform sampler2D map; uniform vec2 texel; uniform vec2 inkU; uniform vec2 inkV;
uniform float reveal, freq, opacity, glow, ghost;
uniform vec3 col;
void main() {
  vec4 tx = texture(map, vUv);
  float m = tx.r;
  vec2 e = texel * 2.0;
  float gx = texture(map, vUv + vec2(e.x, 0.0)).g - texture(map, vUv - vec2(e.x, 0.0)).g;
  float gy = texture(map, vUv + vec2(0.0, e.y)).g - texture(map, vUv - vec2(0.0, e.y)).g;
  float shade = clamp(0.5 + 4.0 * dot(vec2(gx, gy), normalize(vec2(-0.6, 0.8))), 0.0, 1.0);
  float body = smoothstep(0.55, 0.95, tx.g);
  float light = clamp(shade * (1.0 - 0.3 * body) + 0.1, 0.0, 1.0);
  float x = clamp((vUv.x - inkU.x) / max(1e-4, inkU.y - inkU.x), 0.0, 1.0);
  float y = clamp((vUv.y - inkV.x) / max(1e-4, inkV.y - inkV.x), 0.0, 1.0);
  float u = y * freq;
  float li = floor(u);
  float lag = hash11(li * 7.31) * 0.35;
  float vis = step(x, reveal * 1.35 - lag);
  float visR = step(x, reveal * 1.05) * step(1e-4, reveal);
  float lines = hatch(u, mix(0.3, 0.85, light)) * vis;
  float rim = m * (1.0 - smoothstep(0.56, 0.7, tx.g)) * visR;
  float cov = clamp(max(lines * m, rim), 0.0, 1.0);
  vec3 c = col * cov * (1.0 + glow) + col * ghost * m;
  float a = max(cov, ghost * m);
  fragColor = vec4(c, a) * opacity;
}`;

export class GlyphPlane {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  /** World width of the ink box. */
  w: number;
  constructor(ch: string, family: string, em: number, px = 420) {
    const P = px * SCALE;
    const cv = document.createElement("canvas");
    const c0 = cv.getContext("2d")!;
    c0.font = font(family, P);
    const m = c0.measureText(ch);
    const asc = m.actualBoundingBoxAscent,
      desc = Math.max(0, m.actualBoundingBoxDescent);
    const inkL = -m.actualBoundingBoxLeft,
      inkR = m.actualBoundingBoxRight;
    const blur = Math.round(P * 0.05);
    const pad = Math.ceil(blur * 3 + P * 0.04);
    const Wc = Math.ceil(inkR - inkL + pad * 2),
      Hc = Math.ceil(asc + desc + pad * 2);
    cv.width = Wc;
    cv.height = Hc;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#000";
    c.fillRect(0, 0, Wc, Hc);
    c.font = font(family, P);
    c.textBaseline = "alphabetic";
    const bx = pad - inkL,
      by = pad + asc;
    c.globalCompositeOperation = "lighter";
    c.filter = `blur(${blur}px)`;
    c.fillStyle = "#0f0";
    c.fillText(ch, bx, by);
    c.filter = "none";
    c.fillStyle = "#f00";
    c.fillText(ch, bx, by);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    const s = em / P;
    this.w = (inkR - inkL) * s;
    const gw = Wc * s,
      gh = Hc * s;
    const geo = new THREE.PlaneGeometry(gw, gh);
    // anchor: horizontal ink centre, baseline
    geo.translate(gw / 2 - (pad + (inkR - inkL) / 2) * s, -(gh / 2 - by * s), 0);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        map: { value: tex },
        texel: { value: new THREE.Vector2(1 / Wc, 1 / Hc) },
        inkU: { value: new THREE.Vector2(pad / Wc, (Wc - pad) / Wc) },
        inkV: { value: new THREE.Vector2((Hc - by - desc) / Hc, (Hc - by + asc) / Hc) },
        reveal: { value: 0 },
        freq: { value: 34 },
        opacity: { value: 1 },
        glow: { value: 0 },
        ghost: { value: 0 },
        col: { value: new THREE.Vector3(1, 1, 1) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  get u() {
    return this.mat.uniforms;
  }
}
