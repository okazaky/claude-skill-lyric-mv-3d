// m03 「かたかた 肩ならべ」 — two laptops, shoulder to shoulder.
// Two engraved laptops stand on the night grid, a little apart. On each sung character of かたかた a
// key of the left one presses (K, T, K, T — ka/ta), heats orange for a moment, the kana rises off the
// key and a new line of code types onto its screen. On 肩 the two slide together until they touch
// (shoulder to shoulder); the right one types ka-na-ra-be, and 肩ならべ is cut in engraved 3D type
// above the screens. Camera: a continuous sideways truck along the pair, easing back to frame both.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, type TextLayout } from "../engine/type";
import type { Line } from "../engine/lyrics";
import { clamp, ease, hash, keys, lerp, prog, pulse, smoothstep } from "../engine/util";
import { GridWorld, Rig, boxMaterial } from "./m02-kit";
import { makeGlyphWord, type GlyphWord } from "./m02-glyph";
import { KB, makeLaptop, type Laptop } from "./m03-laptop";

interface Ev {
  t: number;
  ch: string; // sung kana
  lap: 0 | 1;
  key: string; // key legend
  slot: number;
}

const HALF = KB.baseW / 2;

export default class M03 extends Scene {
  rig = new Rig(52);
  world = new GridWorld();
  mat = boxMaterial(LIN.bone, 10);
  scene3 = new THREE.Scene();
  text3 = new THREE.Scene();
  L3 = new LineBatch(4000, { screen2D: false, depthTest: true, blend: "add" });
  ui = new Layer2D();
  laps: Laptop[] = [];
  line!: Line;
  evs: Ev[] = [];
  key!: GlyphWord;
  keyT: number[] = [];
  head!: TextLayout;
  headT: number[] = [];
  tKata = 0;
  private v = new THREE.Vector3();

  override async init() {
    const ly = this.ctx.lyrics;
    this.line = ly.get("かたかた");
    const w0 = this.line.words[0]!,
      w1 = this.line.words[1]!;
    const s0 = w0.syl ?? [[w0.start, w0.end]];
    const s1 = w1.syl ?? [[w1.start, w1.end]];
    this.headT = s0.map((s) => s[0]);
    this.keyT = s1.map((s) => s[0]);
    this.tKata = w1.start;
    const keysA = ["K", "T", "K", "T"];
    const keysB = ["K", "N", "R", "B"];
    const slotA: Record<string, number> = { K: 0, T: 1 };
    const slotB: Record<string, number> = { K: 2, N: 3, R: 4, B: 5 };
    [...w0.w].forEach((ch, i) => {
      const k = keysA[i % 4]!;
      this.evs.push({ t: this.headT[Math.min(i, this.headT.length - 1)]!, ch, lap: 0, key: k, slot: slotA[k]! });
    });
    [...w1.w].forEach((ch, i) => {
      const k = keysB[i % 4]!;
      this.evs.push({ t: this.keyT[Math.min(i, this.keyT.length - 1)]!, ch, lap: 1, key: k, slot: slotB[k]! });
    });
    this.laps = [makeLaptop(this.mat, slotA), makeLaptop(this.mat, slotB)];
    for (const l of this.laps) this.scene3.add(l.group);
    this.mat.uniforms.uPressDepth!.value = 0.055;

    this.key = makeGlyphWord(w1.w, F.jp(900), 0.95, LIN.bone, 26);
    this.text3.add(this.key.group);
    this.head = layout(w0.w, F.jp(900), 120);
  }

  /** half gap between the two laptops (centre to inner edge) */
  private gap(t: number) {
    return keys(t, [
      [this.ctx.start, 0.85],
      [this.tKata - 0.02, 0.62],
      [this.tKata + 0.32, 0.03, ease.outCubic],
    ]);
  }

