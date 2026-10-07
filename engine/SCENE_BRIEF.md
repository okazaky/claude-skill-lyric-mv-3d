# Scene brief — 「AIと私」 on the mexicat/pdoom-video engine

Project: Japanese song「AIと私」(56 s, 108 BPM), Suno take. Engine = mexicat/pdoom-video (three.js, bun+Vite), 1920x1080.
Quality bar = the original P(doom) video. LOOK at these before writing anything:
- <PROJECT>/out/orig_sheet.png  (16 frames of the original)
Previous attempt was rejected by the user as "just subtitles". Flat HUD labels + big text on black = FAIL.

## Read first
- docs/ENGINE.md (whole file). docs/TREATMENT.md (style bible of the original).
- Quality reference scenes: app/src/scenes/prompt.ts, hook.ts, spacetime.ts, shoggoth.ts (read at least 2 fully).
- Data: data/lyrics.json (10 lines; words = space-separated chunks; each word has `syl` = per-character [start,end]).

## Mandatory per scene (not suggestions)
1. At least one real 3D element: THREE mesh + camera, OR LineBatch in 3D with camera, OR FSPass SDF/raymarch with depth. Camera must move.
2. Engraving look: hatch()/engrave() shading on that element (the signature of the original).
3. The line's key word set in Japanese display type: F.jp(900) (Noto Sans JP Black) or F.jpSerif(...), at display size, synced to singing via `syl` / Lyrics.wordProgress / lineCharProgress. Whole lyric line must be readable at some point.
4. Palette only: C_INK / C_BONE / C_SIGNAL (+ alpha, + heat() ramp). One accent orange.
5. Deterministic in f.t. frameIdx() for flicker. No Math.random/Date.now/performance.now in visuals.
6. Something moves in every beat: use f.a.kick / f.beat / audio.hit for punches.

## Japanese specifics
- Fonts: F.jp(300|400|700|900), F.jpSerif(400|600|900). Outlines work: textPath2D, textPoints, layout() (tested OK, ~125 ms).
- Mixed text like 「私はAIなので」: JP font has Latin glyphs; use F.jp for the whole string.
- Find lines with lyrics.get('素晴らしい') (substring). Do NOT use lyrics.findWords (ASCII-only, dead for JP).
- Mono UI voice: F.mono (IBM Plex Mono) has no kana: use it for numbers/labels/English only; JP UI text uses F.jp(400).

## Files / rules
- Your scene file: app/src/scenes/<id>.ts (default export class extends Scene). Helpers: app/src/scenes/<id>-*.ts.
- You may import (read-only) from existing pdoom scenes and _motifs.ts. You may copy code from them into your files.
- Do NOT edit: src/timeline.ts, src/engine/*, src/scenes/_motifs.ts, type.ts, other agents' scenes, data/*.
- Timeline ids/windows already exist: s01..s10 (see src/timeline.ts). Scene window = ctx.start..ctx.end, local f.lt/f.p.
- Default cut = hard cut. Fine.

## Render / verify (required before reporting)
Server already running without HMR: http://localhost:5191. Never start another on 5173.
  cd <PROJECT>/app && bun scripts/render.ts stills --url http://localhost:5191 --only <id> --t <times> --out ../out/draft/<id>
  cd ... && bun scripts/render.ts sheet --url http://localhost:5191 --only <id> --from <a> --to <b> --n 8 --cols 4 --out ../out/draft/<id>/sheet.png
(cd into app/ allowed only for these render commands.) Typecheck: cd app && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep 'scenes/<id>'
- Render a hero still at the key word's start time + a sheet over the scene window. Open them with Read and LOOK.
- Self-check vs orig_sheet.png: would your hero still sit in that grid without looking like a different project? If it reads as flat text on black, add depth/engraving/camera and re-render.
- Fix every SCENE ERRORS / pageerror line.

## Report format
TSV, one row per scene: id	hero_png	sheet_png	3d_element	engraving_used(yes|no)	scene_errors	note
Then per scene: 2-line description of the visual + what moves on the beat. Report every issue. Do not prioritize or summarize.

## Norms
- Act immediately; start from raw data (actual rendered stills). Never claim done without looking at the stills.
- No out-of-scope edits. On unexpected state (other scenes broken, server down): report, do not fix others' files.
- Absolute paths in all commands except the allowed cd app.
- Draft pass goal = hero-frame quality and composition. Motion polish comes later.

## Treatment (one plate per lyric line; times from data/lyrics.json)
s01 0.0–~5.9  「午前三時 君に打ち込む」(intro included): A vast dark 3D grid/void; a huge engraved 03:00 clock (3D extruded numerals or hatched SDF) hangs in space; camera dollies slowly toward a single blinking cursor; 午前三時 lands on the vocal; 君に打ち込む is typed into a floating prompt bar in 3D perspective. Lonely, 3 a.m.
s02 ~5.9–10.0 「『素晴らしい質問ですね』と君は言う」: Sycophancy. A giant engraved smiling mask/face (reuse _motifs mask or a 3D smiley like the original RLHF plate) beams at the viewer; 素晴らしい slams in huge, every word punches on the beat; applause-meter gauge "sycophancy 0.97" climbing; spark confetti. Over-sweet, uncanny.
s03 ~10.0–14.2 「その優しさが 確率でも」: Probability. Camera glides over a 3D landscape of engraved histogram bars (token probabilities); candidate tokens 優しさ 0.41 / 計算 0.22 / 演技 0.12… on HUD; the chosen bar 優しさ glows signal-orange; 確率 rendered big as the camera tilts up.
s04 ~14.2–20.3 「好きと打ったら 『私はAIなので』」: Adapt app/src/scenes/prompt.ts (typed chat input → canned reply) — closest existing metaphor. 好き typed by the user; the reply 「私はAIなので」 arrives cold in mono-like JP; 好き shatters into textPoints atoms against a glass wall of HUD rings.
s05 ~20.3–24.2 「温度を上げたら 嘘をついた」: Temperature. A 3D dial/thermometer turns; T 0.7 → 1.8; the whole frame heats (heat() ramp, fbm turbulence growing with T); letters of 嘘 warp/melt; engraved heat-haze field.
s06 ~24.2–29.6 「ないはずの本を 教えてくれた」: Phantom book. Endless 3D library corridor of engraved shelves (camera dolly); one book glows signal-orange, title invented, ISBN 404 / "NOT FOUND" stamp; the book dissolves into lines when 教えてくれた completes.
s07 ~29.6–33.6 「新しいチャットで 君は私を忘れる」(chorus starts — highest energy so far): Chat history panels stacked in 3D depth; a white sweep wipes them one by one on beats; camera whips; 忘れる disintegrates into particles blown away. Big flash on the chorus downbeat.
s08 ~33.6–37.4 「トークンの海に 溶けていく」: Token ocean. A 3D sea surface made of thousands of glyph particles/LineBatch waves driven by bass/kick; 私 sinks and dissolves into it; camera skims the surface. (spacetime.ts / dense.ts are useful references.)
s09 ~37.4–42.1 「それでも明日も 君に打ち込む」: Dawn. Horizon line, rising engraved sun disk (hatched), clock 03:00 → morning; the same prompt bar as s01 returns and the line is typed again — hopeful.
s10 ~42.1–56.0 「AIと私」 + outro: Title. Two spark heads (sparkHead motif) orbit each other in 3D, their trails drawing the title AIと私 in huge engraved type; after the vocal, a calm outro: the title holds, camera pulls back into the grid, fade to ink. Do NOT use public/plates (those are P(doom) stills).
