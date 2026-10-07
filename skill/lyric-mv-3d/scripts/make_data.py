"""曲と歌詞を、3D歌詞MVエンジン（mexicat/pdoom-video 改）が読む形式に変換する。

入力（プロジェクト直下）:
  audio/song.wav                       曲
  work/stems/htdemucs/song/*.wav       Demucs の4分離（vocals/drums/bass/other）
  work/whisper.json                    mlx_whisper --word-timestamps の結果
  lyrics/lyrics.txt                    公式歌詞。1行=1歌詞行、空白=言葉の区切り、[Verse] などの行は無視
出力:
  data/audio.json   一定テンポの拍・小節頭・区間・100fps の音量・打楽器と歌の発音時刻
  data/lyrics.json  行 → 言葉 → 1文字ごと（syl）の歌い出し時刻
  app/src/timeline.ts  1歌詞行=1場面の台割（長い間奏は独立した場面 brk）

実行: uv run --python 3.12 --with librosa --with scipy python make_data.py <PROJECT> [--bpm 120]
"""

import argparse
import json
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

import librosa
import numpy as np
from scipy.signal import butter, find_peaks, sosfiltfilt

SR = 44100
FPS = 100
BREAK_GAP = 4.0  # 歌詞行の間がこれ以上空いたら間奏の場面を独立させる


def load(p: Path) -> np.ndarray:
    return librosa.load(str(p), sr=SR, mono=True)[0]


def band(y, lo, hi):
    kind, f = ("band", [lo, hi]) if lo and hi else ("high", lo) if lo else ("low", hi)
    return sosfiltfilt(butter(4, f, btype=kind, fs=SR, output="sos"), y)


def envelope(y, n):
    hop = SR // FPS
    r = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop)[0][:n]
    r = np.pad(r, (0, max(0, n - len(r))))
    top = np.percentile(r, 99) or 1.0
    return [round(float(v), 4) for v in np.clip(r / top, 0, 1)]


def onsets(y, min_gap, rel):
    hop = 256
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=hop)
    env = env / (env.max() or 1.0)
    peaks, _ = find_peaks(env, height=rel, distance=max(1, int(min_gap * SR / hop)))
    times = librosa.frames_to_time(peaks, sr=SR, hop_length=hop)
    return [[round(float(t), 3), round(float(env[p]), 3)] for t, p in zip(times, peaks)]


def beat_grid(drums, duration, start_bpm):
    """一定テンポの拍。テンポと位相をドラムの発音の強さに合わせる"""
    hop = 256
    env = librosa.onset.onset_strength(y=drums, sr=SR, hop_length=hop)
    tempo = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=env, sr=SR, hop_length=hop,
                                                      start_bpm=start_bpm))[0])
    best = (-1.0, tempo, 0.0)
    for bpm in np.arange(tempo - 1.5, tempo + 1.5, 0.02):
        period = 60.0 / bpm
        for phase in np.arange(0, period, 0.005):
            idx = librosa.time_to_frames(np.arange(phase, duration, period), sr=SR, hop_length=hop)
            score = float(env[idx[idx < len(env)]].sum())
            if score > best[0]:
                best = (score, bpm, phase)
    _, bpm, phase = best
    return bpm, [round(float(t), 4) for t in np.arange(phase, duration, 60.0 / bpm)]


def kana(c: str) -> str:
    """カタカナ→ひらがな・全半角をそろえる（聞き取りと公式歌詞の表記ゆれを吸収）"""
    c = unicodedata.normalize("NFKC", c)
    return chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c


def heard_chars(whisper: dict):
    """Whisper の単語を1文字ずつに割り、単語の長さの中で等間隔に時刻を振る"""
    words = [(si, w) for si, s in enumerate(whisper["segments"]) for w in s["words"]]
    out = []
    for i, (si, w) in enumerate(words):
        text = w["word"].strip()
        if not text:
            continue
        end = words[i + 1][1]["start"] if i + 1 < len(words) else w["end"]
        step = (min(end, w["end"] + 0.3) - w["start"]) / len(text)
        out += [(c, w["start"] + k * step, si) for k, c in enumerate(text)]
    return out, (words[-1][1]["end"] if words else 0.0)


