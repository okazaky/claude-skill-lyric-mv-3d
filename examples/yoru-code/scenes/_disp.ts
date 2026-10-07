// Display spelling: words sung as katakana loanwords are shown in English (クロ -> Claude, コード -> code).
// dispWord() rewrites a lyric word and re-spreads the letters of each replaced run over that run's syllables,
// so per-glyph sync (sylStart / sylOf) keeps working on the display string.
import type { Word } from "../engine/lyrics";

const DISP: readonly (readonly [string, string])[] = [
  ["クロ", "Claude"],
  ["コード", "code"],
];

export const dispText = (s: string) => DISP.reduce((a, [k, v]) => a.split(k).join(v), s);

export function dispWord(w: Word): Word {
  const src = w.w;
  const n = src.length;
  const syl: [number, number][] =
    w.syl && w.syl.length >= n
      ? w.syl
      : Array.from({ length: n }, (_, i) => [w.start + ((w.end - w.start) * i) / n, w.start + ((w.end - w.start) * (i + 1)) / n]);
  let out = "";
  const os: [number, number][] = [];
  let i = 0;
  while (i < n) {
    const hit = DISP.find(([k]) => src.startsWith(k, i));
    if (hit) {
      const [k, v] = hit;
      for (let j = 0; j < v.length; j++) os.push(syl[i + Math.floor((j * k.length) / v.length)]!);
      out += v;
      i += k.length;
    } else {
      out += src[i];
      os.push(syl[i]!);
      i++;
    }
  }
  return { ...w, w: out, syl: os };
}
