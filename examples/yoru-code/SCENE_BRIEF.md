# Scene brief — 「夜をほどくコード」 on the 3D lyric-MV engine (mexicat/pdoom-video fork)

Project: Japanese song「夜をほどくコード」(50.81 s, 143.95 BPM). Engine = mexicat/pdoom-video fork (three.js, bun+Vite).
Canvas: 1080x1920 logical px (vertical 9:16, YouTube Shorts). `W`/`H` from engine/gl.ts. VERTICAL: compose for a tall frame — stack text vertically or in 2 lines, key word max width 960 px; keep text out of the top 220 px and bottom 380 px (Shorts UI). Cameras: use taller FOV/closer framing so the 3D object fills the middle of the frame, not a thin horizontal strip. Reference scenes were 1920x1080 — re-layout, do not copy their coordinates.
Quality bar = the previous MV「AIと私」3D版. LOOK first:
- <PROJECT>/out/ref_sheet.png (16 frames of AIと私 3D: engraved 3D clock, smiley sphere, histogram city, glass wall, heat dial, library, token sea, sun sphere, title)
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
Server (no HMR) on http://localhost:5181. Never start another server.
  cd <PROJECT>/app && bun scripts/render.ts stills --url http://localhost:5181 --only <id> --t <times> --out ../out/draft/<id>
  cd <PROJECT>/app && bun scripts/render.ts sheet --url http://localhost:5181 --only <id> --from <a> --to <b> --n 8 --cols 4 --out ../out/draft/<id>/sheet.png
Typecheck: cd <PROJECT>/app && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep 'scenes/<id>'
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
Theme: one night in a world made of code. Black terminal window, moon, two spinning tops (white "くるくる" / black-with-orange-rim "くろくろ"), dots & lines, dawn at the end. Song is fast (144 BPM) and playful: SPEED comes from faster camera moves than AIと私, hard cuts at line starts, and crisp events on each sung character (syl) — NOT from per-beat pulsing.
Recurring motifs (keep consistent across agents): TOPS = two engraved 3D spinning tops (lathe geometry), top A bone/white, top B ink-black body with C_SIGNAL rim. MOON = engraved sphere (like AIと私 sun sphere) in bone. WINDOW = 3D black terminal slab with engraved bezel + 3 title-bar dots.

- m01 0.00-4.92 「くるくる くろくろ クロのコード」 vocal from 1.58 s (before = intro: camera cranes down through darkness onto an engraved grid floor, mono HUD "yoru.code  00:00"). TOPS land and spin, one per word (くるくる -> top A, くろくろ -> top B), camera low orbit. On 「コード」 a big 3D extruded engraved word コード stands up behind them (クロの smaller).
- m02 4.92-7.62 「ぽつぽつ 点と線」 Engraved spheres drop onto the 3D grid one per character of ぽつぽつ (each lands with a small ring on the floor), then on 点と線 orange lines connect them into a 3D constellation; camera orbits fast. Key word 点と線.
- m03 7.62-9.98 「かたかた 肩ならべ」 Two 3D engraved keyboards/terminal slabs side by side (shoulder to shoulder); one key presses per sung character of かたかた; camera trucks sideways along them. Key word 肩ならべ.
- m04 9.98-13.70 「黒い窓に 夜が跳ねる」 WINDOW floats in space, camera dollies toward it; inside, MOON bounces (squash&stretch on contact) on 跳ねる, leaving an orange arc trail. Key word 跳ねる; 黒い窓に 夜が smaller.
- m05 13.70-17.72 「コード コード 夜をほどく」 (chorus) A tangled engraved 3D tube knot (TorusKnot-like). コード コード stamps twice (each on its word start). On ほどく the knot unravels into straight parallel lines that recede to the vanishing point; camera pulls back. Key word ほどく huge.
- m06 17.72-21.06 「くるくる くろくろ まだ踊る」 TOPS return, now orbiting each other on a big engraved vinyl/turntable disc (dancing). Camera orbit + crane. Key word 踊る.
- m07 21.06-24.36 「コード コード 音になる」 A floor of tiny code glyph tiles lifts into a 3D engraved spectrum city (bars rising; like AIと私 histogram city); bars rise on syl events, one orange bar. Key word 音; になる medium.
- m08 24.36-29.26 「からから 空の色が変わる」 Engraved horizon terrain; a sun sphere rises; the sky band near the horizon warms ink -> C_SIGNAL (orange <= 20% of frame). Mono HUD `sky.color` value ticking. Key word 空の色.
- brk08 29.26-41.28 (instrumental, 12 s, NO lyrics) FAST: camera flies forward through a long tunnel of floating WINDOW slabs and streaming code lines, accelerating. Change shot only on bar heads (data/audio.json downbeats, ~every 1.67 s) — max 4-5 shots, each a different camera angle of the same tunnel. Small mono HUD "INTERLUDE". Last 2 s: tunnel opens to the dawn horizon (hand-off to m09).
- m09 41.28-50.81 「コード コード 夜をほどく」 (last line, 41.28-44.6 sung) Many lines converge into ONE long horizon line at dawn; 夜をほどく big 3D extruded engraved. From ~45.0 s: end title like AIと私 title card — "夜をほどくコード" in big extruded engraved type (ほどく or コード in C_SIGNAL), MOON/sun sphere beside it, small mono "END OF NIGHT". Last 2 s calm, slow drift.

