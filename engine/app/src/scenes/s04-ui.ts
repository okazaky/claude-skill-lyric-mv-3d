// s04 UI (adapted from prompt.ts): the input field where 好きと打ったら is typed on its syllables,
// next-token popups above two of the typed characters, the ⏎ key, and the cold reply
// 「私はAIなので」 set in fixed cells (a mono-like JP voice). All labels in Japanese.
import { rgba } from "../engine/palette";
import { F, font, layout, measure, type TextLayout } from "../engine/type";
import { Lyrics, type Word } from "../engine/lyrics";
import { clamp, ease, hash, prog, frameIdx, TAU } from "../engine/util";
import { W } from "../engine/gl";

export type Cand = [string, number];
const FS = 80; // typed size
const POP_PRE = 0.16;

/** Next-token joke distributions, keyed by char index in the typed word. */
const POPS: Record<number, Cand[]> = {
  0: [
    ["好き", 0.31],
    ["大丈夫", 0.22],
    ["ありがとう", 0.18],
    ["疲れた", 0.09],
  ],
  3: [
    ["打った", 0.44],
    ["言った", 0.29],
    ["送った", 0.12],
    ["消した", 0.06],
  ],
};

export class S04UI {
  lay!: TextLayout;
  fx0 = 0;
  fx1 = 0;
  tx0 = 0;
  typed = "";
  constructor(
    public wIn: Word,
    public wRep: Word,
    public tEnter: number,
    public tShat: number,
  ) {
    this.typed = wIn.w;
    this.lay = layout(this.typed, F.jp(700), FS);
    const fw = 1180;
    this.fx0 = (W - fw) / 2;
    this.fx1 = this.fx0 + fw;
    this.tx0 = this.fx0 + 96;
  }
  charT(i: number) {
    return this.wIn.syl?.[i]?.[0] ?? this.wIn.start + i * 0.12;
  }
  repT(i: number) {
    return this.wRep.syl?.[i]?.[0] ?? this.wRep.start + i * 0.4;
  }

  /** Field centre y: mid-frame while typing, slides to the bottom on ⏎. */
  fieldY(t: number) {
    return 560 + 300 * prog(t, this.tEnter, this.tEnter + 0.35, ease.outExpo);
  }

  /** Screen position of the typed 好き (for the lift-off). */
  sukiAnchor(t: number) {
    const y = this.fieldY(t);
    const g1 = this.lay.glyphs[1]!;
    return { x: this.tx0 + (g1.x + g1.w) / 2, y: y + FS * 0.34 - FS * 0.38 };
  }

