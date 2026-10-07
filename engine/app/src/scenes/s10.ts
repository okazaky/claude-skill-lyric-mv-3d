// s10 「AIと私」 + outro — the title.
// Two sparks (the video's spark, twice) orbit each other in 3D and travel along the title as it is
// sung; behind them each glyph of 「AIと私」 is cut as an engraving (relief lit from the upper left,
// rendered as light hatch lines + rim), 私 in signal and held while the vocal holds. Then the pair
// widens into a slow orbit around the whole title, the camera pulls back and up into the grid, the
// morning sun sets again, a tiny 03:00 returns (the loop back to s01), and the frame fades to ink.
// Beat: grid flash and title bump on the kick, spark intensity, ray pulse.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W, H } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, measure } from "../engine/type";
import type { Word } from "../engine/lyrics";
import { clamp, ease, keys, lerp, prog, pulse, smoothstep, TAU } from "../engine/util";
import { sparkHead, sparkParticles } from "./_motifs";
import { DawnWorld } from "./s09-world";
import { GlyphPlane } from "./s10-glyph";

const TITLE = { z: -4, base: 0.9, em: 3.6 };
const DT = 1 / 240;

interface G {
  gp: GlyphPlane;
  x: number;
  t0: number;
  t1: number;
  hot: boolean;
}

export default class S10 extends Scene {
  world = new DawnWorld();
  L3 = new LineBatch(30000, { screen2D: false, blend: "add" });
  L2 = new LineBatch(20000, { screen2D: true, blend: "add" });
  ui = new Layer2D();
  text3 = new THREE.Scene();
  word!: Word;
  glyphs: G[] = [];
  T0 = 0;
  T1 = 0;
  tA = 0;
  tHold = 0;
  tSung = 0;
  tBack = 0;
  theta = new Float32Array(0);
  titleW = 0;

