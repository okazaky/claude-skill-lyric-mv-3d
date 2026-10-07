// s05 「温度を上げたら 嘘をついた」 — Temperature.
//  A raymarched, engraved sampling dial (knurled knob on a machined plate with a T scale) sits on a
//  floor of isotherm contours. The knob clicks up on the beats of 温度を上げたら (T 0.70 → 1.80); the
//  contours boil and wobble (bone hairlines; heat() only on a few crests) and a heat haze shimmers.
//  On 嘘 the camera drops low and close, 嘘 slams in huge and white-hot, and melts (drips) through をついた.
import * as THREE from "three";
import { Scene, type Frame } from "../engine/scene";
import { FSPass, Layer2D, W, makeRT } from "../engine/gl";
import { rgba } from "../engine/palette";
import { F, font, layout, type TextLayout } from "../engine/type";
import { Lyrics, type Line, type Word } from "../engine/lyrics";
import { clamp, ease, lerp, prog, pulse, frameIdx, hash, noise1 } from "../engine/util";
import {
  type Cam,
  type V3,
  focalFor,
  lookAt,
  project,
  camUniforms,
  setCam,
  sub,
  mul,
  nrm,
} from "./s05-cam";
import { FRAG_DIAL, FRAG_HAZE, A0, SWEEP, PLATE_R } from "./s05-glsl";

const T_LO = 0.7,
  T_HI = 1.8;
const FOCAL = focalFor(34);

export default class S05 extends Scene {
  dial = new FSPass(FRAG_DIAL, {
    ...camUniforms(),
    knobT: { value: 0.7 },
    knobA: { value: 0 },
    heatK: { value: 0 },
    kick: { value: 0 },
    lieK: { value: 0 },
    keyDir: { value: new THREE.Vector3() },
  });
  haze = new FSPass(FRAG_HAZE, {
    sceneTex: { value: null },
    aTex: { value: null },
    bTex: { value: null },
    time: { value: 0 },
    heatK: { value: 0 },
    melt: { value: 0 },
    lieK: { value: 0 },
    kick: { value: 0 },
  });
  rt = makeRT();
  la = new Layer2D();
  lb = new Layer2D();
  L!: Line;
  w0!: Word;
  w1!: Word;
  steps: number[] = [];
  lieT = 0;
  layA!: TextLayout;
  layB!: TextLayout;
  readonly szA = 124;
  readonly szLie = 560;
  readonly szB = 150;

  override init() {
    const { lyrics, audio } = this.ctx;
    this.L = lyrics.get("温度を上げたら");
    this.w0 = this.L.words[0]!;
    this.w1 = this.L.words[1]!;
    this.lieT = this.w1.start;
    // the knob clicks on every beat of 温度を上げたら, the last click lands on 嘘
    const b0 = Math.ceil(audio.beatAt(this.w0.start - 0.05));
    for (let b = b0; audio.timeOfBeat(b) < this.lieT - 0.2; b++)
      this.steps.push(audio.timeOfBeat(b));
    this.steps.push(this.lieT);
    this.layA = layout(this.w0.w, F.jp(900), this.szA, -4);
    this.layB = layout(this.w1.w.slice(1), F.jp(900), this.szB, -4);
  }

  temp(t: number) {
    const n = this.steps.length;
    let T = T_LO;
    for (const s of this.steps)
      T += ((T_HI - T_LO) / n) * prog(t, s - 0.03, s + 0.22, (x) => ease.outBack(x, 2.2));
    return T;
  }

