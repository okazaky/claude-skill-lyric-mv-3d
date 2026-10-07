// Shared kit for m05 / m07 / m09 (the chorus plates of 「夜をほどくコード」).
// - EGlyph: one display glyph as a real extruded 3D object. The face is a plane whose canvas texture holds the
//   glyph mask (R) and a blurred copy used as relief height (G); the face is lit from the upper left and drawn as
//   engraving (horizontal hatch lines whose weight follows the light + a solid inner rim), like the AIと私 title.
//   The extrusion walls are voxelised from the same mask and hatched along the depth (contour lines that echo the
//   outline), so the letter reads as a cut block when the camera is off axis.
//   `reveal` (0..1) cuts the face lines left to right, each line with its own lag (a burin).
// - TextRig: a text-only three.js scene + camera at a fixed distance, with px <-> world helpers for the
//   1080x1920 vertical frame, so type can be laid out in screen px but still be 3D.
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";
import { font, layout } from "../engine/type";
import { SCALE } from "../engine/scale";
import { W, H } from "../engine/gl";

const FACE_VERT = /* glsl */ `precision highp float;
in vec3 position; in vec2 uv; uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FACE_FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec2 vUv; out vec4 fragColor;
uniform sampler2D map; uniform vec2 texel; uniform vec2 inkU; uniform vec2 inkV;
uniform float reveal, freq, opacity, glow, hot, plate;
uniform vec3 col, hotCol;
void main() {
  vec4 tx = texture(map, vUv);
  float m = tx.r;
  float edgeA = smoothstep(0.3, 0.7, m);
  if (edgeA < 0.01) discard;
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
  if (visR < 0.5) discard;
  float lines = hatch(u, mix(0.3, 0.85, light)) * vis;
  float rim = 1.0 - smoothstep(0.56, 0.7, tx.g);
  float cov = clamp(max(lines, rim), 0.0, 1.0);
  vec3 c = C_INK2 * plate + col * cov * (1.0 + glow) + hotCol * hot * cov;
  fragColor = vec4(c, 1.0) * edgeA * opacity;
}`;

const WALL_VERT = /* glsl */ `precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix; uniform mat4 modelMatrix;
out vec3 vP; out vec3 vN;
void main() { vP = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const WALL_FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec3 vP; in vec3 vN; out vec4 fragColor;
uniform vec3 col; uniform float opacity, depth, revealX, glow;
void main() {
  if (vP.x > revealX) discard;
  vec3 n = normalize(vN);
  float lamb = sat(dot(n, normalize(vec3(-0.5, 0.7, 0.6))));
  float z = -vP.z / depth;
  float h = hatch(z * 7.0, 0.22 + 0.5 * lamb);
  float lip = pxLine(-vP.z / max(fwidth(vP.z), 1e-5), 0.6, 1.6);
  vec3 c = C_INK2 * 0.9 + col * ((0.05 + 0.32 * lamb) * (0.35 + 0.65 * h) + 0.5 * lip) * (1.0 + 0.5 * glow);
  c *= mix(1.0, 0.55, z);
  fragColor = vec4(c, 1.0) * opacity;
}`;

