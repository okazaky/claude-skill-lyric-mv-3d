#!/usr/bin/env bash
# 3D歌詞MVの新規プロジェクトを作り、曲の分離・歌詞の時刻合わせ・台割の生成まで済ませる。
# usage: new_project.sh <作成先の絶対パス> <曲ファイル> <歌詞.txt> [--vertical] [--bpm 120] [--title "曲名"]
#   歌詞.txt: 1行=1歌詞行、空白=言葉の区切り。[Verse] などの行は無視される
#   --vertical: 縦長 1080x1920（ショート・リール向け）。省略時は横長 1920x1080
set -euo pipefail

TEMPLATE="${LYRIC_MV_ENGINE:?set LYRIC_MV_ENGINE to the engine folder}"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$1"; SONG="$2"; LYRICS="$3"; shift 3
VERTICAL=0; BPM=120; TITLE="lyric mv"
while [ $# -gt 0 ]; do
  case "$1" in
    --vertical) VERTICAL=1 ;;
    --bpm) BPM="$2"; shift ;;
    --title) TITLE="$2"; shift ;;
  esac
  shift
done

[ -d "$TEMPLATE/app/src/engine" ] || { echo "テンプレートが見つかりません: $TEMPLATE" >&2; exit 1; }
[ -e "$DEST" ] && { echo "作成先が既にあります: $DEST" >&2; exit 1; }

echo "[1/5] エンジンを複製"
mkdir -p "$DEST"
rsync -a --exclude node_modules --exclude out --exclude old --exclude work --exclude .git \
  --exclude 'analysis/.venv' --exclude 'audio/*' --exclude 'out_vite.log' --exclude 'data/*' \
  --exclude implementation-notes.md --exclude SCENE_BRIEF.md "$TEMPLATE/" "$DEST/"
mkdir -p "$DEST"/{audio,data,lyrics,work,out} "$DEST/app/ref_aitowatashi"
# 前作「AIと私」の場面は参考資料として src の外へ（台割にも型チェックにも入らない）
mv "$DEST"/app/src/scenes/s[0-9][0-9]*.ts "$DEST/app/ref_aitowatashi/" 2>/dev/null || true
cp "$TEMPLATE/SCENE_BRIEF.md" "$DEST/app/ref_aitowatashi/SCENE_BRIEF.aitowatashi.md"
cp "$TEMPLATE/implementation-notes.md" "$DEST/app/ref_aitowatashi/notes.aitowatashi.md"

# 品質の基準になる前作のコマ一覧（場面エージェントが見比べる）
REF_MP4="$(ls -t "$TEMPLATE"/out/video/aitowatashi_mv_v3_youtube.mp4 2>/dev/null | head -1)"
[ -n "$REF_MP4" ] && ffmpeg -v error -y -i "$REF_MP4" -vf "fps=1/3.5,scale=480:270,tile=4x4" -frames:v 1 "$DEST/out/ref_sheet.png"

echo "[2/5] 曲・歌詞を配置し、曲ファイル名を audio/song.wav にそろえる"
ffmpeg -v error -y -i "$SONG" -ar 44100 -ac 2 "$DEST/audio/song.wav"
cp "$LYRICS" "$DEST/lyrics/lyrics.txt"
sed -i '' "s#audio/aitowatashi.wav#audio/song.wav#" "$DEST/app/src/main.ts" "$DEST/app/scripts/render.ts"
sed -i '' "s#<title>[^<]*</title>#<title>${TITLE}</title>#" "$DEST/app/index.html"

if [ "$VERTICAL" = 1 ]; then
  echo "      縦長 1080x1920 に切り替え"
  sed -i '' 's/^export const W = 1920;/export const W = 1080;/; s/^export const H = 1080;/export const H = 1920;/' "$DEST/app/src/engine/gl.ts"
  sed -i '' 's/aspect-ratio: 16\/9/aspect-ratio: 9\/16/; s/body.export #c { width: 1920px; height: 1080px;/body.export #c { width: 1080px; height: 1920px;/' "$DEST/app/index.html"
  sed -i '' 's/const OW = 1920 \* SCALE, OH = 1080 \* SCALE;/const OW = 1080 * SCALE, OH = 1920 * SCALE;/; s/width: 1920, height: 1080/width: 1080, height: 1920/g; s/__pdoom.width ?? 1920, (window as any).__pdoom.height ?? 1080/__pdoom.width ?? 1080, (window as any).__pdoom.height ?? 1920/; s/const cw = 480, ch = 270,/const wide = P.width >= P.height, cw = wide ? 480 : 270, ch = wide ? 270 : 480,/' "$DEST/app/scripts/render.ts"
  grep -q "export const W = 1080;" "$DEST/app/src/engine/gl.ts" || { echo "縦長への切り替えに失敗（gl.ts）" >&2; exit 1; }
  [ "$(grep -c '1080, height: 1920' "$DEST/app/scripts/render.ts")" -ge 3 ] || { echo "縦長への切り替えに失敗（render.ts）" >&2; exit 1; }
fi

echo "[3/5] Demucs で4分離（声・ドラム・ベース・その他）"
uv run --python 3.12 --with demucs --with torchcodec --with numpy python -m demucs -o "$DEST/work/stems" "$DEST/audio/song.wav" > "$DEST/work/demucs.log" 2>&1
[ -s "$DEST/work/stems/htdemucs/song/vocals.wav" ] || { echo "Demucs 失敗: $DEST/work/demucs.log" >&2; exit 1; }

echo "[4/5] 声だけを mlx_whisper で文字起こし（単語時刻つき）"
( cd "$DEST/work" && mlx_whisper stems/htdemucs/song/vocals.wav --model mlx-community/whisper-large-v3-turbo \
    --language ja --word-timestamps True --condition-on-previous-text False --hallucination-silence-threshold 2 --output-format json --output-dir . --output-name whisper > whisper.log 2>&1 )
[ -s "$DEST/work/whisper.json" ] || { echo "文字起こし失敗: $DEST/work/whisper.log" >&2; exit 1; }

echo "[5/5] 解析データと台割を生成"
uv run --python 3.12 --with librosa --with scipy python "$SKILL_DIR/scripts/make_data.py" "$DEST" --bpm "$BPM"

( cd "$DEST/app" && bun install >/dev/null 2>&1 )
( cd "$DEST" && git init -q && git add -A . ':!work/stems' ':!audio/*.wav' && git -c core.hooksPath=/dev/null commit -qm "chore: 3D歌詞MVの新規プロジェクト（エンジン複製・解析データ・台割）" )
echo "完了: $DEST"