  draw(c: CanvasRenderingContext2D, t: number, beat: number) {
    const cy = this.fieldY(t);
    const fy0 = cy - 64,
      fy1 = cy + 64,
      base = cy + FS * 0.34;
    const { fx0, fx1 } = this;
    const nTyped = this.lay.glyphs.filter((g) => this.charT(g.i) <= t).length;
    const typedAll = nTyped === this.typed.length;
    c.save();
    c.textBaseline = "alphabetic";
    // slot + hairline frame + registration ticks
    c.fillStyle = rgba("ink", 0.9);
    c.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    c.lineWidth = 1;
    c.strokeStyle = rgba("bone", 0.42);
    c.strokeRect(fx0 + 0.5, fy0 + 0.5, fx1 - fx0, fy1 - fy0);
    c.strokeStyle = rgba("bone", 0.6);
    c.beginPath();
    for (const [x, y, sx, sy] of [
      [fx0, fy0, -1, -1],
      [fx1, fy0, 1, -1],
      [fx0, fy1, -1, 1],
      [fx1, fy1, 1, 1],
    ] as const) {
      c.moveTo(x + sx * 6, y);
      c.lineTo(x + sx * 20, y);
      c.moveTo(x, y + sy * 6);
      c.lineTo(x, y + sy * 20);
    }
    c.stroke();
    c.font = font(F.mono(400), 44);
    c.fillStyle = rgba("bone", 0.62 * (0.7));
    c.fillText("›", fx0 + 34, base - 4);
    // labels under the field
    c.font = font(F.jp(700), 15);
    c.fillStyle = rgba("bone", 0.6);
    c.fillText("入力", fx0, fy1 + 30);
    c.font = font(F.mono(500), 14);
    c.fillStyle = rgba("signal", 0.9);
    c.fillText("04", fx0 + 40, fy1 + 30);
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba("bone", 0.62 * (0.75));
    c.fillText("T 0.7 · top-p 0.95 · seed 0x2A", fx0, fy1 + 52);
    c.textAlign = "right";
    c.font = font(F.jp(400), 15);
    c.fillStyle = rgba("bone", 0.6);
    c.fillText(`文脈 ${String(nTyped).padStart(2, "0")} / 8192`, fx1, fy1 + 30);
    c.fillStyle = rgba("bone", 0.62 * (0.75));
    c.fillText("送信（取り消し不可）", fx1, fy1 + 54);
    c.textAlign = "left";
    this.drawKey(c, t, fx1 - 78, cy, typedAll);
    // typed characters
    c.font = font(F.jp(700), FS);
    const lifted = prog(t, this.tEnter, this.tEnter + 0.12);
    for (const g of this.lay.glyphs) {
      const t0 = this.charT(g.i);
      if (t0 > t) break;
      const age = t - t0;
      const flash = Math.pow(0.5, age / 0.06);
      const drop = (1 - ease.outExpo(clamp(age / 0.18))) * -10;
      const suki = g.i <= 1;
      const cool = prog(t, this.wIn.end, this.wIn.end + 0.35);
      let col =
        flash > 0.05
          ? rgba("signal", 1)
          : suki
            ? rgba("signal", 1)
            : cool > 0
              ? rgba("bone", 0.95)
              : rgba("signal", 1);
      if (suki && lifted > 0) col = rgba("bone", 0.38 * (0.9 - 0.4 * lifted)); // the word left the field
      c.fillStyle = col;
      c.fillText(g.ch, this.tx0 + g.x, base + drop);
      // token bracket + fake id
      const by = base + 18;
      c.fillStyle = rgba("bone", 0.35);
      c.fillRect(this.tx0 + g.x + 3, by, g.w - 6, 1);
      c.fillRect(this.tx0 + g.x + 3, by - 5, 1, 5);
      c.fillRect(this.tx0 + g.x + g.w - 4, by - 5, 1, 5);
      c.font = font(F.mono(400), 10);
      c.fillStyle = rgba("bone", 0.62 * (0.55));
      c.fillText(String(1000 + Math.floor(hash(g.i, 7) * 98000)), this.tx0 + g.x + 5, by + 14);
      c.font = font(F.jp(700), FS);
    }
    // karaoke wipe under the typed word
    const p = Lyrics.wordProgress(this.wIn, t);
    if (p > 0) {
      c.fillStyle = rgba("signal", 1 - 0.75 * prog(t, this.wIn.end, this.wIn.end + 0.4));
      c.fillRect(this.tx0, base + 17, this.lay.width * p, 3);
    }
    // caret
    const caretX =
      this.tx0 + (nTyped ? this.lay.glyphs[nTyped - 1]!.x + this.lay.glyphs[nTyped - 1]!.w : 0) + 4;
    const bph = beat - Math.floor(beat);
    if (t < this.tEnter && (bph < 0.5 || (nTyped && t - this.charT(nTyped - 1) < 0.4))) {
      c.fillStyle = rgba("signal", 1);
      c.fillRect(caretX, base - FS * 0.82, 3.5, FS * 0.95);
    }
    this.drawPopups(c, t, fy0, base);
    c.restore();
  }

