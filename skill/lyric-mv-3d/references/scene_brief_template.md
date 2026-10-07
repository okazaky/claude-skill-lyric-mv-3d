# Scene brief — 「{{TITLE}}」 on the 3D lyric-MV engine (mexicat/pdoom-video fork)

<!-- 使い方: {{...}} を埋めて PROJECT/SCENE_BRIEF.md に置き、場面エージェント全員に読ませる。
     Treatment（1歌詞行=1場面の絵コンテ）は歌詞を読んで毎回書く。ここが作品の質を決める。 -->

Project: Japanese song「{{TITLE}}」({{DURATION}} s, {{BPM}} BPM). Engine = mexicat/pdoom-video fork (three.js, bun+Vite).
Canvas: {{W}}x{{H}} logical px ({{ORIENTATION}}). `W`/`H` from engine/gl.ts. {{ORIENTATION_NOTE}}
Quality bar = the previous MV「AIと私」3D版. LOOK first:
- {{PROJECT}}/out/ref_sheet.png (16 frames of AIと私 3D: engraved 3D clock, smiley sphere, histogram city, glass wall, heat dial, library, token sea, sun sphere, title)
Flat HUD labels + big text on black = FAIL (user rejected that as "just subtitles").

## Read first
- docs/ENGINE.md (whole file). docs/TREATMENT.md (style bible of the original).
- Japanese reference scenes (same engine, previous MV): app/ref_aitowatashi/s01.ts, s03.ts, s05.ts, s08.ts, s10.ts (+ their -glsl/-geo helpers). Read at least 2 fully. They are outside src/ only so they don't build; copy code freely.
- Original P(doom) scenes: app/src/scenes/prompt.ts, hook.ts, spacetime.ts, shoggoth.ts.
- Data: data/lyrics.json (words = space-separated chunks; `syl` = per-character [start,end]). app/src/timeline.ts (scene ids and windows, already generated).

## Mandatory per scene
1. At least one real 3D element: THREE mesh + camera, OR LineBatch in 3D with camera, OR FSPass SDF/raymarch with depth. Camera must move (slow dolly/orbit/crane).
2. Engraving look: hatch()/engrave() shading on that element (signature of the style).
3. The line's key word in Japanese display type F.jp(900) or F.jpSerif(...) at display size, synced to singing via `syl` / Lyrics.wordProgress / lineCharProgress. Whole lyric line readable at some point.
4. Palette only: C_INK / C_BONE / C_SIGNAL (+ alpha, + heat() ramp). Orange accent covers roughly 10-20% of the frame at most.
5. Deterministic in f.t. frameIdx() for flicker. No Math.random/Date.now/performance.now in visuals.
6. Do NOT pulse/shake/zoom on every beat. User explicitly rejected per-beat shaking (engine kick signal is already 0). Motion = continuous camera moves + events on lyric word starts. Calm, precise, readable.

## User taste (from feedback on previous MVs)
- Reference reproduction = the visual core (3D objects, camera, depth, bold per-line imagery), not finishing effects.
- No busy layering: max 2-3 moving elements at once. A scene the user called "うざい" had 5 beat-synced elements.
- Japanese UI text uses F.jp(400); F.mono has no kana (numbers/labels/English only).
- Find lines with lyrics.get('<substring>'). Do NOT use lyrics.findWords (ASCII-only).

## Files / rules
- Your scene: app/src/scenes/<id>.ts (default export class extends Scene). Helpers: app/src/scenes/<id>-*.ts.
- Do NOT edit: src/timeline.ts, src/engine/*, src/scenes/_motifs.ts, type.ts, other agents' scenes, data/*.
- Scene window = ctx.start..ctx.end, local f.lt/f.p. Default cut = hard cut.
- Write files only with Write/Edit tools (Bash writes can hang on a guard).

## Render / verify (required before reporting)
Server (no HMR) on http://localhost:{{PORT}}. Never start another server.
  cd {{PROJECT}}/app && bun scripts/render.ts stills --url http://localhost:{{PORT}} --only <id> --t <times> --out ../out/draft/<id>
  cd {{PROJECT}}/app && bun scripts/render.ts sheet --url http://localhost:{{PORT}} --only <id> --from <a> --to <b> --n 8 --cols 4 --out ../out/draft/<id>/sheet.png
Typecheck: cd {{PROJECT}}/app && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep 'scenes/<id>'
- Render hero still at key word start + sheet over the window. Open with Read and LOOK. Compare with ref_sheet.png: same family? If flat text on black, add depth/engraving/camera, re-render.
- Fix every SCENE ERRORS / pageerror line.

## Report format
TSV: id	hero_png	sheet_png	3d_element	engraving_used(yes|no)	scene_errors	note
Then per scene 2 lines: visual + what moves. Report every issue. Do not prioritize or summarize.

## Norms
- Act immediately; start from rendered stills. Never claim done without looking.
- No out-of-scope edits. On unexpected state (other scenes broken, server down): report, don't fix others' files.
- Absolute paths except the allowed `cd app` for render/tsc.

## Treatment (one plate per lyric line; ids/times from app/src/timeline.ts)
{{TREATMENT}}