  override async init() {
    const { lyrics } = this.ctx;
    this.T0 = this.ctx.start;
    this.T1 = this.ctx.end;
    const line = lyrics.get("AIと私");
    this.word = line.words[0]!;
    const syl = this.word.syl ?? [[this.word.start, this.word.end]];
    const fam = F.jp(900);
    const txt = this.word.w;
    const lay = layout(txt, fam, 100);
    const s = TITLE.em / 100;
    this.titleW = lay.width * s;
    const x0 = -this.titleW / 2;
    lay.glyphs.forEach((g, i) => {
      const gp = new GlyphPlane(g.ch, fam, TITLE.em);
      const hot = g.ch === "私";
      const [a, b] = syl[Math.min(i, syl.length - 1)]!;
      const dur = hot ? 0.8 : Math.min(b - a, g.ch === "と" ? 0.5 : 0.34);
      const x = x0 + (g.x + g.w / 2) * s;
      gp.mesh.position.set(x, TITLE.base, TITLE.z);
      const col = hot ? LIN.signal.map((v) => v * 1.15) : LIN.bone.map((v) => v * 0.92);
      (gp.u.col!.value as THREE.Vector3).set(col[0]!, col[1]!, col[2]!);
      gp.u.freq!.value = 40;
      gp.u.mode!.value = 1;
      this.text3.add(gp.mesh);
      this.glyphs.push({ gp, x, t0: a, t1: a + dur, hot });
    });
    this.tA = this.glyphs[0]!.t0;
    this.tSung = this.word.end;
    this.tHold = this.glyphs[this.glyphs.length - 1]!.t1;
    this.tBack = Math.max(this.tSung, this.tHold + 1);
    // orbit phase: integral of the angular speed (fast while writing, slow in the outro)
    const n = Math.ceil((this.T1 - this.T0 + 2) / DT);
    this.theta = new Float32Array(n + 1);
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      this.theta[i] = acc;
      acc += this.omega(this.T0 - 1 + i * DT) * DT;
    }
  }

  private omega(t: number) {
    const fast = TAU * 2.4,
      mid = TAU * 0.42,
      slow = TAU * 0.22;
    return lerp(
      lerp(fast, mid, smoothstep(this.tHold - 0.2, this.tHold + 1.0, t)),
      slow,
      smoothstep(this.tBack, this.tBack + 2, t),
    );
  }
  private th(t: number) {
    const x = (t - (this.T0 - 1)) / DT;
    const i = clamp(Math.floor(x), 0, this.theta.length - 2);
    return lerp(this.theta[i]!, this.theta[i + 1]!, clamp(x - i, 0, 1));
  }

  /** Centre, radius and tilt of the sparks' orbit at t. */
  private orbit(t: number) {
    const g = this.glyphs;
    const ks: [number, number, ((x: number) => number)?][] = [
      [this.T0 - 0.2, g[0]!.x - 9],
      [this.tA, g[0]!.x, ease.outCubic],
    ];
    // hold on each glyph while it is sung, then hop to the next one by its start
    for (let i = 1; i < g.length; i++) {
      const p = g[i - 1]!;
      ks.push([p.t0 + 0.7 * (g[i]!.t0 - p.t0), p.x], [g[i]!.t0, g[i]!.x, ease.inOutCubic]);
    }
    ks.push([this.tHold, g[g.length - 1]!.x], [this.tHold + 1.2, 0, ease.inOutCubic]);
    const cx = keys(t, ks);
    const em = TITLE.em;
    const cy =
      TITLE.base +
      em *
        keys(t, [
          [this.tHold, 0.4],
          [this.tHold + 1.2, 0.46],
        ]);
    const r = keys(t, [
      [this.tA, em * 0.42],
      [this.tHold, em * 0.5],
      [this.tHold + 1.2, this.titleW * 0.62, ease.inOutCubic],
    ]);
    const tilt = keys(t, [
      [this.tHold, 0.85],
      [this.tHold + 1.2, 0.2],
      [this.tBack + 3, 0.12],
    ]);
    return { cx, cy, cz: TITLE.z + 0.35, r, tilt };
  }
  private spark(t: number, k: number) {
    const o = this.orbit(t);
    const a = this.th(t) + k * Math.PI;
    const wob = 1 + 0.08 * Math.sin(this.th(t) * 2.3 + k);
    const c = Math.cos(a) * o.r * wob,
      s = Math.sin(a) * o.r * wob;
    // second axis tilted out of the title plane: the pair swings in front of and behind the letters
    return { x: o.cx + c, y: o.cy + s * o.tilt, z: o.cz + s * Math.sqrt(1 - o.tilt * o.tilt) };
  }

  /** Feed the glyph the sparks' paths (glyph-local) over its writing window: it appears where they passed. */
  private pathInto(g: G, t: number) {
    const u = g.gp.u;
    const i = this.glyphs.indexOf(g);
    const next = this.glyphs[i + 1];
    const wEnd = next ? next.t0 + 0.05 : this.tHold + 0.6;
    const w0 = g.t0 - 0.06, w1 = Math.min(t, wEnd);
    const pts = u.pts!.value as THREE.Vector2[];
    if (t < w0) { u.nPts!.value = 0; u.headGlow!.value = 0; return; }
    const N = 48;
    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < N; j++) {
        const tt = lerp(w0, w1, j / (N - 1));
        const p = this.spark(tt, k);
        pts[k * N + j]!.set(p.x - g.x, p.y - TITLE.base);
      }
    }
    u.nPts!.value = N;
    u.brush!.value = TITLE.em * 0.36;
    u.headGlow!.value = 1 - smoothstep(wEnd - 0.25, wEnd, t);
  }

  private camAt(t: number, kick: number) {
    const back = ease.inOutCubic(prog(t, this.tBack, this.T1 - 0.4));
    const pre = prog(t, this.T0, this.tBack);
    const z = lerp(lerp(9.6, 8.4, ease.outCubic(pre)), 34, back);
    const y = lerp(2.3, 13, back) + 0.025 * kick;
    const x = lerp(1.1 - 2.0 * pre, 0, back);
    const ty = lerp(2.15, 0.2, back);
    this.world.look(x, y, z, 0, ty, TITLE.z, lerp(-0.015, 0, back), 38);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t,
      kick = f.a.kick;
    this.camAt(t, kick);
    const set = smoothstep(this.tBack + 0.5, this.T1 - 1.2, t);
    this.world.render(renderer, out, {
      sunH: lerp(0.13, -0.12, set),
      sunAz: 0.42,
      sunR: 0.085,
      sunA: 1 - 0.7 * set,
      amp: 0.75,
      focus: [0, TITLE.z, 7],
      dawn: lerp(0.85, 0.08, set),
      grid: lerp(0.8, 1.25, smoothstep(this.tBack, this.tBack + 3, t)),
      kick,
      t,
    });

    // ---- title
    const bump = 1 + 0.012 * kick;
    for (const g of this.glyphs) {
      const u = g.gp.u;
      this.pathInto(g, t);
      // anticipation: at most 0.4 s before the glyph is sung
      u.ghost!.value = 0.028 * smoothstep(g.t0 - 0.4, g.t0, t) * (1 - smoothstep(g.t0, g.t0 + 0.5, t));
      u.glow!.value = g.hot
        ? 0.2 * pulse(t, g.t0, 0.15) + 0.15 * kick * (t < this.tSung ? 1 : 0.4)
        : 0.4 * pulse(t, g.t0, 0.1);
      g.gp.mesh.scale.set(bump, bump, 1);
    }
    this.text3.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.render(this.text3, this.world.cam);

    // ---- spark trails (3D) and heads (projected, 2D)
    const lb = this.L3;
    lb.clear();
    const l2 = this.L2;
    l2.clear();
    const trail = lerp(0.42, 1.6, smoothstep(this.tHold, this.tHold + 1.5, t));
    const NS = 56;
    const live = smoothstep(this.T0, this.T0 + 0.12, t) * (1 - 0.6 * set);
    for (let k = 0; k < 2; k++) {
      let prev = this.spark(t - trail, k);
      for (let i = 1; i <= NS; i++) {
        const tt = t - trail * (1 - i / NS);
        const p = this.spark(tt, k);
        const a = (i / NS) ** 1.6 * live;
        const I = 2.4 * (0.6 + 0.4 * kick);
        lb.seg(
          prev.x,
          prev.y,
          prev.z,
          p.x,
          p.y,
          p.z,
          1.2 + 1.6 * (i / NS),
          LIN.signal[0] * I,
          LIN.signal[1] * I,
          LIN.signal[2] * I,
          a,
        );
        prev = p;
      }
      const headAt = (tb: number) => {
        const q = this.spark(tb, k);
        const s = this.world.project(q.x, q.y, q.z);
        return s ? { x: s.x, y: s.y } : null;
      };
      const h = this.spark(t, k);
      const s = this.world.project(h.x, h.y, h.z);
      if (s) {
        const sc = clamp(11 / s.depth, 0.35, 1.6);
        sparkParticles(l2, t, headAt, {
          rate: 70,
          life: 0.4,
          speed: 200 * sc,
          intensity: 0.8 * live,
          seed: 11 + k * 17,
        });
        sparkHead(l2, s.x, s.y, t + k * 0.37, sc * (0.9 + 0.3 * kick), live);
      }
    }
    lb.render(renderer, out, this.world.cam);
    l2.render(renderer, out);

    // ---- 2D annotations
    const ui = this.ui;
    ui.clear();
    this.drawLabels(ui.ctx, t);
    ui.upload();
    this.ctx.comp.draw(renderer, ui.texture, out);

    return {
      bloom: 0.4,
      bloomThreshold: 1.1,
      vignette: 0.5,
      grain: 0.05,
      ca: 0.6,
      zoom: 1 + 0.01 * kick,
      fade: smoothstep(this.T1 - 1.7, this.T1 - 0.05, t),
    };
  }

  private drawLabels(c: CanvasRenderingContext2D, t: number) {
    const P = (x: number, y: number) => this.world.project(x, y, TITLE.z);
    const g = this.glyphs;
    const a1 =
      smoothstep(this.tHold + 0.3, this.tHold + 0.7, t) *
      (1 - smoothstep(this.tBack, this.tBack + 0.8, t));
    const under = TITLE.base - 0.55;
    if (a1 > 0.001) {
      c.save();
      c.globalAlpha = a1;
      const ai = P((g[0]!.x + g[1]!.x) / 2, under),
        wa = P(g[g.length - 1]!.x, under);
      const ai0 = P((g[0]!.x + g[1]!.x) / 2, TITLE.base - 0.12),
        wa0 = P(g[g.length - 1]!.x, TITLE.base - 0.12);
      c.fillStyle = rgba("ash", 0.8);
      if (ai && ai0) {
        c.fillRect(ai.x, ai0.y, 1, ai.y - ai0.y);
        c.font = font(F.mono(400), 17);
        c.fillStyle = rgba("bone", 0.85);
        const s1 = "model · stateless";
        c.fillText(s1, ai.x - measure(s1, F.mono(400), 17) / 2, ai.y + 26);
        c.font = font(F.mono(400), 13);
        c.fillStyle = rgba("ash", 0.85);
        const s2 = "context: 0 tokens kept";
        c.fillText(s2, ai.x - measure(s2, F.mono(400), 13) / 2, ai.y + 48);
      }
      if (wa && wa0) {
        c.fillStyle = rgba("ash", 0.8);
        c.fillRect(wa.x, wa0.y, 1, wa.y - wa0.y);
        c.font = font(F.jp(400), 19);
        c.fillStyle = rgba("signal", 0.95);
        const s1 = "人間 · 明日も来る";
        c.fillText(s1, wa.x - measure(s1, F.jp(400), 19) / 2, wa.y + 28);
        c.font = font(F.mono(400), 13);
        c.fillStyle = rgba("ash", 0.85);
        const s2 = "memory: 1 (one-sided)";
        c.fillText(s2, wa.x - measure(s2, F.mono(400), 13) / 2, wa.y + 50);
      }
      c.restore();
    }
    // outro: one deadpan line under the title, then the clock returns to 03:00 (loop to s01)
    const a2 = smoothstep(this.tBack + 1.2, this.tBack + 2.0, t);
    if (a2 > 0.001) {
      const p = P(0, TITLE.base - 0.9);
      if (p) {
        c.save();
        c.globalAlpha = a2;
        c.font = font(F.jp(400), 22);
        c.fillStyle = rgba("bone", 0.85);
        const s = "この会話は保存されません";
        c.fillText(s, p.x - measure(s, F.jp(400), 22) / 2, p.y + 10);
        c.restore();
      }
    }
    const a3 = smoothstep(this.T1 - 3.6, this.T1 - 3.0, t);
    if (a3 > 0.001) {
      c.save();
      c.globalAlpha = a3;
      c.font = font(F.mono(300), 30);
      const blink = Math.floor((t - (this.T1 - 3.6)) * 1.85) % 2 === 0 ? 1 : 0.35;
      c.fillStyle = rgba("bone", 0.8);
      const s = "03:00";
      const w = measure(s, F.mono(300), 30);
      c.fillText("03", W / 2 - w / 2, H - 150);
      c.fillStyle = rgba("bone", 0.8 * blink);
      c.fillText(":", W / 2 - w / 2 + measure("03", F.mono(300), 30), H - 150);
      c.fillStyle = rgba("bone", 0.8);
      c.fillText("00", W / 2 - w / 2 + measure("03:", F.mono(300), 30), H - 150);
      c.restore();
    }
  }
}
