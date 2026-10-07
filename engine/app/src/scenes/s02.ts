// s02 — 「『素晴らしい質問ですね』と君は言う」 — sycophancy.
// The bland assistant-smile mask as a giant engraved 3D coin, beaming at the viewer, nodding on
// every beat; behind it a wall of small smiling masks (the applause) and a sunburst of engraved
// rays that ratchets round on the beat. 素晴らしい slams in, glyph by glyph, huge and orange;
// 質問ですね」 punches in under it; と君は言う is set small and deadpan. An applause meter
// ("SYCOPHANCY") ratchets up to 0.97, and signal-orange confetti sparks burst off the mask's rim
// on every beat.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { FSPass, Layer2D, W, H } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { rgba } from "../engine/palette";
import { F, font, layout, type TextLayout } from "../engine/type";
import type { Word } from "../engine/lyrics";
import {
  clamp,
  ease,
  lerp,
  prog,
  pulse,
  smoothstep,
  TAU,
  frameIdx,
  hash,
  noise1,
} from "../engine/util";
import { sparkParticles } from "./_motifs";
import { S02_FRAG } from "./s02-glsl";

const FOV = 40;
const TANF = Math.tan(((FOV / 2) * Math.PI) / 180);
const MASK_C = new THREE.Vector3(4.05, 0.05, 0);
const MASK_R = 2.05;

/** Character ranges of the line 「素晴らしい質問ですね」と君は言う. */
const SEG = { q0: 0, great: [1, 6] as const, q: [6, 11] as const, q1: 11, said: [12, 17] as const };

export default class S02 extends Scene {
  private L = new Layer2D();
  private sparks = new LineBatch(6000, { screen2D: true, blend: "add" });
  private pass!: FSPass;
  private w!: Word;
  private ts: number[] = []; // per-char onset
  private famBig = F.jp(900);
  private greatLay!: TextLayout;
  private qLay!: TextLayout;
  private cam = {
    pos: new THREE.Vector3(),
    R: new THREE.Vector3(),
    U: new THREE.Vector3(),
    F: new THREE.Vector3(),
  };
  private b0 = 0;
  private b1 = 0;

  override init() {
    const ly = this.ctx.lyrics;
    this.w = ly.get("素晴らしい").words[0]!;
    const syl = this.w.syl ?? [];
    this.ts = Array.from(this.w.w, (_, i) => syl[i]?.[0] ?? this.w.start);
    this.greatLay = layout("素晴らしい", this.famBig, 100);
    this.qLay = layout("質問ですね」", this.famBig, 100);
    const au = this.ctx.audio;
    this.b0 = Math.round(au.beatAt(this.ctx.start));
    this.b1 = Math.round(au.beatAt(this.ctx.end));
    this.pass = new FSPass(S02_FRAG, {
      camPos: { value: new THREE.Vector3() },
      camR: { value: new THREE.Vector3() },
      camU: { value: new THREE.Vector3() },
      camF: { value: new THREE.Vector3() },
      tanF: { value: TANF },
      aspect: { value: W / H },
      uT: { value: 0 },
      kick: { value: 0 },
      beatPh: { value: 0 },
      rayRot: { value: 0 },
      glow: { value: 0 },
      crowdK: { value: 0 },
      mC: { value: MASK_C.clone() },
      mR: { value: MASK_R },
      mRot: { value: new THREE.Matrix3() },
    });
  }

  private setCam(t: number, f: Frame) {
    const p = prog(t, this.ctx.start, this.ctx.end);
    const e = ease.inOutQuad(p);
    const shake = 0.04 * pulse(t, this.lastSlam(t), 0.06);
    const pos = new THREE.Vector3(
      lerp(-0.2, 0.55, e) + shake * noise1(t * 40, 1),
      lerp(0.25, -0.15, e) + shake * noise1(t * 40, 2),
      lerp(9.6, 8.0, e),
    );
    const tgt = new THREE.Vector3(lerp(0.55, 0.85, e), lerp(0.05, 0.1, e), 0);
    const Fv = tgt.sub(pos).normalize();
    pos.addScaledVector(Fv, 0.08 * f.a.kick);
    const R = new THREE.Vector3().crossVectors(Fv, new THREE.Vector3(0, 1, 0)).normalize();
    const U = new THREE.Vector3().crossVectors(R, Fv);
    this.cam = { pos, R, U, F: Fv };
  }

  /** World → screen px (logical). */
  private project(p: THREE.Vector3) {
    const d = p.clone().sub(this.cam.pos);
    const z = d.dot(this.cam.F);
    const x = d.dot(this.cam.R) / z / (TANF * (W / H));
    const y = d.dot(this.cam.U) / z / TANF;
    return { x: W / 2 + (x * W) / 2, y: H / 2 - (y * H) / 2, z };
  }

  /** Most recent glyph onset (for punches). */
  private lastSlam(t: number) {
    let r = -9;
    for (const x of this.ts) if (t >= x) r = x;
    return r;
  }

