// s06 「ないはずの本を 教えてくれた」 — The phantom book.
//  An endless library corridor of engraved shelves (raymarched); the camera dollies hard down the aisle,
//  brakes on 本 and turns to the one book that glows signal orange. Over 教えてくれた a citation card
//  wires itself to the book (invented title, ISBN …404), NOT FOUND is stamped on the beat, and on the
//  held た the book is sliced into hairlines that drift out into the aisle.
import * as THREE from "three";
import { Scene, type Frame } from "../engine/scene";
import { FSPass, Layer2D } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, type TextLayout } from "../engine/type";
import { Lyrics, type Line, type Word } from "../engine/lyrics";
import { clamp, ease, lerp, prog, pulse, frameIdx, hash, noise1 } from "../engine/util";
import { type Cam, type V3, focalFor, lookAt, project, camUniforms, setCam, nrm } from "./s05-cam";
import { FRAG_LIB, bookCentre, BOOK_H } from "./s06-glsl";

const FOCAL = focalFor(52);
const DOLLY = 30; // world units travelled before the stop

export default class S06 extends Scene {
  lib = new FSPass(FRAG_LIB, {
    ...camUniforms(),
    glow: { value: 0 },
    dissolve: { value: 0 },
    kick: { value: 0 },
    fogK: { value: 0.065 },
    keyDir: { value: new THREE.Vector3() },
  });
  lines = new LineBatch(4000);
  layer = new Layer2D();
  L!: Line;
  w0!: Word;
  w1!: Word;
  tHon = 0;
  tStop = 0;
  tStamp = 0;
  tDis0 = 0;
  tDis1 = 0;
  lay0!: TextLayout;
  lay1!: TextLayout;
  layWo!: TextLayout;
  readonly sz = 112;
  readonly szHon = 250;

  override init() {
    const { lyrics, audio, end } = this.ctx;
    this.L = lyrics.get("ないはずの本を");
    this.w0 = this.L.words[0]!;
    this.w1 = this.L.words[1]!;
    this.tHon = this.w0.syl![5]![0];
    this.tStop = this.tHon + 0.45;
    // NOT FOUND stamps on the first beat after く
    this.tStamp = audio.timeOfBeat(Math.ceil(audio.beatAt(this.w1.syl![2]![0] - 0.05)));
    // the held た: the book dissolves, finishing with the end of 教えてくれた
    const wEnd = Math.min(this.w1.end, end);
    this.tDis0 = Math.max(this.w1.syl![5]![0], wEnd - 1.1);
    this.tDis1 = wEnd - 0.04;
    this.lay0 = layout("ないはずの", F.jpSerif(900), this.sz, -2);
    this.layWo = layout("を", F.jpSerif(900), this.sz, 0);
    this.lay1 = layout(this.w1.w, F.jp(900), this.sz, -4);
  }

  camera(t: number, kick: number): Cam {
    const { start } = this.ctx;
    const bc = bookCentre();
    // dolly: fast down the aisle, braking hard into 本
    const k = prog(t, start, this.tStop, (x) => 1 - Math.pow(1 - x, 3.2));
    const push = prog(t, this.tStop, this.ctx.end, ease.inOutQuad) * 0.9;
    const y = bc[1] - 3.4 - DOLLY * (1 - k) + push;
    const turn = prog(t, this.tHon - 0.1, this.tStop + 0.25, ease.inOutCubic);
    const bob = Math.sin(t * 9.0) * 0.025 * (1 - k) + kick * 0.03;
    const pos: V3 = [lerp(-0.35, -0.55, turn), y, 1.5 + bob];
    const ahead: V3 = [0.25, y + 10, 1.75];
    const tgt: V3 = [
      lerp(ahead[0], bc[0] + 0.2, turn),
      lerp(ahead[1], bc[1] + 0.9, turn),
      lerp(ahead[2], bc[2] + 0.15, turn),
    ];
    const roll = noise1(t * 0.8, 9) * 0.01 + (1 - k) * 0.02 * Math.sin(t * 3.0) - turn * 0.03;
    return lookAt(pos, tgt, roll, FOCAL * (1 + 0.02 * kick));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const kick = clamp(f.a.kick);
    const cam = this.camera(t, kick);
    const glow =
      0.25 +
      0.75 * prog(t, this.tHon - 0.05, this.tHon + 0.3, ease.outExpo) +
      0.4 * pulse(t, this.tStamp, 0.15);
    const dissolve = prog(t, this.tDis0, this.tDis1, ease.inQuad);

    const u = this.lib.u;
    setCam(u, cam, t);
    u.glow!.value = glow * (1 - 0.7 * dissolve);
    u.dissolve!.value = dissolve;
    u.kick!.value = kick;
    (u.keyDir!.value as THREE.Vector3).set(...nrm([0.3, 0.4, 0.85]));
    this.lib.render(renderer, out);

    this.lines.clear();
    if (dissolve > 0) this.drawStreaks(cam, t, dissolve);
    if (this.lines.count) this.lines.render(renderer, out);

    const c = this.layer.ctx;
    this.layer.clear();
    this.drawScrim(c);
    this.drawCallout(c, cam, t, dissolve);
    this.drawLyric(c, t);
    comp.draw(renderer, this.layer.upload(), out);

    const s = pulse(t, this.tStamp, 0.08) * 10;
    return {
      bloom: 0.7,
      vignette: 0.5,
      grain: 0.06,
      shake: [s * Math.sin(t * 91), s * Math.cos(t * 73)] as [number, number],
    };
  }

