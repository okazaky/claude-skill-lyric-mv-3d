// s07: the chat history as engraved panels in depth. One canvas atlas holds every panel's content
// (bubbles carry the earlier lyric lines: the conversation so far); a shader engraves the panel
// surface with hatching lit from the top left, and runs the white sweep that wipes it.
import * as THREE from "three";
import { F, font } from "../engine/type";
import { GLSL_COMMON } from "../engine/glsl/common";
import { SCALE } from "../engine/scale";
import { hash } from "../engine/util";

export const TW = 1024,
  TH = 640; // tile (logical px)
const COLS = 3;

const VERT = /* glsl */ `precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
out vec2 vUv; out float vDepth;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;

const FRAG = /* glsl */ `precision highp float;
precision highp int;
in vec2 vUv; in float vDepth; out vec4 fragColor;
${GLSL_COMMON}
uniform sampler2D atlas; uniform vec4 tile;
uniform float sweep;   // 0..1 position of the wipe edge (-1 = not started)
uniform float blank;   // 0..1: wiped area cools from bone paper to an empty panel
uniform float fogNear, fogFar, opacity, lightK, caret, aspect, isNew;
void main() {
  vec2 uv = vUv;
  vec4 tx = texture(atlas, tile.xy + vec2(uv.x, 1.0 - uv.y) * tile.zw);
  float ink = tx.r, bub = tx.g, acc = tx.b;
  // engraved surface: diagonal hatching, lines thicker toward the lit top-left corner
  vec2 q = vec2(uv.x * aspect, uv.y);
  float lit = sat(0.85 - 0.55 * length(q - vec2(0.0, 1.05)) / aspect) * lightK;
  float hs = hatch((q.x * 0.55 + q.y) * 95.0, 0.08 + 0.42 * lit);
  float hc = hatch((q.x - q.y * 0.5) * 120.0, sat(0.35 - lit) * 0.5); // cross hatch in the shade
  vec3 col = C_INK2 * 0.55 + C_BONE * (0.13 * hs + 0.05 * hc);
  // bubbles: horizontal engraving (bone lines), text crisp bone, accent signal
  float hb = hatch(q.y * 160.0, 0.35);
  col = mix(col, C_INK2 * 0.9 + C_BONE * 0.22 * hb, bub * 0.9);
  col = mix(col, C_BONE * 0.82, ink);
  col = mix(col, C_SIGNAL * 1.1, acc);
  // caret of the new chat's input field
  col = mix(col, C_SIGNAL * 1.4, caret * step(abs(uv.x - 0.105), 0.0035) * step(abs(uv.y - 0.135), 0.03) * isNew);
  // white sweep: everything left of the edge is wiped
  if (sweep > -0.5) {
    float e = sweep * 1.3 - 0.15;
    float wiped = 1.0 - smoothstep(e - 0.004, e + 0.004, uv.x + (uv.y - 0.5) * 0.12);
    vec3 paper = mix(C_BONE * 0.8, C_INK2 * 0.5 + C_BONE * 0.05 * hs, blank);
    col = mix(col, paper, wiped);
    float band = exp(-abs(uv.x + (uv.y - 0.5) * 0.12 - e) * 38.0) * (1.0 - blank);
    col += C_BONE * 1.1 * band;
  }
  // frame hairline
  vec2 d = min(uv, 1.0 - uv) * vec2(aspect, 1.0);
  col = mix(col, C_BONE * 0.75, 1.0 - smoothstep(0.0, 0.004, min(d.x, d.y)));
  float fog = smoothstep(fogNear, fogFar, vDepth);
  col = mix(col, C_INK, fog);
  fragColor = vec4(col * opacity, opacity);
}`;

export interface PanelLook {
  sweep: number;
  blank: number;
  opacity: number;
  fogNear: number;
  fogFar: number;
  lightK?: number;
  caret?: number;
}

/** Builds the atlas: `history` = [user, assistant] pairs (one panel each), plus one empty "new chat" tile last. */
export function buildAtlas(history: [string, string][]): {
  tex: THREE.CanvasTexture;
  tiles: number;
} {
  const n = history.length + 1;
  const rows = Math.ceil(n / COLS);
  const cv = document.createElement("canvas");
  cv.width = TW * COLS * SCALE;
  cv.height = TH * rows * SCALE;
  const c = cv.getContext("2d")!;
  c.scale(SCALE, SCALE);
  c.fillStyle = "#000";
  c.fillRect(0, 0, TW * COLS, TH * rows);
  c.globalCompositeOperation = "lighter";
  const R = "#f00",
    G = "#0f0",
    B = "#00f";
  const bubble = (x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fillStyle = G;
    c.fill();
  };
  for (let i = 0; i < n; i++) {
    const ox = (i % COLS) * TW,
      oy = Math.floor(i / COLS) * TH;
    c.save();
    c.translate(ox, oy);
    c.beginPath();
    c.rect(0, 0, TW, TH);
    c.clip();
    // header
    c.fillStyle = R;
    c.fillRect(0, 74, TW, 2);
    const isNew = i === n - 1;
    c.font = font(F.mono(500), 22);
    c.fillText(isNew ? "NEW SESSION" : `SESSION ${String(41 - i * 5).padStart(4, "0")}`, 40, 48);
    c.font = font(F.mono(400), 20);
    c.textAlign = "right";
    c.fillText(isNew ? "0 TOKENS" : `03:${String(12 + i * 7).padStart(2, "0")} AM`, TW - 40, 48);
    c.textAlign = "left";
    c.fillStyle = B;
    c.fillRect(TW - 250, 38, 10, 10);
    if (isNew) {
      // empty chat: a title, nothing above the input field
      c.fillStyle = R;
      c.font = font(F.jp(700), 40);
      c.fillText("新しいチャット", 40, 150);
      c.font = font(F.jp(400), 24);
      c.fillText("この会話は、以前の会話を覚えていません。", 40, 196);
      // input field
      c.fillRect(40, TH - 120, TW - 80, 2);
      c.fillRect(40, TH - 40, TW - 80, 2);
      c.fillRect(40, TH - 120, 2, 80);
      c.fillRect(TW - 42, TH - 120, 2, 80);
      c.font = font(F.mono(400), 18);
      c.fillText("MEMORY: NONE · CONTEXT: 0 / 200,000", 40, TH - 140);
    } else {
      const [u, a] = history[i]!;
      // user (right)
      c.font = font(F.jp(700), 40);
      const wu = Math.min(TW - 260, c.measureText(u).width);
      bubble(TW - 70 - wu - 40, 116, wu + 40, 78, 18);
      c.fillStyle = R;
      c.fillText(u, TW - 70 - wu - 20, 170, TW - 260);
      // assistant (left), wraps to two lines
      c.font = font(F.jp(400), 34);
      const lines = wrap(c, a, TW - 300);
      const bh = 40 + lines.length * 50;
      const wa = Math.max(...lines.map((l) => c.measureText(l).width));
      bubble(70, 232, wa + 44, bh, 18);
      c.fillStyle = R;
      lines.forEach((l, k) => c.fillText(l, 92, 282 + k * 50));
      // older messages fade into hatched bars (scrolled history)
      for (let k = 0; k < 3; k++) {
        const y = 232 + bh + 36 + k * 58;
        if (y > TH - 40) break;
        const w = 240 + hash(i, k, 3) * 460;
        const right = (k + i) % 2 === 0;
        bubble(right ? TW - 70 - w : 70, y, w, 40, 14);
      }
      c.fillStyle = B;
      c.font = font(F.mono(500), 18);
      c.fillText(`${(0.9 - i * 0.07).toFixed(2)}`, 70, 220);
    }
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false; // tile rows counted from the canvas top
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return { tex, tiles: n };
}

function wrap(c: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of s) {
    if (c.measureText(cur + ch).width > maxW && cur) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.slice(0, 2);
}

export class Panel {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  constructor(
    tex: THREE.Texture,
    tileIdx: number,
    tilesTotal: number,
    public w: number,
    public h: number,
    isNew = false,
  ) {
    const rows = Math.ceil(tilesTotal / COLS);
    const tx = (tileIdx % COLS) / COLS,
      ty = Math.floor(tileIdx / COLS) / rows;
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        atlas: { value: tex },
        tile: { value: new THREE.Vector4(tx, ty, 1 / COLS, 1 / rows) },
        sweep: { value: -1 },
        blank: { value: 0 },
        fogNear: { value: 10 },
        fogFar: { value: 60 },
        opacity: { value: 1 },
        lightK: { value: 1 },
        caret: { value: 0 },
        aspect: { value: w / h },
        isNew: { value: isNew ? 1 : 0 },
      },
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.frustumCulled = false;
  }
  set(o: PanelLook) {
    const u = this.mat.uniforms;
    u.sweep!.value = o.sweep;
    u.blank!.value = o.blank;
    u.opacity!.value = o.opacity;
    u.fogNear!.value = o.fogNear;
    u.fogFar!.value = o.fogFar;
    u.lightK!.value = o.lightK ?? 1;
    u.caret!.value = o.caret ?? 0;
  }
}
