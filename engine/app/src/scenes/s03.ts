// s03 「その優しさが 確率でも」 — probability. The camera glides low over an engraved landscape of
// token-probability bars (every row one next-token distribution). In the sampled row the
// candidates stand labelled (優しさ 0.41 / 計算 0.22 / 演技 0.12 …); 優しさ heats to signal orange as
// it is sung. On 確率 the camera tilts up from the bars to an engraved bell curve in the sky and
// 確率 lands huge, hatched like a plate. A ripple leaves the sampled bar on every beat.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W, H, clearRT, SCALE } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, measure, type TextLayout } from "../engine/type";
import { Lyrics, type Line, type Word } from "../engine/lyrics";
import {
  clamp,
  ease,
  keys,
  lerp,
  noise1,
  prog,
  pulse,
  frameIdx,
  hash,
  type Key,
} from "../engine/util";
import { sparkHead } from "./_motifs";
import {
  makeBars,
  barGeometry,
  barMaterial,
  CANDS,
  CHOSEN_ROW,
  HSCALE,
  COLS,
  ROWS,
} from "./s03-geo";

type P3 = { x: number; y: number; z: number };
type Proj = { x: number; y: number; s: number; w: number };

const SKY_Z = -78; // the bell curve's plane
const bell = (x: number) => 10 + 24 * Math.exp(-(x * x) / (2 * 11 * 11));

export default class S03 extends Scene {
  cam = new THREE.PerspectiveCamera(38, W / H, 0.05, 400);
  vp = new THREE.Matrix4();
  v4 = new THREE.Vector4();
  world = new THREE.Scene();
  mat = barMaterial();
  lines3 = new LineBatch(30000, { screen2D: false, depthTest: true, blend: "add" });
  glow = new LineBatch(800);
  text = new Layer2D();
  line!: Line;
  w0!: Word;
  w1!: Word; // その優しさが / 確率でも
  tYasa = 0;
  tKaku = 0;
  tDemo = 0;
  lay0!: TextLayout;
  kaku!: HTMLCanvasElement;
  kakuW = 0;
  kakuH = 0;
  kakuLay!: TextLayout;

  override init() {
    const ly = this.ctx.lyrics;
    this.line = ly.get("その優しさが");
    this.w0 = this.line.words[0]!;
    this.w1 = this.line.words[1]!;
    this.tYasa = this.w0.syl?.[2]?.[0] ?? this.w0.start;
    this.tKaku = this.w1.start;
    this.tDemo = this.w1.syl?.[2]?.[0] ?? this.w1.end - 0.6;
    const mesh = new THREE.Mesh(barGeometry(makeBars()), this.mat);
    mesh.frustumCulled = false;
    this.world.add(mesh);
    this.lay0 = layout(this.w0.w, F.jp(900), 112);
    this.kakuLay = layout("確率", F.jp(900), 360);
    this.buildKaku();
  }

  /** 確率 as an engraved plate: solid at the top, horizontal hatch thinning to hairlines at the bottom. */
  private buildKaku() {
    const S = SCALE * 1.5,
      size = 360;
    const w = Math.ceil(this.kakuLay.width + 40),
      h = Math.ceil(size * 1.3);
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(w * S);
    cv.height = Math.ceil(h * S);
    const c = cv.getContext("2d")!;
    c.scale(S, S);
    const base = size * 1.05;
    // stripes first, then keep them only inside the glyphs (destination-in)
    c.fillStyle = rgba("bone", 1);
    const top = base - size * 0.9,
      bot = base + size * 0.12,
      pitch = 7;
    for (let y = top; y < bot; y += pitch) {
      const k = clamp((y - top) / (bot - top));
      const th = lerp(pitch, 1.1, Math.pow(k, 0.8)); // solid → hairline
      c.fillRect(0, y, w, th);
    }
    c.globalCompositeOperation = "destination-in";
    c.font = font(F.jp(900), size);
    c.fillStyle = "#fff";
    c.textBaseline = "alphabetic";
    c.fillText("確率", 20, base);
    this.kaku = cv;
    this.kakuW = w;
    this.kakuH = h;
  }