  /** Hairlines thrown off the book as it dissolves (2D, additive): one per slice, drifting into the aisle. */
  private drawStreaks(cam: Cam, t: number, d: number) {
    const bc = bookCentre();
    const n = 46;
    const sig = LIN.signal,
      emb = LIN.ember;
    for (let i = 0; i < n; i++) {
      const hs = hash(i, 17);
      const z = bc[2] + ((i + 0.5) / n - 0.5) * BOOK_H;
      const outv = d * d * (0.6 + 2.6 * hs);
      const a = project(cam, [bc[0] - 0.25 - outv, bc[1] - outv * 0.35 * (hs - 0.5), z]);
      const b = project(cam, [
        bc[0] - 0.25 - outv - 0.5 - 1.2 * d,
        bc[1] - outv * 0.35 * (hs - 0.5) - 0.1,
        z,
      ]);
      if (a.z < 0.2 || b.z < 0.2) continue;
      const I = (1 - d) * (0.6 + 0.8 * hash(i, frameIdx(t)));
      const col: [number, number, number] =
        hs > 0.5
          ? [sig[0] * 3 * I, sig[1] * 3 * I, sig[2] * 3 * I]
          : [emb[0] * 2.5 * I, emb[1] * 2.5 * I, emb[2] * 2.5 * I];
      this.lines.seg2(a.x, a.y, b.x, b.y, 1.1, col, 1);
    }
  }

  /** Dark gradient behind the lyric column so the type reads against the shelves. */
  private drawScrim(c: CanvasRenderingContext2D) {
    const g = c.createLinearGradient(0, 0, 900, 0);
    g.addColorStop(0, rgba("ink", 0.72));
    g.addColorStop(0.7, rgba("ink", 0.35));
    g.addColorStop(1, rgba("ink", 0));
    c.fillStyle = g;
    c.fillRect(0, 0, 900, 1080);
  }

  private drawLyric(c: CanvasRenderingContext2D, t: number) {
    const x0 = 120,
      y0 = 330,
      y1 = 560;
    const glyphCol = (k: number, a: number, hot = false) =>
      k <= 0 ? rgba("bone", 0.2 * a) : k < 1 || hot ? rgba("signal", 1) : rgba("bone", 0.93);
    // line 1: ないはずの + 本 (big, signal) + を, Noto Serif JP (a book's voice)
    const w0 = this.w0;
    const a0 = prog(t, w0.start - 0.45, w0.start);
    if (a0 > 0) {
      const p = Lyrics.wordProgress(w0, t);
      const n = w0.w.length;
      c.save();
      c.textBaseline = "alphabetic";
      c.font = font(F.jpSerif(900), this.sz);
      for (let i = 0; i < 5; i++) {
        const g = this.lay0.glyphs[i]!;
        c.fillStyle = glyphCol(clamp(p * n - i), a0);
        c.fillText(g.ch, x0 + g.x, y0);
      }
      const hx = x0 + this.lay0.width + 10;
      const kH = clamp(p * n - 5);
      const sl = kH > 0 ? 1 + 0.25 * (1 - ease.outExpo(prog(t, this.tHon, this.tHon + 0.25))) : 1;
      c.save();
      c.translate(hx + this.szHon / 2, y0 + 30 - this.szHon * 0.38);
      c.scale(sl, sl);
      c.font = font(F.jpSerif(900), this.szHon);
      c.fillStyle = kH <= 0 ? rgba("bone", 0.16 * a0) : rgba("signal", 1);
      c.fillText("本", -this.szHon / 2, this.szHon * 0.38);
      c.restore();
      c.font = font(F.jpSerif(900), this.sz);
      c.fillStyle = glyphCol(clamp(p * n - 6), a0);
      c.fillText("を", hx + this.szHon + 8, y0);
      c.restore();
    }
    // line 2: 教えてくれた (Noto Sans JP Black); on the held た the glyphs thin into lines like the book
    const w1 = this.w1;
    const a1 = prog(t, w1.start - 0.45, w1.start);
    if (a1 > 0) {
      const p = Lyrics.wordProgress(w1, t);
      const n = w1.w.length;
      c.save();
      c.textBaseline = "alphabetic";
      c.font = font(F.jp(900), this.sz);
      for (let i = 0; i < n; i++) {
        const g = this.lay1.glyphs[i]!;
        c.fillStyle = glyphCol(clamp(p * n - i), a1);
        c.fillText(g.ch, x0 + g.x, y1);
      }
      c.restore();
    }
  }

