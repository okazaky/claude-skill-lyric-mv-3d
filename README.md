# claude-skill-lyric-mv-3d

曲と歌詞から、線彫りの3Dで作る歌詞MVを作る Claude Code スキルです。曲の分離、歌詞の時刻合わせ、台割の生成までを自動で行い、場面ごとの3D演出は Claude Code のエージェントが作ります。縦長（ショート・リール向け 1080×1920）と横長（1920×1080）の両方に対応します。

作者: 岡崎よしあき

## 構成

| フォルダ | 中身 |
|---|---|
| `skill/lyric-mv-3d/` | Claude Code スキル本体（`SKILL.md`、`scripts/new_project.sh`、`scripts/make_data.py`、`references/scene_brief_template.md`） |
| `engine/` | three.js の描画エンジン。曲ごとにこのフォルダを複製して使います |
| `examples/yoru-code/` | 縦長MV「夜をほどくコード」の絵コンテ、制作記録、場面のコード |

## クレジット

- エンジンは [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（Giacomo Magnanini 作、MIT）を改造したものです。日本語の文字、縦長対応、歌詞データの自動生成などを足しています。
- フォントは Archivo、IBM Plex Mono、Cormorant Garamond、Noto Sans JP、Noto Serif JP を同梱しています（SIL Open Font License）。一筆書きのフォントは `hersheytext` パッケージ由来です（OFL / パブリックドメイン）。
- ライセンスは [MIT](LICENSE) です。フォントはそれぞれのライセンスに従います。

## 必要なもの

- Apple Silicon の Mac（`mlx_whisper` を使うため）
- [bun](https://bun.sh)
- Google Chrome（書き出しでヘッドレス起動します）
- ffmpeg（libx264 つき）
- [uv](https://docs.astral.sh/uv/)（Python 3.12 を自動で用意します）
- Demucs（`uv run --with demucs` で自動取得）
- mlx_whisper（`pip install mlx-whisper` などで事前に入れます。初回にモデルをダウンロードします）

## インストール

```bash
git clone https://github.com/okazaky/claude-skill-lyric-mv-3d.git
cd claude-skill-lyric-mv-3d
mkdir -p ~/.claude/skills
cp -R skill/lyric-mv-3d ~/.claude/skills/
export LYRIC_MV_ENGINE="$(pwd)/engine"
```

`LYRIC_MV_ENGINE` はシェルの設定ファイルに書いておくと、毎回指定せずに済みます。

## 使い方

Claude Code で「この曲の3D歌詞MVを作って」のように頼むと、スキルが次の8手順で進めます。詳しくは `skill/lyric-mv-3d/SKILL.md` にあります。

1. 新規プロジェクトを作ります。`new_project.sh` がエンジンの複製、縦長への切り替え、Demucs による4分離、声だけの文字起こし、公式歌詞との照合、台割の生成を行います。
2. 台割（`app/src/timeline.ts`）を確認し、場面の境目を直します。
3. `references/scene_brief_template.md` から絵コンテと指示書（`SCENE_BRIEF.md`）を書きます。歌詞1行ごとに、3Dで何を見せるかを決めます。
4. 確認用サーバーを起動します。
5. 場面を3〜4グループに分け、エージェントを並列に起動して場面を作ります。
6. コマ一覧を作り、目で見て確かめます。
7. `render.ts video` で書き出します。
8. 音量をそろえ、直した点を `implementation-notes.md` に記録します。

```bash
bash ~/.claude/skills/lyric-mv-3d/scripts/new_project.sh /path/to/my-mv song.mp3 lyrics.txt --vertical --bpm 120 --title "曲名"
```

## 曲と歌詞について

曲と歌詞はこのリポジトリに含まれていません。自分が権利を持つ曲（自作曲、または利用規約で許される生成曲）と歌詞を用意してください。歌詞ファイルは1行が歌詞1行、空白が言葉の区切りです。

エンジンの元の動画「I'm Upping My P(doom)」の曲と歌詞も含めていません。そのため、同梱の前作の場面（`engine/app/src/scenes/` の `open.ts` などと `s01.ts`〜`s10.ts`）は、自分の曲のデータを置くまで動きません。`new_project.sh` は前作の場面を参考資料として `app/ref_aitowatashi/` に移します。

前作の完成動画が無いので、`new_project.sh` が作る見本コマ一覧（`out/ref_sheet.png`）は生成されません。

## examples/yoru-code

縦長ショートのMV「夜をほどくコード」（約51秒）を、このスキルで作ったときの記録です。

- `SCENE_BRIEF.md`: 場面エージェントに渡した指示書
- `implementation-notes.md`: 依頼者の指摘と、直した内容の記録
- `timeline.ts`: 台割と、音の変わり目の時刻
- `scenes/`: 場面のコード（`m01`〜`m09`、間奏 `brk08`、共用部品）
- `scripts/fix_syl.py`: 歌声の立ち上がりに合わせて1文字ごとの出を直すスクリプト

曲の音声と歌詞は含まれていないので、コードを読む資料としてお使いください。