const premul = {
  transparent: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

export class EGlyph {
  group = new THREE.Group();
  face: THREE.Mesh;
  walls: THREE.Mesh;
  fmat: THREE.RawShaderMaterial;
  wmat: THREE.RawShaderMaterial;
  /** ink box in glyph-local world units (x centred on 0, baseline y = 0) */
  inkW: number;
  inkH: number;
  /** centre x inside the parent word */
  x = 0;
  private _reveal = 0;

  constructor(ch: string, family: string, em: number, depth: number, px = 300) {
    const P = Math.round(px * SCALE);
    const cv = document.createElement("canvas");
    const c0 = cv.getContext("2d")!;
    c0.font = font(family, P);
    const mt = c0.measureText(ch);
    const asc = mt.actualBoundingBoxAscent,
      desc = Math.max(0, mt.actualBoundingBoxDescent);
    const inkL = -mt.actualBoundingBoxLeft,
      inkR = mt.actualBoundingBoxRight;
    const blur = Math.round(P * 0.05);
    const pad = Math.ceil(blur * 3 + P * 0.04);
    const Wc = Math.ceil(inkR - inkL + pad * 2),
      Hc = Math.ceil(asc + desc + pad * 2);
    cv.width = Wc;
    cv.height = Hc;
    const c = cv.getContext("2d", { willReadFrequently: true })!;
    const bx = pad - inkL,
      by = pad + asc;
    // mask only first: voxel walls are read from this
    c.fillStyle = "#000";
    c.fillRect(0, 0, Wc, Hc);
    c.font = font(family, P);
    c.textBaseline = "alphabetic";
    c.fillStyle = "#fff";
    c.fillText(ch, bx, by);
    const data = c.getImageData(0, 0, Wc, Hc).data;
    // then the texture: R = mask, G = blurred relief
    c.fillStyle = "#000";
    c.fillRect(0, 0, Wc, Hc);
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
    this.inkW = (inkR - inkL) * s;
    this.inkH = (asc + desc) * s;
    const ox = pad + (inkR - inkL) / 2; // canvas px of local x = 0
    const gw = Wc * s,
      gh = Hc * s;
    const geo = new THREE.PlaneGeometry(gw, gh);
    geo.translate(gw / 2 - ox * s, -(gh / 2 - by * s), 0);
    this.fmat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FACE_VERT,
      fragmentShader: FACE_FRAG,
      uniforms: {
        map: { value: tex },
        texel: { value: new THREE.Vector2(1 / Wc, 1 / Hc) },
        inkU: { value: new THREE.Vector2(pad / Wc, (Wc - pad) / Wc) },
        inkV: { value: new THREE.Vector2((Hc - by - desc) / Hc, (Hc - by + asc) / Hc) },
        reveal: { value: 0 },
        freq: { value: 34 },
        opacity: { value: 1 },
        glow: { value: 0 },
        hot: { value: 0 },
        plate: { value: 0.9 },
        col: { value: new THREE.Vector3(1, 1, 1) },
        hotCol: { value: new THREE.Vector3(1.6, 0.35, 0.07) },
      },
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      ...premul,
    });
    this.face = new THREE.Mesh(geo, this.fmat);
    this.face.frustumCulled = false;

    // voxel walls: only cell sides whose neighbour is empty
    const step = Math.max(2, Math.round(P / 120));
    const cols = Math.floor(Wc / step),
      rows = Math.floor(Hc / step);
    const occ = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const pxx = Math.floor(i * step + step / 2),
          pyy = Math.floor(j * step + step / 2);
        occ[j * cols + i] = data[(pyy * Wc + pxx) * 4]! > 127 ? 1 : 0;
      }
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : occ[j * cols + i]!);
    const pos: number[] = [];
    const nor: number[] = [];
    const zf = -0.002 * em,
      zb = -depth;
    const quad = (a: number[], b: number[], cc: number[], d: number[], n: number[]) => {
      for (const v of [a, b, cc, a, cc, d]) {
        pos.push(v[0]!, v[1]!, v[2]!);
        nor.push(n[0]!, n[1]!, n[2]!);
      }
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        if (!at(i, j)) continue;
        const x0 = (i * step - ox) * s,
          x1 = ((i + 1) * step - ox) * s;
        const y1 = -(j * step - by) * s,
          y0 = -((j + 1) * step - by) * s;
        if (!at(i - 1, j)) quad([x0, y0, zb], [x0, y0, zf], [x0, y1, zf], [x0, y1, zb], [-1, 0, 0]);
        if (!at(i + 1, j)) quad([x1, y0, zf], [x1, y0, zb], [x1, y1, zb], [x1, y1, zf], [1, 0, 0]);
        if (!at(i, j - 1)) quad([x0, y1, zf], [x1, y1, zf], [x1, y1, zb], [x0, y1, zb], [0, 1, 0]);
        if (!at(i, j + 1)) quad([x0, y0, zb], [x1, y0, zb], [x1, y0, zf], [x0, y0, zf], [0, -1, 0]);
      }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    this.wmat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: WALL_VERT,
      fragmentShader: WALL_FRAG,
      uniforms: {
        col: { value: new THREE.Vector3(1, 1, 1) },
        opacity: { value: 1 },
        depth: { value: depth },
        revealX: { value: -1e3 },
        glow: { value: 0 },
      },
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      ...premul,
    });
    this.walls = new THREE.Mesh(wg, this.wmat);
    this.walls.frustumCulled = false;
    this.group.add(this.walls, this.face);
  }

  get fu() {
    return this.fmat.uniforms;
  }
  setCol(rgb: readonly number[], k = 1) {
    (this.fu.col!.value as THREE.Vector3).set(rgb[0]! * k, rgb[1]! * k, rgb[2]! * k);
    (this.wmat.uniforms.col!.value as THREE.Vector3).set(rgb[0]! * k, rgb[1]! * k, rgb[2]! * k);
  }
  set reveal(r: number) {
    this._reveal = r;
    this.fu.reveal!.value = r;
    this.wmat.uniforms.revealX!.value = r <= 0 ? -1e3 : -this.inkW / 2 + this.inkW * Math.min(1.05, r * 1.05) + 1e-4;
    this.group.visible = r > 0;
  }
  get reveal() {
    return this._reveal;
  }
  set opacity(o: number) {
    this.fu.opacity!.value = o;
    this.wmat.uniforms.opacity!.value = o;
  }
  set glow(g: number) {
    this.fu.glow!.value = g;
    this.wmat.uniforms.glow!.value = g;
  }
}

