// m04 「黒い窓に 夜が跳ねる」 — the night bounces inside a black window.
// The WINDOW (a black terminal slab with an engraved bezel and three title-bar dots) floats in space
// above a far grid; the camera dollies toward it. On each character of 黒い窓に a line of code types
// into the terminal. On 夜 the MOON (an engraved bone sphere) appears inside the window; from が it
// drops and bounces on the window's floor exactly on 跳 / ね / る (squash on contact, stretch in
// flight), leaving an orange arc trail. 跳ねる is cut in engraved 3D type below the window, each
// glyph hopping on its own syllable. No beat-driven motion.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, type TextLayout } from "../engine/type";
import type { Line } from "../engine/lyrics";
import { clamp, ease, hash, keys, lerp, prog, pulse, smoothstep } from "../engine/util";
import { GridWorld, Rig, syncSphere } from "./m02-kit";
import { makeGlyphWord, type GlyphWord } from "./m02-glyph";
import { INNER, WIN, makeWindow, type TermWindow } from "./m04-window";

const FLOOR = INNER.iy0 + WIN.moonR; // moon centre height at contact (window-local)

export default class M04 extends Scene {
  rig = new Rig(50);
  world = new GridWorld();
  win!: TermWindow;
  scene3 = new THREE.Scene();
  text3 = new THREE.Scene();
  L3 = new LineBatch(6000, { screen2D: false, depthTest: true, blend: "add" });
  ui = new Layer2D();
  line!: Line;
  key!: GlyphWord;
  keyT: number[] = [];
  headT: number[] = [];
  head0!: TextLayout;
  head1!: TextLayout;
  tYoru = 0;
  tGa = 0;
  contacts: number[] = [];
  private v = new THREE.Vector3();

  override async init() {
    const ly = this.ctx.lyrics;
    this.line = ly.get("黒い窓に");
    const w0 = this.line.words[0]!,
      w1 = this.line.words[1]!;
    const s0 = w0.syl ?? [[w0.start, w0.end]];
    const s1 = w1.syl ?? [[w1.start, w1.end]];
    this.headT = [...s0.map((s) => s[0]), ...s1.slice(0, 2).map((s) => s[0])];
    // 夜が跳ねる: 夜 が | 跳 ね る
    this.tYoru = s1[0]![0];
    this.tGa = s1[Math.min(1, s1.length - 1)]![0];
    this.keyT = s1.slice(2).map((s) => s[0]);
    this.contacts = this.keyT.slice(0, 3);
    while (this.contacts.length < 3) this.contacts.push(this.contacts[this.contacts.length - 1]! + 0.3);
    this.win = makeWindow();
    this.scene3.add(this.win.group);
    const keyWord = w1.w.slice(2); // 跳ねる
    this.key = makeGlyphWord(keyWord, F.jp(900), 1.25, LIN.bone, 30);
    this.text3.add(this.key.group);
    this.head0 = layout(w0.w, F.jp(900), 78);
    this.head1 = layout(w1.w.slice(0, 2), F.jp(900), 104);
  }

  // ---------------------------------------------------------------- the moon's path (window-local)
  private moonAt(t: number) {
    const [c1, c2, c3] = this.contacts as [number, number, number];
    const T1 = this.ctx.end;
    const apex = INNER.iy1 - WIN.moonR - 0.25;
    if (t < this.tGa) {
      const k = prog(t, this.tYoru, this.tYoru + 0.3);
      return { x: -0.85, y: apex - 0.25 + 0.25 * ease.outCubic(k), s: ease.outBack(k) };
    }
    if (t < c1) {
      const s = prog(t, this.tGa, c1);
      return { x: lerp(-0.85, -0.5, s), y: lerp(apex, FLOOR, s * s), s: 1 };
    }
    const arc = (a: number, b: number, H: number, x0: number, x1: number) => {
      const s = (t - a) / (b - a);
      return { x: lerp(x0, x1, s), y: FLOOR + H * 4 * s * (1 - s), s: 1 };
    };
    if (t < c2) return arc(c1, c2, 1.35, -0.5, 0.12);
    if (t < c3) return arc(c2, c3, 1.9, 0.12, 0.78);
    // last hop: rising toward its apex as the scene ends
    const span = 2 * Math.max(0.3, T1 - c3) * 1.05;
    const s = (t - c3) / span;
    return { x: lerp(0.78, 1.5, s), y: FLOOR + 2.3 * 4 * s * (1 - s), s: 1 };
  }

