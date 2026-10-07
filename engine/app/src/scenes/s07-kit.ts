// s07 helpers: a single glyph (or short string) on a plane in 3D, solid fill (no outline), with a
// grain dissolve; and the glyph's own ink as 3D points (for the particles it turns into).
import * as THREE from "three";
import { font, textPoints } from "../engine/type";
import { LIN } from "../engine/palette";
import { SCALE } from "../engine/scale";

export type RGB = [number, number, number];
export const lin = (k: keyof typeof LIN, s = 1): RGB => [
  LIN[k][0] * s,
  LIN[k][1] * s,
  LIN[k][2] * s,
];

const VERT = /* glsl */ `precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D map; uniform vec3 col; uniform float opacity;
uniform float dis;     // 0 = whole, 1 = gone
uniform float disDir;  // 0: peels left -> right, 1: dissolves bottom -> top
uniform float seed;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031 + seed * 0.013); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  float a = texture(map, vUv).r;
  if (dis > 0.0) {
    float along = disDir < 0.5 ? vUv.x : vUv.y;
    float n = h21(floor(vUv * 70.0));
    float th = along * 0.72 + n * 0.28;
    a *= 1.0 - smoothstep(th - 0.015, th + 0.015, dis * 1.05);
  }
  if (a <= 0.002) discard;
  fragColor = vec4(col * a, a) * opacity;
}`;

/** A string rendered once to a canvas texture, on a plane centred on its ink box (local XY, facing +Z). */
export class GlyphPlane {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  /** World width/height of the ink box; world units per canvas px. */
  w: number;
  h: number;
  s: number;
  /** Ink-box centre relative to the pen origin (canvas px, y up). */
  cx: number;
  cy: number;
  constructor(
    public text: string,
    public family: string,
    public px: number,
    emWorld: number,
  ) {
    const P = px * SCALE;
    const mc = document.createElement("canvas").getContext("2d")!;
    mc.font = font(family, P);
    const m = mc.measureText(text);
    const inkL = -m.actualBoundingBoxLeft,
      inkR = m.actualBoundingBoxRight;
    const asc = m.actualBoundingBoxAscent,
      desc = m.actualBoundingBoxDescent;
    const pad = Math.ceil(P * 0.06);
    const cw = Math.ceil(inkR - inkL + pad * 2),
      ch = Math.ceil(asc + desc + pad * 2);
    const cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#000";
    c.fillRect(0, 0, cw, ch);
    c.font = font(family, P);
    c.textBaseline = "alphabetic";
    c.fillStyle = "#fff";
    c.fillText(text, pad - inkL, pad + asc);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    this.s = emWorld / P;
    this.w = (inkR - inkL) * this.s;
    this.h = (asc + desc) * this.s;
    this.cx = (inkL + inkR) / 2 / SCALE;
    this.cy = (asc - desc) / 2 / SCALE;
    const geo = new THREE.PlaneGeometry(cw * this.s, ch * this.s);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        map: { value: tex },
        col: { value: new THREE.Vector3(...LIN.bone) },
        opacity: { value: 1 },
        dis: { value: 0 },
        disDir: { value: 0 },
        seed: { value: 0 },
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
  set(o: { col?: RGB; opacity?: number; dis?: number; disDir?: number; seed?: number }) {
    const u = this.mat.uniforms;
    if (o.col) (u.col!.value as THREE.Vector3).set(...o.col);
    if (o.opacity !== undefined) u.opacity!.value = o.opacity;
    if (o.dis !== undefined) u.dis!.value = o.dis;
    if (o.disDir !== undefined) u.disDir!.value = o.disDir;
    if (o.seed !== undefined) u.seed!.value = o.seed;
  }
  /**
   * The glyph's ink as points in the plane's local frame (world units, centred like the mesh), with
   * u = 0..1 position across the ink box (left -> right) and v = 0..1 (bottom -> top), matching the
   * dissolve field of the shader so particles leave exactly where the fill disappears.
   */
  points(step: number): { x: number; y: number; u: number; v: number }[] {
    const sLog = this.s * SCALE; // world per logical px
    const pts = textPoints(this.text, this.family, this.px, step, this.text.charCodeAt(0));
    const hw = this.w / 2,
      hh = this.h / 2;
    return pts.map((p) => {
      const x = (p.x - this.cx) * sLog,
        y = (-p.y - this.cy) * sLog;
      return {
        x,
        y,
        u: Math.min(1, Math.max(0, (x + hw) / (2 * hw))),
        v: Math.min(1, Math.max(0, (y + hh) / (2 * hh))),
      };
    });
  }
}