  // ---------------------------------------------------------------- camera
  private camAt(t: number): { pos: P3; tgt: P3; fov: number; roll: number } {
    const T0 = this.ctx.start,
      T1 = this.ctx.end,
      ty = this.tYasa,
      tk = this.tKaku;
    const ga = this.w0.syl?.[5]?.[0] ?? tk - 0.4;
    const tilt = tk + 0.75;
    const K = (vals: number[], eases: ((x: number) => number)[] = []): number =>
      keys(t, [
        [T0, vals[0]!],
        [ty, vals[1]!, eases[0] ?? ease.inOutQuad],
        [ga, vals[2]!, eases[1] ?? ease.inOutQuad],
        [tk, vals[3]!, ease.inOutQuad],
        [tilt, vals[4]!, ease.outExpo],
        [T1, vals[5]!, ease.linear],
      ] as Key[]);
    const pos = {
      x: K([9, 7.5, 6.2, 5.6, 6.0, 6.5]),
      y: K([6.0, 7.4, 8.6, 9.2, 8.0, 9.0]),
      z: K([14, 4.0, -5.5, -7.5, -6.0, -10]),
    };
    const tgt = {
      x: K([1.0, 0.0, 0.0, 0.0, 10.5, 11]),
      y: K([1.5, 3.2, 5.2, 6.4, 21, 23]),
      z: K([-14, -22, -22, -22, -62, -68]),
    };
    const fov = K([40, 38, 34, 34, 46, 44]);
    const roll = K([0.06, 0.03, -0.02, -0.03, 0.0, 0.015]);
    return { pos, tgt, fov, roll };
  }
  private setCam(c0: { pos: P3; tgt: P3; fov: number; roll: number }, shake: [number, number]) {
    const c = this.cam;
    c.fov = c0.fov;
    c.updateProjectionMatrix();
    c.position.set(c0.pos.x, c0.pos.y, c0.pos.z);
    c.up.set(0, 1, 0);
    c.lookAt(c0.tgt.x + shake[0], c0.tgt.y + shake[1], c0.tgt.z);
    c.rotateZ(c0.roll);
    c.updateMatrixWorld(true);
    this.vp.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  }
  private proj(x: number, y: number, z: number): Proj | null {
    const v = this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    if (v.w <= 0.05) return null;
    const P11 = this.cam.projectionMatrix.elements[5]!;
    return {
      x: ((v.x / v.w) * 0.5 + 0.5) * W,
      y: (0.5 - (v.y / v.w) * 0.5) * H,
      s: (0.5 * H * P11) / v.w,
      w: v.w,
    };
  }

  // ---------------------------------------------------------------- render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const kick = f.a.kick;
    const slam = pulse(t, this.tKaku, 0.1);
    const shakeA = 0.08 * kick + 0.5 * slam;
    const shake: [number, number] = [shakeA * noise1(t * 37, 1), shakeA * noise1(t * 41, 2)];
    const cm = this.camAt(t);
    this.setCam(cm, shake);

    clearRT(renderer, out, LIN.ink);
    const u = this.mat.uniforms;
    (u.uCam!.value as THREE.Vector3).set(cm.pos.x, cm.pos.y, cm.pos.z);
    u.uRise!.value = prog(t, this.ctx.start - 0.1, this.ctx.start + 1.4, ease.outCubic);
    u.uWave!.value = f.beatPhase;
    u.uKick!.value = kick;
    u.uHot!.value =
      prog(t, this.tYasa, this.tYasa + 0.25, ease.outCubic) *
      (1 + 0.6 * pulse(t, this.tYasa, 0.15) + 0.25 * kick);
    u.uCandLit!.value = prog(t, this.tYasa - 0.5, this.tYasa);
    u.uTilt!.value = prog(t, this.tKaku, this.tKaku + 0.8, ease.outExpo);
    u.uTime!.value = t;
    u.uFogStart!.value = t > this.tKaku ? 22 : 12;
    u.uFogLen!.value = t > this.tKaku ? 40 : 20;
    renderer.setRenderTarget(out);
    renderer.render(this.world, this.cam);

    const L3 = this.lines3;
    L3.clear();
    this.drawGround(L3, t, f);
    this.drawSky(L3, t);
    L3.render(renderer, out, this.cam);

    const T = this.text;
    T.clear();
    const c = T.ctx;
    this.drawLabels(c, t);
    this.drawPanel(c, t);
    this.drawLyric(c, t);
    this.ctx.comp.draw(renderer, T.upload(), out);

    // the sampled bar's tip carries the spark
    this.glow.clear();
    const hTop = CANDS[0]![1] * HSCALE * (1 + 0.6 * (u.uTilt!.value as number));
    const tip = this.proj(0, hTop + 0.05, -CHOSEN_ROW);
    if (tip && t > this.tYasa)
      sparkHead(this.glow, tip.x, tip.y, t, clamp(tip.s / 60, 0.5, 1.3), 0.8 + 0.6 * kick);
    if (this.glow.count) this.glow.render(renderer, out);

