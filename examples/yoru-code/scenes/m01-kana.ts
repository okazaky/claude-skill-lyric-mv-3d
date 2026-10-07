// Per-character landing of a sung word in display type (Canvas2D), shared by m01/m06:
// each glyph appears on its syllable onset, lands from 1.35x and cools from signal to bone.
import type { Word } from '../engine/lyrics';
import { font, layout, type TextLayout } from '../engine/type';
import { ease, lerp, prog, smoothstep } from '../engine/util';

const cache = new Map<string, TextLayout>();
function lay(text: string, fam: string) {
  const k = `${fam}|${text}`;
  let l = cache.get(k);
  if (!l) { l = layout(text, fam, 100); cache.set(k, l); }
  return l;
}

/** Onset of character i of a word (from `syl`, falling back to an even split). */
export function sylStart(w: Word, i: number) {
  const s = w.syl;
  if (s && s[i]) return s[i]![0];
  return w.start + ((w.end - w.start) * i) / Math.max(1, w.w.length);
}

/** bone -> signal (sRGB) for a hot glyph. */
export function hotCol(k: number, a = 1) {
  return `rgba(${Math.round(lerp(238, 255, k))},${Math.round(lerp(233, 77, k))},${Math.round(lerp(223, 18, k))},${a})`;
}

/**
 * Draw `w` with glyph i appearing at its onset. `align` 'left' | 'right' | 'center' about x.
 * `restCol(i)` picks the settled colour per glyph (default bone). Returns the drawn width.
 */
export function drawLanding(
  c: CanvasRenderingContext2D, w: Word, fam: string, size: number, x: number, base: number, t: number,
  o: { align?: 'left' | 'right' | 'center'; alpha?: number; restCol?: (i: number) => string } = {},
) {
  const L = lay(w.w, fam);
  const width = (L.width / 100) * size;
  const x0 = o.align === 'right' ? x - width : o.align === 'center' ? x - width / 2 : x;
  c.save();
  c.font = font(fam, size);
  c.textBaseline = 'alphabetic';
  for (let i = 0; i < w.w.length; i++) {
    const ts = sylStart(w, i);
    if (t < ts - 1e-4) continue;
    const k = prog(t, ts, ts + 0.2, ease.outExpo);
    const s = lerp(1.35, 1, k);
    const g = L.glyphs[i]!;
    const gx = x0 + (g.x / 100) * size, gw = (g.w / 100) * size;
    const hot = 1 - smoothstep(ts + 0.05, ts + 0.32, t);
    const cx = gx + gw / 2, cy = base - size * 0.38;
    c.save();
    c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy);
    c.globalAlpha = (o.alpha ?? 1) * Math.min(1, k * 3);
    c.fillStyle = hot > 0.02 ? hotCol(hot) : (o.restCol?.(i) ?? 'rgba(238,233,223,1)');
    c.fillText(w.w[i]!, gx, base);
    c.restore();
  }
  c.restore();
  return width;
}