/** A word of EGlyphs laid out with the font's kerning; group origin = left edge on the baseline. */
export class EWord {
  group = new THREE.Group();
  glyphs: EGlyph[] = [];
  width: number;
  constructor(public text: string, family: string, em: number, depth: number, px = 300) {
    const lay = layout(text, family, 100);
    const s = em / 100;
    this.width = lay.width * s;
    for (const g of lay.glyphs) {
      if (g.ch === " ") continue;
      const eg = new EGlyph(g.ch, family, em, depth, px);
      eg.x = (g.x + g.w / 2) * s;
      eg.group.position.x = eg.x;
      this.group.add(eg.group);
      this.glyphs.push(eg);
    }
  }
  setCol(rgb: readonly number[], k = 1) {
    for (const g of this.glyphs) g.setCol(rgb, k);
  }
  set reveal(r: number) {
    for (const g of this.glyphs) g.reveal = r;
  }
  set opacity(o: number) {
    for (const g of this.glyphs) g.opacity = o;
  }
}

/** Text-only 3D scene, camera at distance D looking at the origin; type laid out in screen px at z = 0. */
export class TextRig {
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  readonly D: number;
  /** px per world unit at z = 0 */
  readonly U: number;
  constructor(fov = 34, D = 12) {
    this.D = D;
    this.cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 200);
    this.U = H / (2 * D * Math.tan((fov * Math.PI) / 360));
    this.look(0, 0);
  }
  /** world x/y at z = 0 for screen px */
  wx(px: number) {
    return (px - W / 2) / this.U;
  }
  wy(py: number) {
    return (H / 2 - py) / this.U;
  }
  /** em (world) for a glyph size in px */
  em(px: number) {
    return px / this.U;
  }
  look(ox: number, oy: number, roll = 0) {
    const c = this.cam;
    c.position.set(ox, oy, this.D);
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    c.lookAt(0, 0, 0);
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget) {
    this.scene.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
  }
}

/** Project a world point with a camera to logical screen px; null behind the camera. */
export function projectPx(cam: THREE.Camera, x: number, y: number, z: number, v = new THREE.Vector3()) {
  v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  const depth = -v.z;
  if (depth <= 0.01) return null;
  v.applyMatrix4(cam.projectionMatrix);
  return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, depth };
}

/** Hard-cut shot picker: cuts = shot start times (ascending, first = scene start). i = shot index, p = 0..1 through it, lt = seconds into it. */
export function pickShot(t: number, cuts: number[], end: number) {
  let i = 0;
  for (let k = 0; k < cuts.length; k++) if (t >= cuts[k]!) i = k;
  const a = cuts[i]!,
    b = i + 1 < cuts.length ? cuts[i + 1]! : end;
  return { i, lt: t - a, p: Math.min(1, Math.max(0, (t - a) / Math.max(1e-3, b - a))) };
}

/** Glyph-sync helper: [start, end] of the i-th sung character of a word. */
export function sylOf(w: { start: number; end: number; syl?: [number, number][] }, i: number): [number, number] {
  const s = w.syl ?? [[w.start, w.end]];
  return s[Math.min(i, s.length - 1)]!;
}