  /** The mask's orientation: beaming at the camera, nodding on every beat and on each word. */
  private maskRot(t: number, beatPhase: number) {
    const nod =
      0.06 * pulse(t, this.ts[SEG.great[0]]!, 0.25) +
      0.06 * pulse(t, this.ts[SEG.q[0]]!, 0.25);
    const yaw = -0.32 + 0.06 * Math.sin(t * 0.9);
    const roll = 0.08 * Math.sin(t * 1.3) - 0.05;
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(-nod + 0.05, yaw, roll, "YXZ"),
    );
    return m;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    this.setCam(t, f);
    const u = this.pass.u;
    (u.camPos!.value as THREE.Vector3).copy(this.cam.pos);
    (u.camR!.value as THREE.Vector3).copy(this.cam.R);
    (u.camU!.value as THREE.Vector3).copy(this.cam.U);
    (u.camF!.value as THREE.Vector3).copy(this.cam.F);
    u.uT!.value = t;
    u.kick!.value = clamp(f.a.kick);
    u.beatPh!.value = f.beatPhase;
    // the sunburst ratchets one ray-step per beat (snap, then hold)
    u.rayRot!.value = t * 0.15;
    u.glow!.value = pulse(t, this.ts[SEG.great[0]]!, 0.3);
    const rot = this.maskRot(t, f.beatPhase);
    const punch = 1;
    u.mR!.value = MASK_R * punch;
    (u.mRot!.value as THREE.Matrix3).setFromMatrix4(rot.clone().invert());
    this.pass.render(this.ctx.renderer, out);

    // confetti sparks bursting off the rim on every beat
    this.sparks.clear();
    // (confetti removed: the scene read as pushy)
    this.sparks.render(this.ctx.renderer, out);

    this.L.clear();
    const c = this.L.ctx;
    c.textBaseline = "alphabetic";
    this.drawLine(c, t);
    this.drawMeter(c, t, f);
    this.ctx.comp.draw(this.ctx.renderer, this.L.upload(), out);