  private camAt(t: number) {
    const T0 = this.ctx.start,
      T1 = this.ctx.end,
      tk = this.tKata;
    const x = keys(t, [
      [T0, -3.4],
      [tk, -1.1, ease.linear],
      [T1, 0.5, ease.outQuad],
    ]);
    const y = keys(t, [
      [T0, 3.0],
      [tk, 3.4],
      [T1, 5.6, ease.inOutQuad],
    ]);
    const z = keys(t, [
      [T0, 5.6],
      [tk, 6.4],
      [T1, 9.6, ease.inOutQuad],
    ]);
    const tx = keys(t, [
      [T0, -2.6],
      [tk, -0.9],
      [T1, 0.0, ease.inOutQuad],
    ]);
    const ty = keys(t, [
      [T0, 1.0],
      [tk, 1.3],
      [T1, 2.05, ease.inOutQuad],
    ]);
    this.rig.look(x, y, z, tx, ty, -0.6, -0.025, 52);
  }

  private press(e: Ev, t: number) {
    return smoothstep(e.t - 0.035, e.t, t) * (1 - smoothstep(e.t + 0.06, e.t + 0.22, t));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    this.camAt(t);
    const cam = this.rig.cam;
    this.world.render(renderer, out, cam, { focus: [0, 0, 0.8], fog: 0.05 });

    // ---- laptops: slide together on 肩, keys press on each sung character
    const g = this.gap(t);
    const yaw = 0.16 * (1 - smoothstep(this.tKata, this.tKata + 0.35, t));
    this.laps[0]!.group.position.set(-(g + HALF), 0, 0);
    this.laps[0]!.group.rotation.y = yaw;
    this.laps[1]!.group.position.set(g + HALF, 0, 0);
    this.laps[1]!.group.rotation.y = -yaw;
    const u = this.mat.uniforms;
    const pr = u.uPress!.value as number[],
      ht = u.uHot!.value as number[];
    pr.fill(0);
    ht.fill(0);
    for (const e of this.evs) {
      pr[e.slot] = Math.max(pr[e.slot]!, this.press(e, t));
      ht[e.slot] = Math.max(ht[e.slot]!, t >= e.t ? Math.pow(0.5, (t - e.t) / 0.16) : 0);
    }
    (u.uCam!.value as THREE.Vector3).copy(cam.position);
    this.scene3.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.scene3, cam);

    // ---- code typing onto the screens
    const lb = this.L3;
    lb.clear();
    this.laps.forEach((lap, li) => this.drawScreen(lb, lap, li, t));
    lb.render(renderer, out, cam);

    // ---- key word 肩ならべ (engraved 3D type)
    this.key.glyphs.forEach((gp, i) => {
      const s0 = this.keyT[i] ?? this.tKata;
      gp.u.reveal!.value = ease.outCubic(prog(t, s0 - 0.02, s0 + 0.14));
      gp.u.glow!.value = 0.5 * pulse(t, s0, 0.1);
      gp.u.ghost!.value = 0.03 * smoothstep(s0 - 0.3, s0, t) * (1 - smoothstep(s0, s0 + 0.25, t));
      gp.mesh.position.y = 0.18 * (1 - ease.outCubic(prog(t, s0, s0 + 0.18))) * (t >= s0 - 0.02 ? 1 : 0);
    });
    // the word hangs above the screens in screen space, turned slightly (perspective) as the camera trucks
    this.rig.placeOnScreen(this.key.group, W / 2, 700, 9.0, -0.22 + 0.1 * prog(t, this.tKata, this.ctx.end), -0.12);
    this.text3.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.render(this.text3, cam);