    return {
      bloomThreshold: 0.9,
      bloomKnee: 0.3,
      bloom: 0.75,
      vignette: 0.5,
      ca: 1 + 2 * slam,
      flash: 0,
      // punch by scale, not by lifting the frame: a short zoom kick that settles over the tilt
      zoom: 1 + 0.012 * kick + 0.07 * slam + 0.03 * pulse(t, this.tKaku, 0.35),
    };
  }

  // ---------------------------------------------------------------- 3D lines
  private drawGround(L: LineBatch, t: number, f: Frame) {
    const g = LIN.bone,
      b = LIN.bone;
    const a = 0.17;
    for (let c = -COLS - 1; c <= COLS; c++) {
      const x = c + 0.5;
      for (let z = 4; z > -ROWS; z -= 2) L.seg(x, 0, z, x, 0, z - 2, 1, g[0], g[1], g[2], a);
    }
    for (let r = -4; r < ROWS; r++) {
      const z = -r - 0.5;
      const hot = r === CHOSEN_ROW || r === CHOSEN_ROW - 1 ? 1 : 0;
      for (let x = -COLS - 1.5; x < COLS + 0.5; x += 2) {
        const col = hot ? b : g;
        L.seg(x, 0, z, x + 2, 0, z, hot ? 1.3 : 1, col[0], col[1], col[2], hot ? 0.5 : a);
      }
    }
    // beat ripple ring on the ground around the sampled bar
    const R = f.beatPhase * 26,
      fade = 1 - f.beatPhase;
    const s = LIN.signal,
      N = 96;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2,
        a1 = ((i + 1) / N) * Math.PI * 2;
      L.seg(
        Math.cos(a0) * R,
        0.02,
        -CHOSEN_ROW + Math.sin(a0) * R,
        Math.cos(a1) * R,
        0.02,
        -CHOSEN_ROW + Math.sin(a1) * R,
        1.6,
        s[0],
        s[1],
        s[2],
        0.55 * fade * prog(t, this.ctx.start, this.tYasa),
      );
    }
  }

  /** The engraved bell curve in the sky: outline, parallel engraving strokes, vertical hatch fill. */
  private drawSky(L: LineBatch, t: number) {
    const rev = prog(t, this.tKaku - 0.3, this.tKaku + 1.0, ease.outCubic);
    if (rev <= 0) return;
    const b = LIN.bone,
      s = LIN.signal,
      z = SKY_Z;
    const X = 46 * rev;
    for (let k = 0; k < 9; k++) {
      const off = k * 0.45,
        al = k === 0 ? 0.9 : 0.32 * (1 - k / 9);
      let px = -X,
        py = bell(px) - off;
      for (let x = -X + 0.5; x <= X; x += 0.5) {
        const y = bell(x) - off;
        L.seg(px, py, z, x, y, z, k === 0 ? 2.2 : 1, b[0], b[1], b[2], al);
        px = x;
        py = y;
      }
    }
    // hatch under the curve: engraving lines, denser toward the mode
    for (let x = -X; x <= X; x += 0.6) {
      const y1 = bell(x) - 4.2,
        y0 = 8;
      if (y1 <= y0) continue;
      const dens = Math.exp(-(x * x) / (2 * 14 * 14));
      L.seg(x, y0, z, x, y1, z, 1, b[0], b[1], b[2], 0.1 + 0.22 * dens);
    }
    // the axis and the sampled point: the mode, in signal
    L.seg(-48, 8, z, 48, 8, z, 1.4, b[0], b[1], b[2], 0.6 * rev);
    const m = prog(t, this.tKaku + 0.2, this.tKaku + 0.9, ease.outExpo);
    L.seg(0, 8, z, 0, lerp(8, bell(0), m), z, 2.6, s[0] * 2, s[1] * 2, s[2] * 2, 1);
    for (let i = -8; i <= 8; i++) L.seg(i * 6, 8, z, i * 6, 7.2, z, 1, b[0], b[1], b[2], 0.5 * rev);
  }

  // ---------------------------------------------------------------- 2D
  private drawLabels(c: CanvasRenderingContext2D, t: number) {
    const vis =
      prog(t, this.tYasa - 0.45, this.tYasa - 0.1) *
      (1 - prog(t, this.tKaku + 0.2, this.tKaku + 0.6));
    if (vis <= 0) return;
    const tilt = this.mat.uniforms.uTilt!.value as number;
    CANDS.forEach(([tok, p, col], i) => {
      const h = p * HSCALE * (i === 0 ? 1 + 0.6 * tilt : 1);
      const q = this.proj(col, h + 0.15, -CHOSEN_ROW);
      if (!q) return;
      const appear = prog(
        t,
        this.tYasa - 0.45 + i * 0.06,
        this.tYasa - 0.2 + i * 0.06,
        ease.outExpo,
      );
      const flick = hash(i, frameIdx(t)) < 0.3 + 0.7 * appear ? 1 : 0.2;
      const a = vis * appear * flick;
      const lead = 46 + (i % 2) * 34;
      const chosen = i === 0 && t >= this.tYasa;
      c.save();
      c.globalAlpha = a;
      c.fillStyle = chosen ? rgba("signal", 1) : rgba("bone", 0.7);
      c.fillRect(q.x - 0.5, q.y - lead, 1, lead);
      c.fillRect(q.x - 4, q.y - 0.5, 8, 1);
      const fs = i === 0 ? 34 : 24;
      c.font = font(F.jp(i === 0 ? 900 : 700), fs);
      c.textBaseline = "alphabetic";
      c.fillStyle = chosen ? rgba("signal", 1) : rgba("bone", 0.92);
      c.fillText(tok, q.x + 8, q.y - lead + 4);
      const tw = measure(tok, F.jp(i === 0 ? 900 : 700), fs);
      c.font = font(F.mono(500), i === 0 ? 22 : 17);
      c.fillStyle = chosen ? rgba("signal", 1) : rgba("bone", 0.62 * (0.9));
      c.fillText(p.toFixed(2), q.x + 8 + tw + 10, q.y - lead + 4);
      c.restore();
    });
  }

  /** Small distribution readout, upper right (JP labels in Noto Sans JP, numbers in mono). */
  private drawPanel(c: CanvasRenderingContext2D, t: number) {
    const a =
      prog(t, this.ctx.start + 0.2, this.ctx.start + 0.6) *
      (1 - 0.6 * prog(t, this.tKaku, this.tKaku + 0.4));
    if (a <= 0) return;
    const x0 = W - 120 - 330,
      y0 = 132,
      rh = 30,
      pw = 330;
    const picked = t >= this.tYasa;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = rgba("ink", 0.78);
    c.fillRect(x0, y0, pw, 44 + CANDS.length * rh);
    c.fillStyle = rgba("bone", 0.4);
    c.fillRect(x0, y0, pw, 1);
    c.fillRect(x0, y0, 1, 44 + CANDS.length * rh);
    c.font = font(F.jp(400), 15);
    c.fillStyle = rgba("bone", 0.62 * (0.9));
    c.textBaseline = "alphabetic";
    c.fillText("p( 次の語 | 文脈 )", x0 + 12, y0 + 24);
    c.textAlign = "right";
    c.fillText(picked ? "採択" : "計算中…", x0 + pw - 12, y0 + 24);
    c.textAlign = "left";
    CANDS.forEach(([tok, p], i) => {
      const y = y0 + 44 + (i + 1) * rh - 8;
      const on = picked && i === 0;
      const built = prog(t, this.ctx.start + 0.3 + i * 0.08, this.tYasa - 0.1);
      const jit = picked
        ? 1
        : clamp(built + (hash(i, frameIdx(t)) - 0.5) * 0.6 * (1 - built), 0.05, 1.2);
      if (on) {
        c.fillStyle = rgba("signal", 0.16 + 0.4 * pulse(t, this.tYasa, 0.1));
        c.fillRect(x0 + 1, y - 21, pw - 1, rh - 2);
      }
      c.font = font(F.jp(on ? 700 : 400), 18);
      c.fillStyle = on ? rgba("signal", 1) : rgba("bone", 0.75);
      c.fillText(tok, x0 + 14, y);
      c.fillStyle = on ? rgba("signal", 1) : rgba("bone", 0.4);
      c.fillRect(x0 + 120, y - 12, ((130 * p) / CANDS[0]![1]) * jit, 8);
      c.font = font(F.mono(400), 15);
      c.fillStyle = on ? rgba("signal", 1) : rgba("bone", 0.62 * (0.85));
      c.textAlign = "right";
      c.fillText(p.toFixed(2), x0 + pw - 12, y);
      c.textAlign = "left";
    });
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba("bone", 0.62 * (0.7));
    c.fillText("T 0.7 · top-p 0.95 · seed 0x2A", x0, y0 + 44 + CANDS.length * rh + 26);
    c.restore();
  }

  /** その優しさが per sung character (優しさ in signal), then 確率 as an engraved plate, then でも. */
  private drawLyric(c: CanvasRenderingContext2D, t: number) {
    const w0 = this.w0,
      syl0 = w0.syl ?? [];
    const k = prog(t, this.tKaku - 0.05, this.tKaku + 0.45, ease.outExpo);
    const size = lerp(112, 64, k);
    const sc = size / 112;
    const x0 = lerp(120, 120, k),
      y0 = lerp(300, 196, k);
    c.save();
    c.textBaseline = "alphabetic";
    c.font = font(F.jp(900), size);
    for (const g of this.lay0.glyphs) {
      const s = syl0[g.i];
      const t0 = s ? s[0] : w0.start;
      const pre = prog(t, t0 - 0.4, t0);
      const sung = prog(t, t0, t0 + 0.08);
      const yasa = g.i >= 2 && g.i <= 4;
      const drop = (1 - ease.outExpo(clamp((t - t0) / 0.2))) * -14 * (t >= t0 ? 1 : 0);
      if (pre <= 0) continue;
      c.fillStyle =
        sung > 0
          ? yasa
            ? rgba("signal", 1)
            : rgba("bone", lerp(0.35, 1, sung) * lerp(1, 0.75, k))
          : rgba("bone", 0.28 * pre);
      c.fillText(g.ch, x0 + g.x * sc, y0 + drop);
    }
    // the sung word's wipe bar
    const p0 = Lyrics.wordProgress(w0, t);
    if (p0 > 0) {
      c.fillStyle = rgba("signal", 0.9 * (1 - 0.7 * k));
      c.fillRect(x0, y0 + 22 * sc, this.lay0.width * sc * p0, 4);
    }
    c.font = font(F.jp(400), 16);
    c.fillStyle = rgba("bone", 0.62 * (0.8 * (1 - k)));
    c.fillText("サンプル 07 ／ 優しさ  p = 0.41", x0, y0 + 60);
    c.restore();

    // 確率: lands on its syllables, anchored to the sky so it rides the tilt
    if (t < this.tKaku - 0.02) return;
    const syl1 = this.w1.syl ?? [];
    const anchor = this.proj(12, 21, SKY_Z);
    const ax = anchor ? anchor.x : W / 2,
      ay = anchor ? anchor.y : H / 2;
    const S = 1 + 0.25 * (1 - ease.outExpo(clamp((t - this.tKaku) / 0.35)));
    const dw = this.kakuW * S,
      dh = this.kakuH * S;
    const kx = clamp(ax - dw / 2, 100, W - 110 - dw - 18 - 270),
      ky = clamp(ay - dh * 0.62, 250, H - 160 - dh);
    // per character reveal: 確 on its start, 率 on its own
    const t率 = syl1[1]?.[0] ?? this.tKaku + 0.5;
    const split = 20 + (this.kakuLay.glyphs[1]?.x ?? this.kakuLay.width / 2);
    const a0 = prog(t, this.tKaku - 0.02, this.tKaku + 0.04);
    const a1 = prog(t, t率 - 0.02, t率 + 0.04);
    c.save();
    c.globalAlpha = a0;
    c.drawImage(
      this.kaku,
      0,
      0,
      (split * this.kaku.width) / this.kakuW,
      this.kaku.height,
      kx,
      ky,
      split * S,
      dh,
    );
    c.globalAlpha = Math.max(0.12, a1) * a0;
    c.drawImage(
      this.kaku,
      (split * this.kaku.width) / this.kakuW,
      0,
      this.kaku.width - (split * this.kaku.width) / this.kakuW,
      this.kaku.height,
      kx + split * S,
      ky,
      dw - split * S,
      dh,
    );
    c.restore();
    // でも: smaller, on the baseline after 確率
    const base = ky + 360 * 1.05 * S;
    const demo = "でも",
      fs = 132;
    const dl = layout(demo, F.jp(900), fs);
    c.save();
    c.font = font(F.jp(900), fs);
    c.textBaseline = "alphabetic";
    for (const g of dl.glyphs) {
      const s = syl1[2 + g.i];
      const t0 = s ? s[0] : this.tDemo;
      const pre = prog(t, t0 - 0.4, t0);
      if (pre <= 0) continue;
      const sung = prog(t, t0, t0 + 0.08);
      c.fillStyle = sung > 0 ? rgba("signal", 1) : rgba("bone", 0.25 * pre);
      c.fillText(g.ch, kx + dw + 18 + g.x, base);
    }
    c.font = font(F.jp(400), 18);
    c.fillStyle = rgba("bone", 0.62 * (0.8 * a0));
    c.fillText("最尤の語 ＝ 優しさ　／　本心 p = 0.04", kx + dw + 22, base + 50);
    c.restore();
  }
}