def fill_unheard_lines(official, times, heard, segments, matched_heard):
    """1文字も一致しない行（聞き違い・定番の幻聴文に化けた行）を、どの行にも一致しなかった聞き取り区間へ割り当てる"""
    used = {heard[i][2] for i in matched_heard}
    free = [s for si, s in enumerate(segments) if si not in used and s["end"] - s["start"] > 0.5]
    for li in sorted({li for li, _ in official}):
        idx = [i for i, (l, _) in enumerate(official) if l == li]
        if any(times[i] is not None for i in idx):
            continue
        prev = max([times[i] for i in range(idx[0]) if times[i] is not None], default=-1.0)
        nxt = min([times[i] for i in range(idx[-1] + 1, len(times)) if times[i] is not None], default=1e9)
        seg = next((s for s in free if prev < s["start"] and s["end"] < nxt), None)
        if seg is None:
            continue
        free.remove(seg)
        step = (seg["end"] - seg["start"]) / len(idx)
        for k, i in enumerate(idx):
            times[i] = seg["start"] + k * step



def align(lines: list[str], heard, segments):
    """公式歌詞の各文字に、聞き取りで一致した文字の時刻を割り当てる。一致しない文字は前後から等間隔に補う"""
    official = [(li, c) for li, l in enumerate(lines) for c in l.replace(" ", "")]
    a = "".join(kana(c) for _, c in official)
    b = "".join(kana(h[0]) for h in heard)
    times: list[float | None] = [None] * len(official)
    matched_heard: set[int] = set()
    for blk in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = heard[blk.b + k][1]
            matched_heard.add(blk.b + k)
    matched = sum(t is not None for t in times)
    fill_unheard_lines(official, times, heard, segments, matched_heard)
    known = [i for i, t in enumerate(times) if t is not None]
    if not known:
        raise SystemExit("聞き取り結果と公式歌詞が1文字も一致しません。lyrics.txt を確認してください")
    for i in range(len(times)):
        if times[i] is None:
            prev = max([k for k in known if k < i], default=None)
            nxt = min([k for k in known if k > i], default=None)
            if prev is None:
                times[i] = times[nxt] - 0.15 * (nxt - i)
            elif nxt is None:
                times[i] = times[prev] + 0.15 * (i - prev)
            else:
                times[i] = times[prev] + (times[nxt] - times[prev]) * (i - prev) / (nxt - prev)
    return [(li, c, float(t)) for (li, c), t in zip(official, times)], matched, len(official)


def lyric_json(lines, chars, sung_end, duration):
    out, pos = [], 0
    starts = [next(t for li, _, t in chars if li == k) for k in range(len(lines))]
    for li, text in enumerate(lines):
        line_end = starts[li + 1] if li + 1 < len(lines) else min(duration, sung_end + 0.6)
        # 次の行が離れているときは最後の文字から1.2秒で切る（間奏に行を引きずらない）
        last_t = [t for k, _, t in chars if k == li][-1]
        line_end = min(line_end, last_t + 1.2)
        words = []
        for chunk in text.split():
            words.append([(c, chars[pos + k][2]) for k, c in enumerate(chunk)])
            pos += len(chunk)
        wj = []
        for wi, w in enumerate(words):
            nxt = words[wi + 1][0][1] if wi + 1 < len(words) else line_end
            ts = [t for _, t in w] + [nxt]
            syl = [[round(a, 3), round(max(b, a + 0.05), 3)] for a, b in zip(ts, ts[1:])]
            wj.append({"w": "".join(c for c, _ in w), "start": syl[0][0], "end": syl[-1][1], "conf": 1.0,
                       "syl": syl})
        out.append({"i": li, "text": " ".join(x["w"] for x in wj), "start": wj[0]["start"],
                    "end": wj[-1]["end"], "words": wj})
    return out


def plates(lines_j, duration):
    """1歌詞行=1場面。最初の場面は前奏込み、最後は後奏込み。長い間奏は独立した場面 brk にする"""
    out = []
    for i, l in enumerate(lines_j):
        start = 0.0 if i == 0 else l["start"]
        nxt = lines_j[i + 1]["start"] if i + 1 < len(lines_j) else duration
        if nxt - l["end"] >= BREAK_GAP and i + 1 < len(lines_j):
            out.append((f"m{i + 1:02d}", start, l["end"] + 0.4, l["text"]))
            out.append((f"brk{i + 1:02d}", l["end"] + 0.4, nxt, "(間奏)"))
        else:
            out.append((f"m{i + 1:02d}", start, nxt, l["text"]))
    return out