  private camAt(t: number) {
    const T0 = this.ctx.start,
      T1 = this.ctx.end;
    const k = ease.inOutQuad(prog(t, T0, T1));
    const z = lerp(15.0, 10.0, ease.outQuad(prog(t, T0, T1)));
    this.rig.look(lerp(1.6, 0.25, k), lerp(1.2, 0.1, k), z, 0, lerp(-0.3, -0.62, k), 0, lerp(0.03, 0.0, k), 50);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const T0 = this.ctx.start,
      T1 = this.ctx.end;
    this.camAt(t);
    const cam = this.rig.cam;
    this.world.render(renderer, out, cam, { floorY: -6, fog: 0.035, grid: 0.8, focus: [0, 0, 0.6], haze: 1.4 });

    // ---- window: floats, slowly turning to face us
    const g = this.win.group;
    const p = prog(t, T0, T1);
    g.rotation.set(0.05 - 0.04 * p, lerp(0.42, 0.1, ease.outQuad(p)), 0.02 * Math.sin(t * 0.9));
    g.position.set(0, 0.06 * Math.sin(t * 1.3), 0);
    const mu = this.win.mat.uniforms;
    (mu.uCam!.value as THREE.Vector3).copy(cam.position);
    mu.uFogStart!.value = 14;

    // ---- moon (squash on contact, stretch in flight)
    const moon = this.win.moon;
    const m = this.moonAt(t);
    const vis = t >= this.tYoru - 0.01 && m.s > 0.001;
    moon.visible = vis;
    let sx = 1,
      sy = 1;
    if (vis && t >= this.tGa) {
      const dtv = 1 / 240;
      const vy = (this.moonAt(t + dtv).y - this.moonAt(t - dtv).y) / (2 * dtv);
      const st = 0.16 * clamp(Math.abs(vy) / 9);
      sy = 1 + st;
      sx = 1 / Math.sqrt(sy);
      let sq = 0;
      for (const c of this.contacts) sq = Math.max(sq, t >= c ? 0.38 * Math.pow(0.5, (t - c) / 0.045) : 0);
      sy *= 1 - sq;
      sx *= 1 + sq * 0.55;
    }
    const R = WIN.moonR * m.s;
    moon.scale.set(R * sx, R * sy, R * sx);
    moon.position.set(m.x, m.y - WIN.moonR * (1 - sy) * (m.y < FLOOR + 0.05 ? 1 : 0), 0);
    g.updateMatrixWorld(true);
    syncSphere(moon, cam);
    (moon.material as THREE.RawShaderMaterial).uniforms.uGlow!.value = 0.6 * pulse(t, this.tYoru, 0.15);
    for (const d of this.win.dots) syncSphere(d, cam);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.scene3, cam);

    // ---- terminal text, moon trail, contact ticks (window-local -> world)
    const lb = this.L3;
    lb.clear();
    this.drawTerminal(lb, t);
    this.drawTrail(lb, t);
    lb.render(renderer, out, cam);

    // ---- key word 跳ねる: engraved 3D type under the window, each glyph hopping on its syllable
    this.rig.placeOnScreen(this.key.group, W / 2, 1505, 10.0, -0.16, -0.08);
    this.key.glyphs.forEach((gp, i) => {
      const s0 = this.keyT[i] ?? this.tGa;
      gp.u.reveal!.value = ease.outCubic(prog(t, s0 - 0.02, s0 + 0.12));
      gp.u.glow!.value = 0.55 * pulse(t, s0, 0.1);
      gp.u.ghost!.value = 0.03 * smoothstep(s0 - 0.35, s0, t) * (1 - smoothstep(s0, s0 + 0.25, t));
      const hk = prog(t, s0, s0 + 0.26);
      gp.mesh.position.y = hk > 0 && hk < 1 ? 0.42 * Math.sin(Math.PI * hk) : 0;
      const sq = t >= s0 ? 0.14 * pulse(t, s0 + 0.26, 0.05) : 0;
      gp.mesh.scale.set(1 + sq, 1 - sq, 1);
    });
    this.text3.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.render(this.text3, cam);