## MOTION PASS (2026-10-07, user feedback on v1: 「もっと動きが欲しい」 = v1 felt too static)
Goal: clearly more motion everywhere, still NO per-beat pulse/shake (user rejected that before).
Do, per scene:
1. Camera: 2-3x larger and faster moves (fast orbit / swoop / push-in / crane). Never a near-static camera for > 0.6 s.
2. In-line cuts: 2-4 hard cuts per lyric line, placed on word starts (syl/word start times), each cut = new camera angle or distance of the same 3D set. brk08: may cut on every 2 beats instead of bars.
3. Objects travel: hero objects move through space (tops race/collide, spheres drop from higher and bounce bigger, knot whips, bars shoot up, windows fly past camera), not just spin in place.
4. Text enters with motion: 3D key words fly/slam in from depth or rotate in (0.15-0.3 s, ease out), not just appear.
5. Keep: max 3 moving element groups at once, palette, readability (whole line readable >= 0.5 s), safe zones.
Verify as before (stills + sheet, LOOK). Additionally report camera path change per scene in 1 line.

## OPEN SKY PASS (2026-10-07, user feedback on v2) — supersedes MOTION PASS for brk08 + m09
User: 「0:28までは前のほうがいい。0:28以降にもっとスピード感が欲しい。開放感というか」
- m01-m08 were reverted to v1 by coordinator. Do NOT touch them or shared helpers they use (m01-*, m02-*, m05-kit exports used by m05/m07, m08-world exports).
- After 0:28 the feeling must change from enclosed to OPEN + FAST: release, vast sky, speed.
brk08 (29.26-41.28):
1. 29.26 -> first downbeat after ~31.0 (≈31.89): keep the window tunnel but shorter, accelerating = tension.
2. BREAKOUT on that downbeat: windows blast outward and scatter, camera bursts out into a vast open dawn sky (huge horizon, sun, engraved terrain far below). This is the emotional release of the MV.
3. Then FAST open-air flight: camera skims low over engraved terrain toward the sun (ground rushing under camera, strong parallax, wide FOV 70-85), crane up high to reveal vastness, banking swoop, dive back down. Speed streaks / code lines rushing past. A few windows recede like a flock. Cuts on bar heads (2-beat cuts allowed in 35.2-38.6).
4. Sky occupies large part of frame in open shots. Orange <= 20%.
5. Keep render cost <= v1 brk08 (it was the slowest section): fewer windows after breakout, cull far geometry.
6. End: hand off to m09 at matching dawn framing, camera still moving forward.
m09 (41.28-50.81):
1. 41.28-44.6 (sung): continue the fast forward flight over the dawn terrain; lines rush past and converge into the horizon; word starts trigger cuts or speed changes. Wide, open framing.
2. 45.0+: title card while camera keeps flying/rising so the vast horizon opens behind the title (slow but clearly moving, no static). Title text fits 960 px, readable >= 3 s.
Same norms: no per-beat shake, max 3 moving groups, Write/Edit only, verify with stills + sheet and LOOK.
