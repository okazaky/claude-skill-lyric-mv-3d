// s01 — 「午前三時 君に打ち込む」(intro included).
// A vast dark void over an engraved floor grid. A huge 7-segment 03:00 hangs in space, its
// numerals cut in burin hatching, the colon blinking signal-orange on the beat. The camera dollies
// slowly toward a floating prompt bar with a single blinking cursor. 午前三時 lands character by
// character on the vocal; then the camera snaps down to the bar and 君に打ち込む is typed into it,
// in 3D perspective (the bar's face is a canvas texture sampled by the raymarcher).
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { FSPass, Layer2D, W, H } from "../engine/gl";
import { rgba } from "../engine/palette";
import { F, font, layout, measure, type TextLayout } from "../engine/type";
import type { Word } from "../engine/lyrics";
import { clamp, ease, lerp, prog, pulse, smoothstep, frameIdx, hash } from "../engine/util";
import { S01_FRAG } from "./s01-glsl";

const FOV = 40;
const TANF = Math.tan(((FOV / 2) * Math.PI) / 180);
const BAR = { pos: new THREE.Vector3(0, 1.3, -3.5), half: new THREE.Vector3(3.2, 0.42, 0.08) };
const BAR_TEX = { w: 1600, h: 210 };
const CLOCK = { pos: new THREE.Vector3(0, 9, -36), s: 6.5 };

interface CamKey {
  t: number;
  pos: [number, number, number];
  tgt: [number, number, number];
  e?: (x: number) => number;
}

export default class S01 extends Scene {
  private L = new Layer2D();
  private barL = new Layer2D(BAR_TEX.w, BAR_TEX.h);
  private pass!: FSPass;
  private wTime!: Word; // 午前三時
  private wType!: Word; // 君に打ち込む
  private keysCam: CamKey[] = [];
  private timeLay!: TextLayout;
  private famBig = F.jp(900);
  private famBar = F.jp(700);

  override init() {
    const ly = this.ctx.lyrics;
    const line = ly.get("午前三時");
    this.wTime = line.words[0]!;
    this.wType = line.words[1]!;
    this.timeLay = layout(this.wTime.w, this.famBig, 100);
    const t1 = this.wTime.start,
      t2 = this.wType.start;
    this.keysCam = [
      { t: 0, pos: [0.0, 1.2, 15.5], tgt: [0, 6.2, -36] },
      { t: t1 - 0.05, pos: [0.45, 1.0, 9.0], tgt: [0, 6.6, -36], e: ease.inOutQuad },
      { t: t2 - 0.12, pos: [0.7, 0.95, 7.4], tgt: [0.05, 6.9, -36], e: ease.outCubic },
      { t: t2 + 0.38, pos: [1.9, 2.3, 2.9], tgt: [0.25, 2.7, -6], e: ease.inOutCubic },
      { t: this.ctx.end + 0.1, pos: [1.35, 2.0, 1.5], tgt: [0.1, 2.2, -4.5], e: ease.linear },
    ];
    this.pass = new FSPass(S01_FRAG, {
      camPos: { value: new THREE.Vector3() },
      camR: { value: new THREE.Vector3() },
      camU: { value: new THREE.Vector3() },
      camF: { value: new THREE.Vector3() },
      tanF: { value: TANF },
      aspect: { value: W / H },
      uT: { value: 0 },
      kick: { value: 0 },
      ringR: { value: 0 },
      colonOn: { value: 1 },
      clockGlow: { value: 0 },
      barOn: { value: 1 },
      gridK: { value: 1 },
      clockPos: { value: CLOCK.pos.clone() },
      clockS: { value: CLOCK.s },
      barPos: { value: BAR.pos.clone() },
      barHalf: { value: BAR.half.clone() },
      barTex: { value: this.barL.texture },
    });
  }

  private cam(t: number) {
    const ks = this.keysCam;
    let i = 0;
    while (i < ks.length - 2 && t >= ks[i + 1]!.t) i++;
    const a = ks[i]!,
      b = ks[i + 1]!;
    const k = (b.e ?? ease.inOutCubic)(clamp((t - a.t) / Math.max(1e-3, b.t - a.t)));
    const pos = new THREE.Vector3(...a.pos).lerp(new THREE.Vector3(...b.pos), k);
    const tgt = new THREE.Vector3(...a.tgt).lerp(new THREE.Vector3(...b.tgt), k);
    return { pos, tgt };
  }