    const ui = this.ui;
    ui.clear();
    this.drawUI(ui.ctx, t);
    this.ctx.comp.draw(renderer, ui.upload(), out);
    return { bloom: 0.45, bloomThreshold: 1.0, vignette: 0.55, grain: 0.05, ca: 0.5 };
  }

  private toWorld(x: number, y: number, z: number) {
    return this.v.set(x, y, z).applyMatrix4(this.win.group.matrixWorld).clone();
  }

  private drawTerminal(lb: LineBatch, t: number) {
    const bone = LIN.bone,
      sig = LIN.signal;
    const z = INNER.panelZ;
    const x0 = -INNER.ix + 0.18,
      y0 = INNER.iy1 - 0.28,
      dy = 0.2;
    const typedT = this.headT.slice(0, 4);
    const n0 = 3;
    let last: THREE.Vector3 | null = null;
    for (let r = 0; r < n0 + typedT.length; r++) {
      const te = r >= n0 ? typedT[r - n0]! : -1;
      if (te >= 0 && t < te) break;
      const k = te >= 0 ? ease.outCubic(prog(t, te, te + 0.18)) : 1;
      const len = (0.8 + 1.6 * hash(r, 41)) * k;
      let x = x0 + (r >= n0 ? 0.22 : 0);
      const end = x + len;
      const fresh = te >= 0 && t - te < 0.3;
      const I = fresh ? 1.0 : r >= n0 ? 0.7 : 0.35;
      // prompt mark
      if (r >= n0) {
        const a = this.toWorld(x0, y0 - r * dy, z),
          b = this.toWorld(x0 + 0.1, y0 - r * dy, z);
        lb.seg(a.x, a.y, a.z, b.x, b.y, b.z, 3, sig[0] * 1.3, sig[1] * 1.3, sig[2] * 1.3, 1);
      }
      for (let j = 0; j < 4 && x < end; j++) {
        const xe = Math.min(end, x + 0.2 + 0.45 * hash(r, j, 43));
        const a = this.toWorld(x, y0 - r * dy, z),
          b = this.toWorld(xe, y0 - r * dy, z);
        lb.seg(a.x, a.y, a.z, b.x, b.y, b.z, 3.2, bone[0] * I, bone[1] * I, bone[2] * I, 1);
        x = xe + 0.1;
      }
      last = this.toWorld(Math.min(end, x) + 0.05, y0 - r * dy, z);
    }
    if (last && Math.floor(t * 3.4) % 2 === 0) {
      lb.seg(last.x, last.y, last.z, last.x + 0.07, last.y, last.z, 10, sig[0] * 1.3, sig[1] * 1.3, sig[2] * 1.3, 1);
    }
  }

  private drawTrail(lb: LineBatch, t: number) {
    if (t < this.tGa) return;
    const sig = LIN.signal,
      bone = LIN.bone;
    const len = 0.75;
    const N = 60;
    const ta = Math.max(this.tGa, t - len);
    let prev = this.moonAt(ta);
    for (let i = 1; i <= N; i++) {
      const tt = lerp(ta, t, i / N);
      const q = this.moonAt(tt);
      const age = (t - tt) / len;
      const al = Math.pow(1 - age, 1.6);
      const a = this.toWorld(prev.x, prev.y, 0),
        b = this.toWorld(q.x, q.y, 0);
      const I = 1.8;
      lb.seg(a.x, a.y, a.z, b.x, b.y, b.z, 1.2 + 2.6 * (1 - age), sig[0] * I, sig[1] * I, sig[2] * I, al);
      prev = q;
    }
    // contact ticks on the window floor
    for (const c of this.contacts) {
      const k = prog(t, c, c + 0.35);
      if (k <= 0 || k >= 1) continue;
      const x = this.moonAt(c).x;
      const w = 0.25 + 0.6 * ease.outCubic(k);
      const a = this.toWorld(x - w, INNER.iy0 + 0.01, 0.1),
        b = this.toWorld(x + w, INNER.iy0 + 0.01, 0.1);
      lb.seg(a.x, a.y, a.z, b.x, b.y, b.z, 2, bone[0], bone[1], bone[2], 1 - k);
    }
  }

  private drawUI(c: CanvasRenderingContext2D, t: number) {
    // title-bar label (projected onto the slab)
    const g = this.win.group;
    const tp = this.v.set(0.35, WIN.h / 2 - WIN.bar / 2, WIN.d / 2 + 0.01).applyMatrix4(g.matrixWorld);
    const s = this.rig.project(tp.x, tp.y, tp.z);
    if (s) {
      const sc = clamp(this.rig.pxPerUnit(s.depth) / 190, 0.5, 1.2);
      c.save();
      c.font = font(F.mono(400), 22 * sc);
      c.fillStyle = rgba("ash", 0.95);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("~/yoru — zsh", s.x, s.y);
      c.restore();
    }
    // header: 黒い窓に (smaller) + 夜が, lit character by character
    const gap = 26;
    const wTot = this.head0.width + gap + this.head1.width;
    const x0 = W / 2 - wTot / 2,
      y = 330;
    c.save();
    c.textBaseline = "alphabetic";
    const draw = (L: TextLayout, ox: number, off: number) => {
      c.font = font(F.jp(900), L.size);
      L.glyphs.forEach((gl, i) => {
        const t0 = this.headT[off + i] ?? Infinity;
        const on = t >= t0;
        const k = on ? ease.outCubic(prog(t, t0, t0 + 0.12)) : 0;
        c.fillStyle = on ? rgba("bone", 0.95) : rgba("graphite", 0.28);
        c.fillText(gl.ch, ox + gl.x, y + 18 * (1 - k) * (on ? 1 : 0));
      });
    };
    draw(this.head0, x0, 0);
    draw(this.head1, x0 + this.head0.width + gap, 4);
    c.fillStyle = rgba("graphite", 0.9);
    c.fillRect(W / 2 - 60, y + 34, 120, 1.5);
    c.font = font(F.mono(400), 22);
    c.fillStyle = rgba("ash", 0.9);
    c.textAlign = "center";
    const n = this.contacts.filter((x) => t >= x).length;
    const hud = `moon.y ${this.moonAt(t).y.toFixed(2).padStart(5, " ")}  ·  bounce ${n}/3`;
    c.fillText(t >= this.tYoru ? hud : "tty  ·  dark mode", W / 2, y + 76);
    c.restore();
  }
}