    const ui = this.ui;
    ui.clear();
    this.drawUI(ui.ctx, t);
    this.ctx.comp.draw(renderer, ui.upload(), out);
    return { bloom: 0.45, bloomThreshold: 1.0, vignette: 0.5, grain: 0.05, ca: 0.5 };
  }

  private drawScreen(lb: LineBatch, lap: Laptop, li: number, t: number) {
    const m = lap.hinge.matrixWorld;
    const v = this.v;
    const typed = this.evs.filter((e) => e.lap === li);
    const n0 = 4; // lines already on screen
    const rowsDone = typed.filter((e) => t >= e.t).length;
    const bone = LIN.bone;
    const x0 = -1.32,
      y0 = 1.72,
      dy = 0.15;
    let cursor: THREE.Vector3 | null = null;
    for (let r = 0; r < n0 + typed.length; r++) {
      const isNew = r >= n0;
      const e = isNew ? typed[r - n0]! : null;
      if (e && t < e.t) break;
      const len = 0.5 + 1.9 * hash(r, li, 3);
      const k = e ? ease.outCubic(prog(t, e.t, e.t + 0.16)) : 1;
      const indent = 0.14 * Math.floor(hash(r, li, 9) * 3);
      // a line = 2-4 dashes (tokens)
      let x = x0 + indent;
      const end = x0 + indent + len * k;
      const ntok = 2 + Math.floor(hash(r, li, 5) * 3);
      for (let j = 0; j < ntok && x < end; j++) {
        const tw = (len / ntok) * (0.55 + 0.35 * hash(r, j, li));
        const xe = Math.min(end, x + tw);
        const hot = isNew && r - n0 === rowsDone - 1 && j === 0;
        const c = hot ? LIN.signal : bone;
        const I = hot ? 1.6 : isNew ? 0.85 : 0.4;
        const a = v.set(x, y0 - r * dy, 0.025).applyMatrix4(m).clone();
        const b = v.set(xe, y0 - r * dy, 0.025).applyMatrix4(m).clone();
        lb.seg(a.x, a.y, a.z, b.x, b.y, b.z, 3.2, c[0] * I, c[1] * I, c[2] * I, 1);
        x = xe + 0.08;
      }
      cursor = v.set(Math.min(end, x) + 0.06, y0 - r * dy, 0.025).applyMatrix4(m).clone();
    }
    if (cursor && Math.floor(t * 3.4) % 2 === 0) {
      const s = LIN.signal;
      lb.seg(cursor.x, cursor.y, cursor.z, cursor.x + 0.06, cursor.y, cursor.z, 9, s[0] * 1.4, s[1] * 1.4, s[2] * 1.4, 1);
    }
    void rowsDone;
  }

  private drawUI(c: CanvasRenderingContext2D, t: number) {
    // kana rising off the pressed keys
    c.save();
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    for (const e of this.evs) {
      const k = prog(t, e.t, e.t + 0.45);
      if (k <= 0 || k >= 1) continue;
      const lap = this.laps[e.lap]!;
      const p = lap.keyAt(e.key).applyMatrix4(lap.group.matrixWorld);
      const s = this.rig.project(p.x, p.y, p.z);
      if (!s) continue;
      const rise = 150 * ease.outCubic(k);
      c.globalAlpha = 1 - smoothstep(0.55, 1, k);
      c.font = font(F.jp(900), 84);
      c.fillStyle = rgba(k < 0.12 ? "signal" : "bone", 1);
      c.fillText(e.ch, s.x, s.y - 30 - rise);
    }
    c.restore();
    // header かたかた, one character per keystroke
    const L = this.head;
    const x0 = W / 2 - L.width / 2,
      y = 330;
    c.save();
    c.font = font(F.jp(900), L.size);
    L.glyphs.forEach((gl, i) => {
      const t0 = this.headT[i] ?? this.headT[this.headT.length - 1]!;
      const on = t >= t0;
      const after = clamp((t - this.tKata) / 0.4);
      c.fillStyle = on ? rgba("bone", lerp(1, 0.78, after)) : rgba("graphite", 0.28);
      const dy = on ? -14 * pulse(t, t0, 0.06) : 0;
      c.fillText(gl.ch, x0 + gl.x, y + dy);
    });
    c.fillStyle = rgba("graphite", 0.9);
    c.fillRect(W / 2 - 60, y + 34, 120, 1.5);
    c.font = font(F.mono(400), 22);
    c.fillStyle = rgba("ash", 0.9);
    c.textAlign = "center";
    const n = this.evs.filter((e) => t >= e.t).length;
    c.fillText(`keystrokes ${String(n).padStart(2, "0")}  ·  tty0 + tty1`, W / 2, y + 76);
    c.restore();
  }
}