  camera(t: number, kick: number): Cam {
    const { start, end } = this.ctx;
    const p = prog(t, start, end);
    const lie = prog(t, this.lieT - 0.04, this.lieT + 0.4, ease.outExpo);
    const phi =
      lerp(-2.15, -1.7, ease.inOutQuad(p)) +
      lie * 0.35 +
      (t - this.lieT > 0 ? (t - this.lieT) * 0.08 : 0);
    const D = lerp(lerp(16.5, 13.5, ease.outCubic(p)), 9.5, lie) * (1 - 0.035 * kick);
    const h = lerp(lerp(9.0, 7.2, p), 3.0, lie);
    const tgt: V3 = [0, 0, lerp(0.4, 1.1, lie)];
    const pos: V3 = [tgt[0] + D * Math.cos(phi), tgt[1] + D * Math.sin(phi), h];
    // compose: the dial sits right of centre (aim left of it)
    const fw = nrm(sub(tgt, pos));
    const right = nrm([fw[1], -fw[0], 0]);
    const off = lerp(3.4, 2.4, lie);
    const aim: V3 = [
      tgt[0] + right[0] * -off,
      tgt[1] + right[1] * -off,
      tgt[2] - lerp(0.6, 0.2, lie),
    ];
    const roll =
      lerp(-0.02, 0.07, lie) + noise1(t * 0.7, 5) * 0.012 + pulse(t, this.lieT, 0.12) * 0.05;
    return lookAt(pos, aim, roll, FOCAL);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t;
    const kick = clamp(f.a.kick);
    const T = this.temp(t);
    const heatK =
      clamp((T - T_LO) / (T_HI - T_LO)) * 0.85 + 0.15 * prog(t, this.lieT, this.ctx.end);
    const lieK = pulse(t, this.lieT, 0.3);
    const cam = this.camera(t, kick);

    const u = this.dial.u;
    setCam(u, cam, t);
    u.knobT!.value = T;
    u.knobA!.value = A0 - (T / 2) * SWEEP;
    u.heatK!.value = heatK;
    u.kick!.value = kick;
    u.lieK!.value = lieK;
    (u.keyDir!.value as THREE.Vector3).set(...nrm([-0.5, 0.35, 0.8]));
    this.dial.render(renderer, this.rt);

    this.la.clear();
    this.lb.clear();
    this.drawScaleLabels(this.la.ctx, cam, T);
    this.drawReadout(this.la.ctx, t, T);
    this.drawLineA(this.la.ctx, t);
    this.drawLie(this.lb.ctx, t, this.la.ctx);

    const hu = this.haze.u;
    hu.sceneTex!.value = this.rt.texture;
    hu.aTex!.value = this.la.upload();
    hu.bTex!.value = this.lb.upload();
    hu.time!.value = t;
    hu.heatK!.value = heatK;
    hu.melt!.value = prog(t, this.w1.syl![1]![0], Math.min(this.w1.end, this.ctx.end) - 0.03, ease.inOutQuad);
    hu.lieK!.value = lieK;
    hu.kick!.value = kick;
    this.haze.render(renderer, out);

    const s = pulse(t, this.lieT, 0.09) * 16 + kick * 3;
    const shake: [number, number] = [s * Math.sin(t * 93), s * Math.cos(t * 77)];
    return {
      bloom: 0.75,
      vignette: 0.45,
      grain: 0.06,
      flash: 0.02 * pulse(t, this.lieT, 0.03),
      shake,
    };
  }

  /** Mono numerals of the dial scale, pinned to the plate in perspective. */
  private drawScaleLabels(c: CanvasRenderingContext2D, cam: Cam, T: number) {
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (let k = 0; k <= 4; k++) {
      const v = k * 0.5;
      const a = A0 - (v / 2) * SWEEP;
      const r = PLATE_R - 0.2;
      const p = project(cam, [Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, 0.02]);
      if (p.z <= 0.5) continue;
      const sz = clamp((260 / p.z) * 4.2, 12, 34);
      c.font = font(F.mono(500), sz);
      c.fillStyle = v <= T + 1e-3 ? rgba("signal", 0.95) : rgba("bone", 0.55);
      c.fillText(v.toFixed(1), p.x, p.y);
    }
    // the knob's own label
    const lp = project(cam, [0, 0, 1.35]);
    if (lp.z > 0.5) {
      c.font = font(F.mono(500), 14);
      c.letterSpacing = "3px";
      c.fillStyle = rgba("ash", 0.8);
      c.fillText("TEMPERATURE", lp.x, lp.y + 230 * (10 / lp.z));
      c.letterSpacing = "0px";
    }
    c.restore();
  }