  private drawKey(c: CanvasRenderingContext2D, t: number, kx: number, ky: number, armed: boolean) {
    const press = t >= this.tEnter ? Math.pow(0.5, (t - this.tEnter) / 0.12) : 0;
    const ks = 30 * (1 - 0.1 * press);
    const lit = t >= this.tEnter ? 1 : 0;
    if (lit) {
      c.fillStyle = rgba("signal", 1);
      c.fillRect(kx - ks, ky - ks, ks * 2, ks * 2);
    }
    c.lineWidth = armed ? 2 : 1;
    c.strokeStyle = lit
      ? rgba("signal", 1)
      : rgba("bone", 0.35 + (armed ? 0.35 * (0.5 + 0.5 * Math.cos(t * TAU * 2)) : 0));
    c.strokeRect(kx - ks, ky - ks, ks * 2, ks * 2);
    c.strokeStyle = lit ? rgba("ink", 1) : rgba("bone", 0.8);
    c.lineWidth = 2.2;
    c.lineCap = "square";
    c.lineJoin = "miter";
    const a = ks * 0.42;
    c.beginPath();
    c.moveTo(kx + a, ky - a);
    c.lineTo(kx + a, ky + a * 0.25);
    c.lineTo(kx - a, ky + a * 0.25);
    c.moveTo(kx - a + a * 0.45, ky + a * 0.25 - a * 0.45);
    c.lineTo(kx - a, ky + a * 0.25);
    c.lineTo(kx - a + a * 0.45, ky + a * 0.25 + a * 0.45);
    c.stroke();
  }

  private drawPopups(c: CanvasRenderingContext2D, t: number, fy0: number, base: number) {
    for (const [ks, rows] of Object.entries(POPS)) {
      const i = Number(ks);
      const t0 = this.charT(i);
      const tEnd = Math.min(
        t0 + 0.55,
        i === 0 ? this.charT(3) - POP_PRE - 0.05 : this.tEnter - 0.05,
      );
      const a0 = t0 - POP_PRE,
        a1 = tEnd + 0.12;
      if (t < a0 || t > a1) continue;
      const built = clamp((t - a0) / POP_PRE);
      const picked = t >= t0;
      const collapse = ease.inCubic(prog(t, tEnd, tEnd + 0.12));
      const ax = this.tx0 + this.lay.glyphs[i]!.x,
        ay = fy0 - 26;
      const rh = 24,
        headH = 22,
        pw = 300,
        hgt = headH + rows.length * rh + 6;
      c.save();
      c.translate(ax, ay);
      c.scale(1, 1 - collapse);
      c.globalAlpha = 1 - collapse * 0.6;
      c.fillStyle = rgba("bone", 0.5);
      c.fillRect(0, 0, 1, base - FS * 0.82 - ay);
      c.fillStyle = rgba("ink", 0.86);
      c.fillRect(0, -hgt, pw, hgt);
      c.fillStyle = rgba("bone", 0.35);
      c.fillRect(0, -hgt, pw, 1);
      c.fillRect(0, -hgt, 1, hgt);
      c.font = font(F.jp(400), 13);
      c.fillStyle = rgba("bone", 0.62 * (0.85));
      c.fillText("p( 次 | 文脈 )", 10, -hgt + 16);
      c.textAlign = "right";
      c.fillText(picked ? "採択" : "計算中…", pw - 8, -hgt + 16);
      c.textAlign = "left";
      const pmax = rows[0]![1];
      rows.forEach(([txt, p], ri) => {
        const y = -hgt + headH + (ri + 1) * rh - 5;
        const on = picked && ri === 0;
        if (!picked && hash(ri, frameIdx(t), i) > 0.25 + 0.75 * built) return;
        const jit = picked
          ? 1
          : clamp(0.3 + 0.7 * built + (hash(ri, frameIdx(t), 3) - 0.5) * 0.5 * (1 - built), 0, 1.2);
        if (on) {
          c.fillStyle = rgba("signal", 0.14 + 0.5 * Math.pow(0.5, (t - t0) / 0.08));
          c.fillRect(1, y - 17, pw - 1, rh - 1);
        }
        c.font = font(F.jp(on ? 700 : 400), 16);
        c.fillStyle = on ? rgba("signal", 1) : rgba("bone", picked ? 0.5 : 0.55);
        c.fillText(txt, 14, y);
        c.fillStyle = on ? rgba("signal", 1) : rgba("bone", picked ? 0.3 : 0.45);
        c.fillRect(150, y - 10, clamp(((80 * p) / pmax) * jit, 1.5, 80), 7);
        c.font = font(F.mono(400), 12);
        c.fillStyle = on ? rgba("signal", 1) : rgba("bone", 0.62 * (0.8));
        c.textAlign = "right";
        c.fillText(p.toFixed(2), pw - 8, y);
        c.textAlign = "left";
      });
      c.restore();
    }
  }

