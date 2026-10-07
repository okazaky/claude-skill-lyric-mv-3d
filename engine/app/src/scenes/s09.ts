// s09 「それでも明日も 君に打ち込む」 — dawn.
// The 3 a.m. void of s01 has a horizon now: a woodcut sun sphere rises behind the line
// 「それでも明日も」, which stands on the engraved ground as monumental type, character by character on
// the vocal (明日 in signal). Below, the prompt bar returns lying in perspective, and 「君に打ち込む」
// is typed into it again; a next-token distribution offers 打ち込む 0.71 / 話しかける / 頼る / 寝る.
// A clock on a short leader rolls 03:00 → 06:00, twenty minutes per beat. Kick: grid flash, halo-ring pulse,
// camera bob. ⏎ is pressed on the cut.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W, H } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, measure } from "../engine/type";
import type { Line, Word } from "../engine/lyrics";
import { clamp, ease, keys, lerp, prog, pulse, smoothstep, frameIdx } from "../engine/util";
import { TextPlane } from "./stack-kit";
import { GlyphPlane } from "./s10-glyph";
import { DawnWorld } from "./s09-world";

const BIG = { z: -14, base: 0.45, capH: 2.3 };
const BAR = { x: 0, y: 0.55, z: 2.5, tilt: -0.5, w: 4.9, h: 0.86, capH: 0.36 };
const CLOCK = { x: -6.8, y: 5.6, z: -14 };
const CANDS: [string, number][] = [
  ["打ち込む", 0.71],
  ["話しかける", 0.12],
  ["頼る", 0.06],
  ["寝る", 0.04],
];

/** Syllable start times of a word, clamped into the window (そ is sung 0.09 s before the cut, so it lands on it). */
const sylStarts = (w: Word, lim: number, from = -Infinity) =>
  (w.syl ?? [[w.start, w.end]]).map((s) => Math.max(from, Math.min(s[0], lim)));