  /** Top-right instrument readout: the sampling temperature, deadpan. */
  private drawReadout(c: CanvasRenderingContext2D, t: number, T: number) {
    const x = W - 120;
    const hot = T > 1.5;
    c.save();
    c.textAlign = "right";
    c.textBaseline = "alphabetic";
    c.font = font(F.mono(500), 15);
    c.letterSpacing = "3px";
    c.fillStyle = rgba("ash", 0.85);
    c.fillText("SAMPLING · temperature", x, 132);
    c.letterSpacing = "0px";
    // jitter the last digit once it runs hot (frame-keyed flicker)
    const j = hot ? (hash(frameIdx(t), 7) - 0.5) * 0.04 * (T - 1.5) : 0;
    c.font = font(F.mono(300), 132);
    c.fillStyle = hot ? rgba("signal", 1) : rgba("bone", 0.92);
    c.fillText(`T=${(Math.min(T, T_HI) + j).toFixed(2)}`, x, 262);
    c.font = font(F.mono(400), 17);
    c.fillStyle = rgba("graphite", 1);
    c.fillText("top_p 0.95 · seed 0x2A · max_tokens 256", x, 300);
    // bar: 0..2
    const bw = 520,
      by = 326;
    c.fillStyle = rgba("bone", 0.18);
    c.fillRect(x - bw, by, bw, 2);
    c.fillStyle = rgba("signal", 1);
    c.fillRect(x - bw, by - 1, bw * clamp(T / 2), 4);
    if (t >= this.lieT) {
      const k = prog(t, this.lieT, this.lieT + 0.15);
      c.font = font(F.mono(600), 17);
      c.fillStyle = rgba("signal", k);
      const label = "factuality  0.31   hallucination  LIKELY";
      c.fillText(label, x, 362);
      // warning triangle drawn as a path (no symbol glyphs from the fonts)
      const tx = x - c.measureText(label).width - 22;
      c.beginPath();
      c.moveTo(tx, 348);
      c.lineTo(tx + 8, 362);
      c.lineTo(tx - 8, 362);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  /** 温度を上げたら: per-character, sung char in signal, done in bone. */
  private drawLineA(c: CanvasRenderingContext2D, t: number) {
    const w = this.w0;
    const a = prog(t, w.start - 0.4, w.start);
    if (a <= 0) return;
    const p = Lyrics.wordProgress(w, t);
    const n = w.w.length;
    const x0 = 120,
      y0 = 236;
    c.save();
    c.font = font(F.jp(900), this.szA);
    c.textBaseline = "alphabetic";
    for (let i = 0; i < n; i++) {
      const g = this.layA.glyphs[i]!;
      const k = clamp(p * n - i);
      // each char rises a little as it is sung (the temperature going up)
      const lift = (1 - ease.outExpo(clamp(k * 3))) * 18 * (k > 0 ? 1 : 0);
      c.fillStyle = k <= 0 ? rgba("bone", 0.2 * a) : k < 1 ? rgba("signal", 1) : rgba("bone", 0.93);
      c.fillText(g.ch, x0 + g.x, y0 + lift - (k >= 1 ? 0 : 0));
    }
    c.restore();
  }

  /** 嘘をついた, drawn white: the haze pass colours it hot and melts it. */
  private drawLie(c: CanvasRenderingContext2D, t: number, bed: CanvasRenderingContext2D) {
    const w = this.w1;
    const a = prog(t, w.start - 0.4, w.start);
    if (a <= 0) return;
    const p = Lyrics.wordProgress(w, t);
    const n = w.w.length;
    const x0 = 112,
      base = 868;
    c.save();
    c.textBaseline = "alphabetic";
    // 嘘: the slam (scale from 1.35 to 1 on the vocal)
    const k0 = clamp(p * n);
    const sl = t < w.start ? 1 : 1 + 0.35 * (1 - ease.outExpo(prog(t, w.start, w.start + 0.22)));
    c.save();
    c.translate(x0 + this.szLie * 0.5, base - this.szLie * 0.4);
    c.scale(sl, sl);
    c.font = font(F.jp(900), this.szLie);
    c.fillStyle = `rgba(255,255,255,${k0 > 0 ? 1 : 0.16 * a})`;
    c.fillText("嘘", -this.szLie * 0.5, this.szLie * 0.4);
    c.restore();
    // a dark ink bed under the lie (in the steady layer) so it reads against the bright engraving
    const bedA = 0.85 * (k0 > 0 ? 1 : 0.3 * a);
    bed.save();
    bed.lineJoin = "round";
    bed.strokeStyle = rgba("ink", bedA);
    bed.fillStyle = rgba("ink", bedA);
    bed.translate(x0 + this.szLie * 0.5, base - this.szLie * 0.4);
    bed.scale(sl, sl);
    bed.font = font(F.jp(900), this.szLie);
    bed.lineWidth = 44;
    bed.strokeText("嘘", -this.szLie * 0.5, this.szLie * 0.4);
    bed.fillText("嘘", -this.szLie * 0.5, this.szLie * 0.4);
    bed.restore();
    // をついた: per character
    const bx = x0 + this.szLie + 26;
    c.font = font(F.jp(900), this.szB);
    for (let i = 1; i < n; i++) {
      const g = this.layB.glyphs[i - 1]!;
      const k = clamp(p * n - i);
      c.fillStyle = `rgba(255,255,255,${k > 0 ? 0.55 + 0.45 * k : 0.14 * a})`;
      c.fillText(g.ch, bx + g.x, base);
      bed.save();
      bed.lineJoin = "round";
      bed.font = c.font;
      bed.lineWidth = 22;
      bed.strokeStyle = rgba("ink", 0.85 * (k > 0 ? 1 : 0.3 * a));
      bed.strokeText(g.ch, bx + g.x, base);
      bed.restore();
    }
    c.restore();
  }
}