  /** Number of characters of a word whose syllable has started at t. */
  private typed(w: Word, t: number) {
    const s = w.syl ?? [];
    let n = 0;
    for (const [a] of s) if (t >= a - 1e-4) n++;
    return Math.min(n, w.w.length);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const au = this.ctx.audio;
    const { pos, tgt } = this.cam(t);
    // kick nudge: the camera breathes forward a hair on each kick
    const kick = f.a.kick;
    const Fv = tgt.clone().sub(pos).normalize();
    pos.addScaledVector(Fv, 0.06 * kick);
    const R = new THREE.Vector3().crossVectors(Fv, new THREE.Vector3(0, 1, 0)).normalize();
    const U = new THREE.Vector3().crossVectors(R, Fv);
    const u = this.pass.u;
    (u.camPos!.value as THREE.Vector3).copy(pos);
    (u.camR!.value as THREE.Vector3).copy(R);
    (u.camU!.value as THREE.Vector3).copy(U);
    (u.camF!.value as THREE.Vector3).copy(Fv);
    u.uT!.value = t;
    u.kick!.value = clamp(kick * 1.2);
    const bt = au.timeOfBeat(Math.floor(au.beatAt(t)));
    u.ringR!.value = (t - bt) * 34;
    // colon: on for the first half of every beat; held on (hot) while 午前三時 is sung
    const sing = t >= this.wTime.start && t < this.wTime.end + 0.1;
    u.colonOn!.value = sing ? 1 : f.beatPhase < 0.5 ? 1 : 0.08;
    u.clockGlow!.value = 2.5 * pulse(t, this.wTime.start, 0.18);
    u.gridK!.value = smoothstep(0, 1.6, t) * (1 + 0.5 * f.a.low);

    this.drawBar(t, f);
    this.barL.upload();
    this.pass.render(this.ctx.renderer, out);

    this.drawOverlay(t, f);
    this.ctx.comp.draw(this.ctx.renderer, this.L.upload(), out);

    const o: PostOverrides = {
      bloom: 0.65,
      bloomThreshold: 0.9,
      vignette: 0.55,
      grain: 0.06,
      ca: 1.0,
    };
    o.zoom =
      1 +
      0.012 * kick +
      0.03 * pulse(t, this.wTime.start, 0.12) +
      0.02 * pulse(t, this.wType.start, 0.1);
    o.fade = 1 - smoothstep(0, 0.6, t);
    return o;
  }