const FILL_VERT = /* glsl */ `precision highp float;
in vec3 position; in vec2 uv; uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export default class S09 extends Scene {
  world = new DawnWorld();
  L3 = new LineBatch(20000, { screen2D: false, blend: "add" });
  ui = new Layer2D();
  text3 = new THREE.Scene();
  bar = new THREE.Group();
  line!: Line;
  w0!: Word;
  w1!: Word;
  big: { gp: GlyphPlane; t0: number; hot: boolean; x: number }[] = [];
  typed!: TextPlane;
  typedT: number[] = [];
  fillMat!: THREE.RawShaderMaterial;
  T0 = 0;
  T1 = 0;
  tEnter = 0;
  beat0 = 0;
  v = new THREE.Vector3();

  override async init() {
    const { lyrics, audio } = this.ctx;
    this.T0 = this.ctx.start;
    this.T1 = this.ctx.end;
    this.line = lyrics.get("それでも明日も");
    this.w0 = this.line.words[0]!;
    this.w1 = this.line.words[1]!;
    const lim = this.T1 - 0.1;
    this.beat0 = Math.floor(audio.beatAt(this.T0 + 1e-3));
    // ⏎ lands as the line ends (the window now closes on the line end 42.133)
    this.tEnter = Math.min(this.T1, this.w1.end) - 0.08;

    // ---- monumental line on the horizon: one plane per character, placed on the font's layout
    const fam = F.jp(900);
    const txt = this.w0.w;
    const lay = layout(txt, fam, 100);
    const probe = new TextPlane("H", fam, { capH: BIG.capH, outline: 0, px: 100 });
    const s = probe.em / 100; // world units per layout px at em 100
    const x0 = -(lay.width * s) / 2;
    const st = sylStarts(this.w0, lim, this.T0);
    lay.glyphs.forEach((g, i) => {
      // engraved glyph (same technique as the s10 title): relief rendered as light hatch lines + rim
      const gp = new GlyphPlane(g.ch, fam, probe.em, 300);
      const hot = g.ch === "明" || g.ch === "日";
      const c = hot ? LIN.signal.map((v) => v * 1.5) : LIN.bone.map((v) => v * 0.92);
      (gp.u.col!.value as THREE.Vector3).set(c[0]!, c[1]!, c[2]!);
      gp.u.freq!.value = 32;
      const cx = x0 + (g.x + g.w / 2) * s;
      gp.mesh.position.set(cx, BIG.base, BIG.z);
      this.text3.add(gp.mesh);
      this.big.push({ gp, t0: st[Math.min(i, st.length - 1)]!, hot, x: cx });
    });

    // ---- the prompt bar lying in perspective
    this.bar.position.set(BAR.x, BAR.y, BAR.z);
    this.bar.rotation.x = BAR.tilt;
    this.fillMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FILL_VERT,
      fragmentShader: /* glsl */ `precision highp float;
        in vec2 vUv; out vec4 fragColor; uniform float uA, uFlash;
        const vec3 INK2 = vec3(${LIN.ink2.map((x) => x.toFixed(5)).join(",")});
        const vec3 SIG = vec3(${LIN.signal.map((x) => x.toFixed(5)).join(",")});
        void main() {
          // engraved panel: fine diagonal hatch, denser toward the lower edge
          vec2 q = vUv * vec2(${(BAR.w / BAR.h).toFixed(3)}, 1.0) * 46.0;
          float u = q.x + q.y;
          float f = abs(fract(u) - 0.5);
          float dark = mix(0.28, 0.06, vUv.y);
          float aa = fwidth(u);
          float ink = 1.0 - smoothstep(0.5 * dark - aa, 0.5 * dark + aa, 0.5 - f);
          vec3 c = INK2 * 1.4 + vec3(0.03) * ink + SIG * uFlash * 0.6;
          fragColor = vec4(c * uA, uA);
        }`,
      uniforms: { uA: { value: 0.9 }, uFlash: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(BAR.w, BAR.h), this.fillMat);
    fill.frustumCulled = false;
    fill.renderOrder = 1;
    this.bar.add(fill);
    this.typed = new TextPlane(this.w1.w, F.jp(700), {
      capH: BAR.capH,
      outline: 0,
      px: 200,
      ax: 0,
      ay: 0.45,
    });
    this.typed.set({
      prog: 0,
      aDim: 0,
      fillDim: 0,
      cSung: [LIN.bone[0] * 0.95, LIN.bone[1] * 0.95, LIN.bone[2] * 0.95],
      feather: 0.001,
    });
    this.typed.mesh.position.set(-BAR.w / 2 + 0.55, 0, 0.001);
    this.typed.mesh.frustumCulled = false;
    this.typed.mesh.renderOrder = 2;
    this.bar.add(this.typed.mesh);
    this.text3.add(this.bar);
    this.typedT = sylStarts(this.w1, lim);
  }

  // ------------------------------------------------------------------ camera
  private camAt(t: number, kick: number) {
    const tB = this.w1.start;
    const z = keys(t, [
      [this.T0, 10.6],
      [tB - 0.2, 9.4, ease.inOutCubic],
      [tB + 0.45, 8.6, ease.outExpo],
      [this.T1, 8.2, ease.linear],
    ]);
    const y = keys(t, [
      [this.T0, 1.75],
      [tB - 0.2, 1.62, ease.inOutCubic],
      [tB + 0.45, 1.42, ease.outExpo],
      [this.T1, 1.38],
    ]);
    const ty = keys(t, [
      [this.T0, 0.95],
      [tB - 0.2, 0.55, ease.inOutCubic],
      [tB + 0.45, 0.05, ease.outExpo],
      [this.T1, 0.0],
    ]);
    const x = 0.35 * Math.sin((t - this.T0) * 0.35) - 0.25;
    const roll = 0.012 * Math.sin((t - this.T0) * 0.6) - 0.01;
    this.world.look(x, y + 0.03 * kick, z, 0, ty, -20, roll, 38);
  }

  /** Characters of 「君に打ち込む」 typed so far (integer, on syllable starts). */
  private typedN(t: number) {
    let n = 0;
    for (const s of this.typedT) if (t >= s) n++;
    return n;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, audio } = this.ctx;
    const t = f.t;
    const kick = f.a.kick;
    this.camAt(t, kick);
    const pT = clamp((t - this.T0) / (this.T1 - this.T0));
    const sunH = lerp(-0.035, 0.115, ease.outCubic(pT));
    this.world.render(renderer, out, {
      sunH,
      dawn: lerp(0.35, 1, pT),
      grid: 0.85,
      kick,
      t,
      sunR: 0.1,
      amp: 0.7,
      focus: [0, -6, 9],
    });

    // ---- 3D type
    for (const b of this.big) {
      const k = clamp((t - b.t0) / 0.32);
      const e = ease.outExpo(k);
      const u = b.gp.u;
      u.reveal!.value = ease.outCubic(prog(t, b.t0, b.t0 + 0.22));
      u.ghost!.value = 0.012 * smoothstep(b.t0 - 0.4, b.t0, t) * (1 - smoothstep(b.t0, b.t0 + 0.25, t));
      u.glow!.value = b.hot ? 0.5 * pulse(t, b.t0, 0.12) + 0.2 * kick : 0.4 * pulse(t, b.t0, 0.1);
      b.gp.mesh.position.y = BIG.base - 1.4 * (1 - e) * (t >= b.t0 ? 1 : 0);
      const sc = t >= b.t0 ? 1 + 0.18 * (1 - e) : 1;
      b.gp.mesh.scale.set(sc, sc, 1);
    }
    const n = this.typedN(t);
    const N = this.w1.w.length;
    this.typed.set({
      prog: n / N,
      fillDim: 0,
      flash: 0.5 * pulse(t, this.typedT[Math.max(0, n - 1)] ?? 0, 0.08),
    });
    const enter = pulse(t, this.tEnter, 0.05);
    this.fillMat.uniforms.uFlash!.value = 0.22 * enter + 0.06 * kick;
    this.text3.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.render(this.text3, this.world.cam);

    // ---- bar hairlines, caret, ⏎ (3D lines in the bar's plane)
    const lb = this.L3;
    lb.clear();
    const m = this.bar.matrixWorld;
    const P = (x: number, y: number) => this.v.set(x, y, 0.002).applyMatrix4(m).clone();
    const seg = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      w: number,
      c: [number, number, number],
      a = 1,
    ) => {
      const A = P(ax, ay),
        B = P(bx, by);
      lb.seg(A.x, A.y, A.z, B.x, B.y, B.z, w, c[0], c[1], c[2], a);
    };
    const hw = BAR.w / 2,
      hh = BAR.h / 2;
    const bone: [number, number, number] = [
      LIN.bone[0] * 0.7,
      LIN.bone[1] * 0.7,
      LIN.bone[2] * 0.7,
    ];
    const sig: [number, number, number] = [
      LIN.signal[0] * 2.2,
      LIN.signal[1] * 2.2,
      LIN.signal[2] * 2.2,
    ];
    const bb = 0.55 + 0.45 * kick + enter;
    seg(-hw, -hh, hw, -hh, 1.3, bone, bb);
    seg(hw, -hh, hw, hh, 1.3, bone, bb);
    seg(hw, hh, -hw, hh, 1.3, bone, bb);
    seg(-hw, hh, -hw, -hh, 1.3, bone, bb);
    // chevron prompt mark
    seg(-hw + 0.18, 0.12, -hw + 0.3, 0, 2, sig);
    seg(-hw + 0.3, 0, -hw + 0.18, -0.12, 2, sig);
    // caret after the last typed character
    const tw = this.typed.w;
    const cx = -hw + 0.55 + (tw * n) / N + 0.06;
    const blink =
      frameIdx(t) % 32 < 18 || (n > 0 && t - (this.typedT[n - 1] ?? 0) < 0.25) ? 1 : 0.15;
    seg(cx, -BAR.capH * 0.62, cx, BAR.capH * 0.62, 3.2, sig, blink);
    // ⏎ key on the right: pressed on the cut
    const kx = hw - 0.42,
      press = smoothstep(this.tEnter - 0.02, this.tEnter, t);
    const kc: [number, number, number] =
      press > 0 ? [sig[0] * 1.6, sig[1] * 1.6, sig[2] * 1.6] : bone;
    seg(kx + 0.14, 0.13, kx + 0.14, -0.04, 1.8, kc);
    seg(kx + 0.14, -0.04, kx - 0.14, -0.04, 1.8, kc);
    seg(kx - 0.14, -0.04, kx - 0.06, 0.04, 1.8, kc);
    seg(kx - 0.14, -0.04, kx - 0.06, -0.12, 1.8, kc);
    // leader from the clock down to just above the cap line (it must not cut through the big type)
    const cA = this.world.project(CLOCK.x, CLOCK.y - 0.35, CLOCK.z);
    const leadY = BIG.base + BIG.capH + 0.35;
    lb.seg(
      CLOCK.x,
      CLOCK.y - 0.45,
      CLOCK.z,
      CLOCK.x,
      leadY,
      CLOCK.z,
      1,
      LIN.ash[0] * 0.6,
      LIN.ash[1] * 0.6,
      LIN.ash[2] * 0.6,
      0.8,
    );
    lb.seg(
      CLOCK.x - 0.4,
      leadY,
      CLOCK.z,
      CLOCK.x + 0.4,
      leadY,
      CLOCK.z,
      1,
      LIN.ash[0] * 0.6,
      LIN.ash[1] * 0.6,
      LIN.ash[2] * 0.6,
      0.8,
    );
    lb.render(renderer, out, this.world.cam);

    // ---- 2D annotations anchored to 3D points
    const ui = this.ui;
    ui.clear();
    const c = ui.ctx;
    c.textBaseline = "alphabetic";
    if (cA) this.drawClock(c, t, cA.x, cA.y, audio.beatAt(t));
    this.drawBarLabels(c, P);
    this.drawCands(c, t, P, -hw + 0.55, tw, N);
    ui.upload();
    this.ctx.comp.draw(renderer, ui.texture, out);

    return {
      bloom: 0.75,
      bloomThreshold: 0.9,
      vignette: 0.45,
      grain: 0.05,
      ca: 0.6,
      flash: 0.05 * enter,
      zoom: 1 + 0.012 * kick,
      shake: [0, 2.5 * kick],
    };
  }

  // ------------------------------------------------------------------ 2D parts
  private drawClock(c: CanvasRenderingContext2D, t: number, x: number, y: number, beat: number) {
    const b = beat - this.beat0;
    const k = Math.floor(b),
      ph = b - k;
    const roll = ease.outExpo(clamp(ph / 0.35));
    const mins = 180 + 20 * Math.max(0, k - 1 + roll);
    const hh = Math.floor(mins / 60),
      mm = Math.floor(mins % 60);
    const str = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const size = 74;
    c.font = font(F.mono(300), size);
    const w = measure(str, F.mono(300), size);
    c.fillStyle = rgba("bone", 0.92);
    c.fillText(str, x - w / 2, y);
    c.font = font(F.jp(400), 20);
    c.fillStyle = rgba("ash", 0.85);
    const lab = mins >= 300 ? "午前 · 夜明け" : "午前 · 三時台";
    c.fillText(lab, x - w / 2, y - size * 0.85);
    c.font = font(F.mono(400), 14);
    c.fillStyle = rgba("signal", 0.9);
    c.fillText(`sun ${((Math.max(0, mins - 300) / 60) * 15).toFixed(1)}°`, x - w / 2, y + 26);
  }

  private drawBarLabels(c: CanvasRenderingContext2D, P: (x: number, y: number) => THREE.Vector3) {
    // under the bar's lower-right corner, clear of the big line above and the token table below-left
    const br = P(BAR.w / 2, -BAR.h / 2);
    const s = this.world.project(br.x, br.y, br.z);
    if (!s) return;
    const jp = "新しいチャット · 記憶 0 件";
    const wj = measure(jp, F.jp(400), 17);
    c.font = font(F.jp(400), 17);
    c.fillStyle = rgba("ash", 0.9);
    c.fillText(jp, s.x - wj, s.y + 30);
    c.font = font(F.mono(500), 15);
    c.fillStyle = rgba("signal", 0.95);
    c.fillText("PROMPT 02", s.x - wj - 104, s.y + 30);
  }

  private drawCands(
    c: CanvasRenderingContext2D,
    t: number,
    P: (x: number, y: number) => THREE.Vector3,
    tx0: number,
    tw: number,
    N: number,
  ) {
    const wUchi = this.typedT[2] ?? this.w1.end;
    const a =
      smoothstep(wUchi - 0.05, wUchi + 0.05, t) *
      (1 - smoothstep(this.tEnter - 0.05, this.tEnter, t));
    if (a <= 0.001) return;
    const anchor = P(tx0 + (tw * 2) / N, -BAR.h / 2 - 0.04);
    const s = this.world.project(anchor.x, anchor.y, anchor.z);
    if (!s) return;
    const x = s.x,
      y0 = Math.min(s.y + 46, H - 140 - 102); // table bottom stays >= 140 px above the frame edge
    c.save();
    c.globalAlpha = a;
    c.fillStyle = rgba("ink2", 0.85);
    c.fillRect(x - 10, y0 - 30, 330, 132);
    c.fillStyle = rgba("ash", 0.5);
    c.fillRect(x - 10, y0 - 30, 330, 1);
    c.font = font(F.mono(400), 12);
    c.fillStyle = rgba("ash", 0.9);
    c.fillText("next token · T 0.7", x, y0 - 12);
    CANDS.forEach(([w, p], i) => {
      const y = y0 + 10 + i * 24;
      const pick = i === 0;
      const grow = ease.outExpo(clamp((t - wUchi - i * 0.04) / 0.3));
      c.font = font(F.jp(400), 18);
      c.fillStyle = rgba(pick ? "signal" : "bone", pick ? 1 : 0.7);
      c.fillText(w, x, y);
      c.fillStyle = rgba(pick ? "signal" : "graphite", pick ? 0.95 : 0.9);
      c.fillRect(x + 130, y - 11, (120 * p * grow) / 0.71, 8);
      c.font = font(F.mono(400), 14);
      c.fillStyle = rgba(pick ? "signal" : "ash", 0.95);
      c.fillText(p.toFixed(2), x + 262, y);
    });
    c.restore();
  }
}