    const o: PostOverrides = {
      bloom: 0.7,
      bloomThreshold: 0.9,
      vignette: 0.5,
      grain: 0.06,
      ca: 1.1,
    };
    const slam = pulse(t, this.lastSlam(t), 0.07);
    // the downbeat of 素 punches through scale + shake only (no full-frame flash)
    const hit = pulse(t, this.ts[SEG.great[0]]!, 0.09);
    o.zoom = 1 + 0.015 * f.a.kick + 0.025 * slam + 0.035 * hit;
    const sh = 10 * slam + 8 * hit;
    if (sh > 0.5) o.shake = [noise1(t * 60, 1) * sh, noise1(t * 60, 2) * sh];
    return o;
  }

  private drawConfetti(t: number) {
    const au = this.ctx.audio;
    const N = 7;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU + 0.4;
      const headAt = (tb: number) => {
        const local = new THREE.Vector3(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0.05)
          .applyMatrix4(this.maskRot(tb, au.beatAt(tb) - Math.floor(au.beatAt(tb))))
          .multiplyScalar(MASK_R)
          .add(MASK_C);
        void tb;
        const s = this.project(local);
        return s.z > 0.1 ? { x: s.x, y: s.y } : null;
      };
      const rate = (tb: number) => {
        const bt = au.timeOfBeat(Math.floor(au.beatAt(tb)));
        return 520 * Math.exp(-(tb - bt) / 0.07) * (tb > this.ctx.start ? 1 : 0);
      };
      sparkParticles(this.sparks, t, headAt, {
        rate,
        rateMax: 520,
        life: 0.7,
        speed: 520,
        gravity: 700,
        intensity: 0.9,
        seed: 11 + k * 7,
        width: 2.2,
      });
    }
  }

  // ---------------------------------------------------------------- the line
  private glyphSlam(
    c: CanvasRenderingContext2D,
    ch: string,
    x: number,
    base: number,
    size: number,
    ts: number,
    t: number,
    col: (hot: number) => string,
    amt = 0.45,
  ) {
    if (t < ts) return;
    const k = prog(t, ts, ts + 0.22, ease.outExpo);
    const s = lerp(1 + amt, 1, k);
    const cx = x + size / 2,
      cy = base - size * 0.4;
    c.save();
    c.translate(cx, cy);
    c.scale(s, s);
    c.translate(-cx, -cy);
    c.globalAlpha = 1;
    c.fillStyle = col(1 - smoothstep(ts + 0.05, ts + 0.3, t));
    c.fillText(ch, x, base);
    c.restore();
  }

  private drawLine(c: CanvasRenderingContext2D, t: number) {
    const ts = this.ts,
      ch = this.w.w;
    // 「素晴らしい — signal orange, huge, top band
    const gS = 176,
      gx = 150,
      gBase = 296;
    c.font = font(this.famBig, gS);
    // the opening bracket, small and bone
    if (t >= ts[0]!) {
      c.save();
      c.font = font(F.jp(700), gS * 0.62);
      c.fillStyle = rgba("bone", 0.9 * prog(t, ts[0]!, ts[0]! + 0.08));
      c.fillText("「", gx - gS * 0.5, gBase - gS * 0.55);
      c.restore();
    }
    c.font = font(this.famBig, gS);
    for (let i = SEG.great[0]; i < SEG.great[1]; i++) {
      const g = this.greatLay.glyphs[i - SEG.great[0]]!;
      // the held note: the whole word swells a hair while it is sung
      this.glyphSlam(
        c,
        ch[i]!,
        gx + (g.x / 100) * gS,
        gBase,
        gS,
        ts[i]!,
        t,
        (h) => (h > 0.02 ? hotCol(h) : rgba("signal")),
        0.6,
      );
    }
    // 質問ですね」 — bone, under it
    const qS = 150,
      qx = 158,
      qBase = 560;
    c.font = font(this.famBig, qS);
    for (let i = SEG.q[0]; i <= SEG.q1; i++) {
      const g = this.qLay.glyphs[i - SEG.q[0]]!;
      this.glyphSlam(
        c,
        ch[i]!,
        qx + (g.x / 100) * qS,
        qBase,
        qS,
        ts[i]!,
        t,
        (h) => (h > 0.02 ? boneHot(h) : rgba("bone")),
        0.45,
      );
    }
    // と君は言う — deadpan serif, small
    const sS = 76,
      sx = 164,
      sBase = 742;
    c.font = font(F.jpSerif(600), sS);
    let x = sx;
    for (let i = SEG.said[0]; i < SEG.said[1]; i++) {
      const tt = ts[i]!;
      if (t >= tt) {
        c.fillStyle = rgba("bone", 0.92 * prog(t, tt, tt + 0.1));
        c.fillText(ch[i]!, x, sBase + 14 * (1 - ease.outExpo(prog(t, tt, tt + 0.25))));
      }
      x += sS;
    }
    // footnote rule + mono annotation
    if (t >= ts[SEG.said[0]]!) {
      const a = prog(t, ts[SEG.said[0]]!, ts[SEG.said[0]]! + 0.3);
      c.fillStyle = rgba("ash", 0.5 * a);
      c.fillRect(sx, sBase + 36, 380 * ease.outExpo(a), 1);
      c.font = font(F.mono(400), 14);
      c.letterSpacing = "3px";
      c.fillStyle = rgba("ash", 0.75 * a);
      c.fillText("* RESPONSE OPENER  ·  P = 0.93  ·  CACHED", sx, sBase + 64);
      c.letterSpacing = "0px";
    }
  }

  // ---------------------------------------------------------------- applause meter
  private drawMeter(c: CanvasRenderingContext2D, t: number, f: Frame) {
    const au = this.ctx.audio;
    const nb = Math.max(1, this.b1 - this.b0);
    const bi = clamp(Math.floor(f.beat) - this.b0, 0, nb);
    const step = (bi + ease.outExpo(clamp(f.beatPhase * 5))) / nb;
    const v = lerp(0.52, 0.97, clamp(step));
    void au;
    const x0 = 164,
      y0 = 1000,
      n = 24,
      bw = 12,
      gap = 6;
    const a = smoothstep(this.ctx.start, this.ctx.start + 0.3, t);
    c.save();
    c.globalAlpha = a;
    c.font = font(F.mono(500), 14);
    c.letterSpacing = "3px";
    c.fillStyle = rgba("ash", 0.85);
    c.fillText("SYCOPHANCY", x0, y0 - 74);
    c.font = font(F.jp(400), 15);
    c.letterSpacing = "0px";
    c.fillStyle = rgba("ash", 0.7);
    c.fillText("迎合度", x0 + 170, y0 - 74);
    // bars
    for (let i = 0; i < n; i++) {
      const lit = i / n < v;
      const hot = i / n > 0.8;
      const hh = 26 + i * 1.6;
      const fl = lit && hot ? 0.75 + 0.25 * hash(frameIdx(t), i) : 1;
      c.fillStyle = lit
        ? rgba(hot ? "signal" : "bone", (hot ? 1 : 0.85) * fl)
        : rgba("graphite", 0.6);
      c.fillRect(x0 + i * (bw + gap), y0 - hh, bw, hh);
    }
    // value
    c.font = font(F.mono(500), 64);
    c.fillStyle = rgba("signal");
    const vx = x0 + n * (bw + gap) + 24;
    c.fillText(v.toFixed(2), vx, y0);
    c.font = font(F.mono(400), 13);
    c.letterSpacing = "2px";
    c.fillStyle = rgba("ash", 0.7);
    c.fillText("APPLAUSE / TOKEN", vx, y0 + 30);
    c.fillText("0.00", x0, y0 + 30);
    c.restore();
  }
}

/** bone ← signal for a freshly slammed bone glyph (stays below bloom). */
function boneHot(k: number) {
  return `rgb(${Math.round(lerp(238, 255, k))},${Math.round(lerp(233, 77, k))},${Math.round(lerp(223, 18, k))})`;
}

/** signal → white-hot for a freshly slammed glyph (Canvas2D, sRGB). */
function hotCol(k: number) {
  const r = 255,
    g = Math.round(lerp(77, 236, k)),
    b = Math.round(lerp(18, 210, k));
  return `rgb(${r},${g},${b})`;
}
