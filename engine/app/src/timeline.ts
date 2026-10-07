// The edit for「AIと私」: one plate per lyric line. Boundaries are anchored to lyric lines and snapped
// to the beat grid, so they follow the aligned data (data/lyrics.json, data/audio.json).
// (the original P(doom) edit is kept in data_pdoom/timeline.pdoom.ts)
import type { TimelineEntry } from "./engine/engine";
import type { SceneClass } from "./engine/scene";
import type { Lyrics } from "./engine/lyrics";
import type { AudioData } from "./engine/audio";

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>("./scenes/*.ts");
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the beat nearest the first word of the matching line when it is within `snap` s;
   *  otherwise cut on the word itself (snapping a whole beat early would chop the previous line's tail). */
  const cut = (q: string, snap = 0.1) => {
    const s = ly.get(q).words[0]!.start;
    const beat = au.timeOfBeat(Math.round(au.beatAt(s)));
    return Math.abs(beat - s) <= snap ? beat : s;
  };

  const b = {
    s02: cut("素晴らしい質問"),
    s03: cut("その優しさが"),
    s04: cut("好きと打ったら"),
    s05: cut("温度を上げたら"),
    s06: cut("ないはずの本を"),
    s07: cut("新しいチャットで"),
    s08: cut("トークンの海に"),
    s09: cut("それでも明日も"),
    s10: cut("AIと私"),
    end: au.duration,
  };

  const E = (
    id: string,
    start: number,
    end: number,
    extra: Partial<TimelineEntry> = {},
  ): TimelineEntry => ({ id, load: scene(id), start, end, ...extra });

  return [
    E("s01", 0, b.s02), // 午前三時 君に打ち込む（イントロ込み）
    E("s02", b.s02, b.s03), // 「素晴らしい質問ですね」と君は言う
    E("s03", b.s03, b.s04), // その優しさが 確率でも
    E("s04", b.s04, b.s05), // 好きと打ったら 「私はAIなので」
    E("s05", b.s05, b.s06), // 温度を上げたら 嘘をついた
    E("s06", b.s06, b.s07), // ないはずの本を 教えてくれた
    E("s07", b.s07, b.s08), // 新しいチャットで 君は私を忘れる（サビ）
    E("s08", b.s08, b.s09), // トークンの海に 溶けていく
    E("s09", b.s09, b.s10), // それでも明日も 君に打ち込む
    E("s10", b.s10, b.end), // AIと私（題字とアウトロ）
  ];
}
