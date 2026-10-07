# Re-time syllables from the vocal stem: word starts snap to loud vocal onsets, syllables inside a word are
# spread on the song's note grid (8th / quarter / dotted quarter chosen from the gap to the next word).
import json, sys
import numpy as np, librosa

root = sys.argv[1]
y, sr = librosa.load(f"{root}/work/stems/htdemucs/song/vocals.wav", sr=22050, mono=True)
hop = 128
on = librosa.onset.onset_detect(y=y, sr=sr, hop_length=hop, units="time", delta=0.03, wait=2)
rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0]
db = 20 * np.log10(rms + 1e-6)
tt = librosa.times_like(rms, sr=sr, hop_length=hop)
au = json.load(open(f"{root}/data/audio.json"))
beat = au["beat_period"]
loud = []
for o in on:
    m = (tt >= o) & (tt < o + 0.06)
    if m.any() and db[m].max() > np.percentile(db[db > -60], 50):
        loud.append(float(o))
loud = np.array(loud)

d = json.load(open(f"{root}/data/lyrics.json"))
for li, line in enumerate(d["lines"]):
    words = line["words"]
    starts = []
    for wi, w in enumerate(words):
        lo = starts[-1] + 0.15 if starts else w["start"] - 0.6
        c = loud[(loud > lo) & (loud > w["start"] - 0.6) & (loud < w["start"] + 0.6)]
        s = float(c[np.argmin(np.abs(c - w["start"]))]) if len(c) else w["start"]
        starts.append(s)
    for wi, w in enumerate(words):
        n = len(w["syl"])
        nxt = starts[wi + 1] if wi + 1 < len(words) else line["end"]
        gap = (nxt - starts[wi]) / max(1, n)
        steps = [beat / 2, beat, beat * 1.5, beat * 2]
        sp = min(steps, key=lambda q: abs(q - gap))
        sp = min(sp, (nxt - starts[wi]) / max(1, n)) if wi + 1 < len(words) else sp
        old = [round(a, 2) for a, _ in w["syl"]]
        new = [starts[wi] + i * sp for i in range(n)]
        w["syl"] = [[round(a, 3), round((new[i + 1] if i + 1 < n else min(nxt, a + sp)), 3)] for i, a in enumerate(new)]
        w["start"] = round(new[0], 3)
        print(f"{li} {w['w']}: {old} -> {[round(a, 2) for a in new]}")
json.dump(d, open(f"{root}/data/lyrics.json", "w"), ensure_ascii=False, indent=1)
