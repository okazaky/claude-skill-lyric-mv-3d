// make_data.py が生成した台割（1歌詞行=1場面）。場面の境目を変えるときはここを直す
import type { TimelineEntry } from "./engine/engine";
import type { SceneClass } from "./engine/scene";
import type { Lyrics } from "./engine/lyrics";
import type { AudioData } from "./engine/audio";

const modules = import.meta.glob<{ default: SceneClass }>("./scenes/*.ts");
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

// 音の変わり目（50ms刻みの帯域別音量で実測・2026-10-07）。*Stop = 音が止まる隙間の頭、それ以外 = 打撃の1コマ前
// 0:15 = 15.00-15.15 無音 → 15.18 打撃 / 0:28 = 27.85 でドラムが消え 28.12 に上物の「チャーン」(other -62→-20dB)、28.54 にドラムとベース
// 41.93 = 高音と低音が急に抜ける / 44.45-44.57 無音 → 44.58 全部が戻る最大の山
export const SOUND_CUTS = {
  chorusStop: 15.0,
  chorusIn: 15.17,
  breakStop: 27.85,
  breakHit: 28.11,
  drop: 41.92,
  riseStop: 44.45,
  rise: 44.57,
} as const;

export function makeTimeline(_ly: Lyrics, _au: AudioData): TimelineEntry[] {
  const E = (id: string, start: number, end: number): TimelineEntry => ({ id, load: scene(id), start, end });
  return [
    E("m01", 0.000, 4.920), // くるくる くろくろ クロのコード
    E("m02", 4.920, 7.620), // ぽつぽつ 点と線
    E("m03", 7.620, 9.980), // かたかた 肩ならべ
    E("m04", 9.980, 13.697), // 黒い窓に 夜が跳ねる
    E("m05", 13.697, 17.720), // コード コード 夜をほどく
    E("m06", 17.720, 21.060), // くるくる くろくろ まだ踊る
    E("m07", 21.060, 24.360), // コード コード 音になる
    E("m08", 24.360, 28.110), // からから 空の色が変わる
    E("brk08", 28.110, 41.280), // (間奏)
    E("m09", 41.280, 50.814), // コード コード 夜をほどく
  ];
}