def sections(lines_j, plate_list, downbeats, duration):
    def bar(t):
        return max([d for d in downbeats if d <= t + 0.05] or [0.0])

    marks = [("intro", 0.0), ("verse", bar(lines_j[0]["start"]))]
    marks += [("break", bar(s)) for pid, s, _, _ in plate_list if pid.startswith("brk")]
    marks.append(("outro", bar(lines_j[-1]["end"])))
    marks = sorted({m[1]: m for m in marks}.values(), key=lambda m: m[1])
    ends = [m[1] for m in marks[1:]] + [duration]
    return [{"name": n, "start": round(s, 3), "end": round(e, 3)} for (n, s), e in zip(marks, ends)]


TIMELINE = """// make_data.py が生成した台割（1歌詞行=1場面）。場面の境目を変えるときはここを直す
import type {{ TimelineEntry }} from "./engine/engine";
import type {{ SceneClass }} from "./engine/scene";
import type {{ Lyrics }} from "./engine/lyrics";
import type {{ AudioData }} from "./engine/audio";

const modules = import.meta.glob<{{ default: SceneClass }}>("./scenes/*.ts");
const scene = (name: string) => () => {{
  const m = modules[`./scenes/${{name}}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${{name}}.ts`));
}};

export function makeTimeline(_ly: Lyrics, _au: AudioData): TimelineEntry[] {{
  const E = (id: string, start: number, end: number): TimelineEntry => ({{ id, load: scene(id), start, end }});
  return [
{rows}
  ];
}}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--bpm", type=float, default=120.0, help="テンポ推定の初期値（だいたいでよい）")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    stems = root / "work/stems/htdemucs/song"
    lines = [l.strip() for l in (root / "lyrics/lyrics.txt").read_text().splitlines()
             if l.strip() and not l.strip().startswith("[")]
    mix = load(root / "audio/song.wav")
    st = {k: load(stems / f"{k}.wav") for k in ("vocals", "drums", "bass", "other")}
    duration = len(mix) / SR
    n = int(np.ceil(duration * FPS))
    bpm, beats = beat_grid(st["drums"], duration, args.bpm)
    kick = band(st["drums"], None, 150)
    hop = 256
    kenv = librosa.onset.onset_strength(y=kick, sr=SR, hop_length=hop)
    bidx = librosa.time_to_frames(beats, sr=SR, hop_length=hop).clip(0, len(kenv) - 1)
    phase = int(np.argmax([kenv[bidx[p::4]].sum() for p in range(4)]))
    downbeats = beats[phase::4]

    whisper = json.loads((root / "work/whisper.json").read_text())
    heard, sung_end = heard_chars(whisper)
    chars, matched, total = align(lines, heard, whisper["segments"])
    lines_j = lyric_json(lines, chars, sung_end, duration)
    plate_list = plates(lines_j, duration)
    audio = {
        "duration": round(duration, 3), "bpm": round(bpm, 3), "beat_period": round(60 / bpm, 5),
        "time_signature": 4, "beats": beats, "downbeats": downbeats,
        "sections": sections(lines_j, plate_list, downbeats, duration), "fps": FPS,
        "rms": envelope(mix, n), "low": envelope(band(mix, None, 200), n),
        "mid": envelope(band(mix, 200, 2000), n), "high": envelope(band(mix, 4000, None), n),
        "vocal": envelope(st["vocals"], n), "drums": envelope(st["drums"], n),
        "bass": envelope(st["bass"], n), "other": envelope(st["other"], n),
        "onsets": {
            "kick": onsets(kick, 0.2, 0.25), "snare": onsets(band(st["drums"], 180, 1200), 0.2, 0.3),
            "hat": onsets(band(st["drums"], 6000, None), 0.1, 0.25), "vocal": onsets(st["vocals"], 0.12, 0.2),
        },
        "notes": "Constant tempo fitted on the Demucs drums stem; downbeat phase = strongest kick phase.",
    }
    (root / "data/audio.json").write_text(json.dumps(audio, ensure_ascii=False))
    (root / "data/lyrics.json").write_text(json.dumps(
        {"lines": lines_j, "extras": [], "notes": f"mlx-whisper 単語時刻を1文字ずつ公式歌詞に照合（一致 {matched}/{total} 文字）"},
        ensure_ascii=False, indent=1))
    rows = "\n".join(f'    E("{pid}", {s:.3f}, {e:.3f}), // {txt}' for pid, s, e, txt in plate_list)
    (root / "app/src/timeline.ts").write_text(TIMELINE.format(rows=rows))
    print(f"duration {duration:.2f}s  bpm {bpm:.2f}  beats {len(beats)}  歌詞一致 {matched}/{total} 文字")
    for pid, s, e, txt in plate_list:
        print(f"{pid}\t{s:6.2f}-{e:6.2f}\t{txt}")


if __name__ == "__main__":
    main()