  /** The reply, cold: thin JP set in fixed cells, each glyph flickering in on its syllable. */
  drawReply(c: CanvasRenderingContext2D, t: number, x0: number, yb: number) {
    if (t < this.tEnter - 0.02) return;
    const txt = this.wRep.w;
    const size = 104,
      cell = 118;
    c.save();
    c.textBaseline = "alphabetic";
    c.font = font(F.jp(700), 16);
    c.letterSpacing = "4px";
    c.fillStyle = rgba("bone", 0.62 * (0.9));
    c.fillText("応答", x0, yb - size - 26);
    c.letterSpacing = "0px";
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba("bone", 0.38 * (1));
    c.fillText("latency 0.000 s", x0 + 64, yb - size - 26);
    // cells: one per kana (the mono-like voice); the Latin "AI" is set as one tight chunk
    c.font = font(F.jp(300), size);
    const xs: number[] = [];
    const ws: number[] = [];
    const isL = (ch: string | undefined) => !!ch && /[A-Za-z]/.test(ch);
    let cx = x0;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i]!;
      if (isL(ch) && !isL(txt[i - 1])) cx += 22; // breathing room before the Latin chunk
      const w = isL(ch) ? measure(ch, F.jp(300), size) : cell;
      xs.push(cx);
      ws.push(w);
      cx += w;
      if (isL(ch) && !isL(txt[i + 1])) cx += 22; // and after it
    }
    const totalW = cx - x0;
    c.fillStyle = rgba("bone", 0.12);
    for (let i = 0; i <= txt.length; i++) {
      if (isL(txt[i]) && isL(txt[i - 1])) continue; // no rule inside the AI chunk
      const gx = i < txt.length ? xs[i]! - (isL(txt[i]) ? 11 : 0) : cx;
      c.fillRect(gx, yb - size * 0.95, 1, size * 1.15);
    }
    for (let i = 0; i < txt.length; i++) {
      const t0 = this.repT(i);
      if (t < t0) {
        // pending cell: a dim block cursor in the next cell only
        if (i === 0 || this.repT(i - 1) <= t) {
          const on = Math.floor((t - this.tEnter) * 4) % 2 === 0;
          if (on) {
            c.fillStyle = rgba("bone", 0.5);
            c.fillRect(xs[i]! + 10, yb - size * 0.78, Math.max(ws[i]! - 20, 30), 4);
          }
        }
        break;
      }
      const age = t - t0;
      const glitch = age < 0.07 && hash(i, frameIdx(t)) < 0.5;
      const ch = txt[i]!;
      const latin = isL(ch);
      const w = measure(ch, F.jp(300), size);
      c.fillStyle = rgba("bone", glitch ? 0.35 : 0.92);
      c.fillText(ch, xs[i]! + (latin ? 0 : (ws[i]! - w) / 2) + (glitch ? 6 : 0), yb);
    }
    // sung progress: a cold ash rule, not signal
    const p = Lyrics.wordProgress(this.wRep, t);
    c.fillStyle = rgba("bone", 0.62 * (0.7));
    c.fillRect(x0, yb + 28, totalW * p, 2);
    const done = prog(t, this.wRep.end - 0.6, this.wRep.end);
    if (done > 0) {
      c.font = font(F.jp(400), 17);
      c.fillStyle = rgba("bone", 0.62 * (0.8 * done));
      c.fillText("定型文 #0412 ・ 感情の表明を検出 → 安全な応答を返しました", x0, yb + 66);
    }
    c.restore();
  }
}