  // ------------------------------------------------------------ the bar's face (texture)
  private drawBar(t: number, f: Frame) {
    const L = this.barL,
      c = L.ctx;
    L.clear();
    const { w: BW, h: BH } = BAR_TEX;
    // engraved panel fill (same as the s09 bar): faint diagonal hatch, denser toward the lower edge
    c.save();
    c.lineWidth = 2;
    for (let i = -BH; i < BW; i += 9) {
      c.strokeStyle = rgba("bone", 0.035);
      c.beginPath();
      c.moveTo(i, BH);
      c.lineTo(i + BH, 0);
      c.stroke();
    }
    const g = c.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, BW, BH);
    c.restore();
    // prompt chevron (signal, as in s09)
    c.font = font(F.mono(500), 72);
    c.fillStyle = rgba("signal", 1);
    c.textBaseline = "alphabetic";
    c.fillText("›", 44, 134);
    const n = this.typed(this.wType, t);
    const x0 = 120,
      base = 142,
      size = 104;
    c.font = font(this.famBar, size);
    let cx = x0;
    if (n === 0) {
      c.font = font(this.famBar, 58);
      c.fillStyle = rgba("ash", 0.4);
      c.fillText("メッセージを入力", x0 + 34, 126);
    } else {
      const s = this.wType.w.slice(0, n);
      c.fillStyle = rgba("bone", 1);
      c.fillText(s, x0, base);
      // the freshest character arrives hot and cools to bone
      const last = this.wType.syl![n - 1]![0];
      const hot = 1 - smoothstep(last, last + 0.18, t);
      if (hot > 0) {
        const xs = x0 + measure(s.slice(0, n - 1), this.famBar, size);
        c.fillStyle = rgba("signal", hot);
        c.fillText(s[n - 1]!, xs, base);
      }
      cx = x0 + measure(s, this.famBar, size) + 8;
    }
    // cursor: blinks on the 8ths while idle, solid while typing
    const typing = t >= this.wType.start - 0.05 && t < this.wType.end + 0.2;
    const on = typing || (f.beat * 2) % 2 < 1;
    if (on) {
      c.fillStyle = rgba("signal", 1);
      c.fillRect(n === 0 ? x0 + 4 : cx, 38, 16, 122);
    }
    // ⏎ return key at the right end (the same glyph s09 presses at dawn)
    const kx = BW - 100,
      ky = BH / 2;
    c.strokeStyle = rgba("bone", 0.7);
    c.lineWidth = 6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(kx + 34, ky - 32);
    c.lineTo(kx + 34, ky + 10);
    c.lineTo(kx - 34, ky + 10);
    c.moveTo(kx - 14, ky - 10);
    c.lineTo(kx - 34, ky + 10);
    c.lineTo(kx - 14, ky + 30);
    c.stroke();
    // tiny token counter
    c.font = font(F.mono(400), 22);
    c.fillStyle = rgba("ash", 0.6);
    c.fillText(`${String(n).padStart(2, "0")} / 4096 tok`, BW - 330, BH - 22);
  }

  // ------------------------------------------------------------ overlay type + HUD
  private drawOverlay(t: number, f: Frame) {
    const L = this.L,
      c = L.ctx;
    L.clear();
    c.textBaseline = "alphabetic";
    this.drawHud(c, t, f);
    this.drawTimeWord(c, t);
  }

  private drawHud(c: CanvasRenderingContext2D, t: number, f: Frame) {
    const a = smoothstep(0.2, 1.0, t);
    c.save();
    c.globalAlpha = a;
    c.font = font(F.mono(500), 15);
    c.letterSpacing = "3px";
    c.fillStyle = rgba("ash", 0.75);
    const sec = Math.floor(t);
    c.fillText(`LOCAL  03:00:${String(sec).padStart(2, "0")}  AM`, 96, 84);
    // USERS ONLINE: top-right while 午前三時 sits big at the bottom-left; once the word lifts
    // (and the late shot fills the top-right with the clock) it moves bottom-left, under the bar
    const lift = prog(t, this.wType.start - 0.05, this.wType.start + 0.25);
    c.globalAlpha = a * (1 - lift);
    c.textAlign = "right";
    c.fillText("USERS ONLINE  1", W - 96, 84);
    c.textAlign = "left";
    c.globalAlpha = a * lift;
    c.fillText("USERS ONLINE  1", 96, H - 44);
    c.globalAlpha = a;
    // tiny depth readout bottom-left (the dolly)
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba("graphite", 1);
    const z = this.cam(t).pos.z;
    c.fillText(
      `cam z ${z.toFixed(2)} m   beat ${String(Math.max(0, Math.floor(f.beat)) + 1).padStart(3, "0")}`,
      W - 380,
      H - 70,
    );
    // flicker on the frame counter only
    const fl = 0.6 + 0.4 * hash(frameIdx(t), 7);
    c.fillStyle = rgba("signal", fl);
    c.fillRect(W - 380, H - 100, 8, 8);
    c.fillStyle = rgba("ash", 0.6);
    c.fillText("REC", W - 364, H - 92);
    c.restore();
  }

  /** 午前三時: lands per character on the vocal (big, lower left), then lifts to the top left as the typing starts. */
  private drawTimeWord(c: CanvasRenderingContext2D, t: number) {
    const w = this.wTime;
    if (t < w.start - 0.02) return;
    const syl = w.syl ?? [];
    const lift = ease.outExpo(prog(t, this.wType.start - 0.05, this.wType.start + 0.2));
    // lifted: small, in the strip between the HUD line and the clock's top edge, left of the first
    // digit (the clock fills x > ~360 from 4.1 s and the whole top-right in the late shot)
    const size = lerp(225, 80, lift);
    const x0 = lerp(118, 92, lift);
    const base = lerp(H - 112, 160, lift);
    const lay = this.timeLay;
    c.save();
    c.font = font(this.famBig, size);
    for (let i = 0; i < w.w.length; i++) {
      // 午 and 前 share the first sung onset: stagger them by a frame so each one lands
      const ts = (syl[i]?.[0] ?? w.start) + (i === 0 ? 0 : i === 1 ? 0.05 : 0);
      if (t < ts) continue;
      const k = prog(t, ts, ts + 0.24, ease.outExpo);
      const s = lerp(1.35, 1, k);
      const gx = x0 + (lay.glyphs[i]!.x / 100) * size;
      const gw = (lay.glyphs[i]!.w / 100) * size;
      const hot = 1 - smoothstep(ts + 0.06, ts + 0.3, t);
      c.save();
      c.translate(gx + gw / 2, base - size * 0.38);
      c.scale(s, s);
      c.translate(-(gx + gw / 2), -(base - size * 0.38));
      c.globalAlpha = 1;
      c.fillStyle = hot > 0.02 ? mixCol(hot) : rgba("bone");
      c.fillText(w.w[i]!, gx, base);
      c.restore();
    }
    // annotation under the word (mono: numbers/English only)
    c.font = font(F.mono(400), lerp(16, 13, lift));
    c.letterSpacing = "3px";
    // the annotation only lives under the big word; it leaves as the word lifts (no room by the clock)
    c.fillStyle = rgba("ash", 0.7 * smoothstep(w.start, w.start + 0.4, t) * (1 - lift));
    c.fillText("03:00 AM  ·  T+0.00  ·  1 WINDOW OPEN", x0 + 6, base + 44);
    c.restore();
  }
}

/** bone → signal for a hot glyph (Canvas2D, sRGB). */
function mixCol(k: number) {
  const r = Math.round(lerp(238, 255, k)),
    g = Math.round(lerp(233, 77, k)),
    b = Math.round(lerp(223, 18, k));
  return `rgb(${r},${g},${b})`;
}