  /** Citation card wired to the phantom book: invented title, ISBN …404, NOT FOUND stamp. */
  private drawCallout(c: CanvasRenderingContext2D, cam: Cam, t: number, dis: number) {
    const k = prog(t, this.w1.start - 0.1, this.w1.start + 0.35, ease.outExpo);
    if (k <= 0) return;
    const bc = bookCentre();
    const bp = project(cam, [bc[0] - 0.26, bc[1], bc[2] + 0.2]);
    const cx = 1150,
      cy = 640,
      cw = 640,
      ch = 300;
    const fade = 1 - prog(t, this.tDis1 - 0.25, this.tDis1);
    c.save();
    c.globalAlpha = fade;
    // leader line from the book to the card (drawn as it unrolls)
    const lx = lerp(bp.x, cx, k),
      ly = lerp(bp.y, cy + ch, k);
    c.strokeStyle = rgba("signal", 0.9);
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(bp.x, bp.y);
    c.lineTo(lx, ly);
    c.stroke();
    c.fillStyle = rgba("signal", 1);
    c.beginPath();
    c.arc(bp.x, bp.y, 5, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = fade * k;
    c.translate(cx + (1 - k) * 40, cy);
    c.fillStyle = rgba("ink2", 0.92);
    c.fillRect(0, 0, cw, ch);
    c.strokeStyle = rgba("bone", 0.22);
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, cw - 1, ch - 1);
    const pad = 28;
    c.textBaseline = "alphabetic";
    c.font = font(F.mono(500), 14);
    c.letterSpacing = "3px";
    c.fillStyle = rgba("ash", 0.9);
    c.fillText("SOURCE · cited by assistant", pad, 40);
    c.letterSpacing = "0px";
    c.font = font(F.jpSerif(600), 40);
    c.fillStyle = rgba("bone", 0.95);
    c.fillText("『確率の森で眠る羊』", pad, 104);
    c.font = font(F.jp(400), 19);
    c.fillStyle = rgba("ash", 0.95);
    c.fillText("著者 未詳 ・ 第3版 ・ 2019年 ・ 412頁", pad, 146);
    c.font = font(F.mono(400), 19);
    c.fillStyle = rgba("bone", 0.8);
    c.fillText("ISBN 978-4-0404-0404-4", pad, 196);
    const conf = 0.97 - 0.0 * dis;
    c.fillStyle = rgba("graphite", 1);
    c.fillText(`confidence ${conf.toFixed(2)}   retrieved: none`, pad, 230);
    c.font = font(F.mono(400), 13);
    c.fillText("* no record in any catalogue", pad, ch - 26);
    // the stamp
    if (t >= this.tStamp) {
      const ks = prog(t, this.tStamp, this.tStamp + 0.12, ease.outExpo);
      const sc = lerp(1.8, 1, ks);
      c.save();
      c.translate(cw - 170, 190);
      c.rotate(-0.16);
      c.scale(sc, sc);
      c.globalAlpha = fade * clamp(ks * 1.5);
      c.strokeStyle = rgba("signal", 1);
      c.lineWidth = 4;
      c.strokeRect(-150, -52, 300, 104);
      c.lineWidth = 1.5;
      c.strokeRect(-140, -42, 280, 84);
      c.font = font(F.mono(700), 46);
      c.fillStyle = rgba("signal", 1);
      c.textAlign = "center";
      c.fillText("NOT FOUND", 0, 6);
      c.font = font(F.mono(600), 15);
      c.fillText("ERROR 404 · NO SUCH BOOK", 0, 32);
      c.restore();
    }
    c.restore();
  }
}
