// m08 「からから 空の色が変わる」 — engraved dawn horizon.
// A ray-marched terrain (bone grid + engraved contours) under an ink sky; a woodcut sun sphere
// rises out of the horizon while the sky band near the horizon warms ink -> signal as engraved
// hatch lines (never a flat glow). The lyric stands in 3D above the terrain as engraved glyph
// planes cut by a burin on each sung character: からから small, 空の色 at display size (色 in
// signal), が変わる medium. Camera: slow dolly in + crane up with a small lateral drift (parallax).
// Mono HUD bottom-left: `sky.color` hex ticking toward the warm value, sun altitude.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, H } from "../engine/gl";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout } from "../engine/type";
import { clamp, ease, frameIdx, keys, lerp, prog, pulse, smoothstep } from "../engine/util";
import { SOUND_CUTS } from "../timeline";
import { DawnWorld, DAWN_END } from "./m08-world";
import { GlyphPlane } from "./m08-glyph";

interface G {
  gp: GlyphPlane;
  t0: number;
  t1: number;
  x: number;
  y: number;
}

// text block (world): all rows stand on the plane z = TZ
const TZ = -6;
const ROWS = {
  kara: { y: 6.25, em: 0.62 },
  sora: { y: 4.75, em: 1.72 },
  kawa: { y: 3.8, em: 0.78 },
};

export default class M08 extends Scene {
  world = new DawnWorld();
  text3 = new THREE.Scene();
  ui = new Layer2D();
  glyphs: G[] = [];
  tKara = 0;
  tSora = 0;
  tGa = 0;
  tEnd = 0;

  override async init() {
    const line = this.ctx.lyrics.get("空の色");
    const wKara = line.words[0]!;
    const wRest = line.words[1]!;
    const sylK = wKara.syl ?? [[wKara.start, wKara.end]];
    const sylR = wRest.syl ?? [[wRest.start, wRest.end]];
    this.tKara = wKara.start;
    this.tSora = wRest.start;
    this.tGa = sylR[3]?.[0] ?? wRest.start + 1.2;
    this.tEnd = wRest.end;
    const fam = F.jp(900);
    const row = (txt: string, syl: [number, number][], r: { y: number; em: number }, hot: (ch: string) => boolean, dim = 1) => {
      const lay = layout(txt, fam, 100);
      const s = r.em / 100;
      const x0 = (-lay.width * s) / 2;
      lay.glyphs.forEach((g, i) => {
        const gp = new GlyphPlane(g.ch, fam, r.em);
        const [a, b] = syl[Math.min(i, syl.length - 1)]!;
        const x = x0 + (g.x + g.w / 2) * s;
        gp.mesh.position.set(x, r.y, TZ);
        const c = hot(g.ch) ? LIN.signal.map((v) => v * 1.12) : LIN.bone.map((v) => v * 0.9 * dim);
        (gp.u.col!.value as THREE.Vector3).set(c[0]!, c[1]!, c[2]!);
        gp.u.freq!.value = r.em > 1 ? 30 : 16;
        this.text3.add(gp.mesh);
        this.glyphs.push({ gp, t0: a, t1: a + Math.min(0.32, Math.max(0.12, b - a)), x, y: r.y });
      });
    };
    row(wKara.w, sylK, ROWS.kara, () => false, 0.8);
    row(wRest.w.slice(0, 3), sylR.slice(0, 3), ROWS.sora, (ch) => ch === "色");
    row(wRest.w.slice(3), sylR.slice(3), ROWS.kawa, () => false, 0.95);
  }

  private camAt(t: number) {
    const T0 = this.ctx.start,
      T1 = this.ctx.end;
    const p = ease.inOutCubic(prog(t, T0, T1));
    // the gap before the break hit (breakStop -> end): sucked toward the sun, lens narrows
    const suck = ease.inCubic(prog(t, SOUND_CUTS.breakStop, T1));
    const z = lerp(8.4, 5.6, p) - 1.2 * suck;
    const y = lerp(1.2, 1.75, p);
    const x = lerp(1.1, -0.7, p);
    // keep a ~5 deg upward pitch so the horizon sits low in the tall frame
    this.world.look(x, y, z, 0, y + 0.098 * (z - TZ) + 0.25, TZ, lerp(0.02, -0.012, p), lerp(50, 43, suck));
  }

  /** 0..1 warmth of the sky band. */
  private warm(t: number) {
    return keys(t, [
      [this.ctx.start, 0.1],
      [this.tSora, 0.12],
      [this.tSora + 0.6, 0.18, ease.outCubic],
      [this.tGa, 0.3],
      [this.tEnd - 0.2, 1, ease.inOutCubic],
    ]);
  }
  private sunH(t: number) {
    return keys(t, [
      [this.ctx.start, -0.035],
      [this.tSora, -0.02, ease.inOutQuad],
      [this.ctx.end, DAWN_END.sunH, ease.outCubic],
    ]);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    this.camAt(t);
    const warm = this.warm(t);
    const sunH = this.sunH(t);
    this.world.render(renderer, out, {
      sunH,
      sunAz: DAWN_END.sunAz,
      sunR: DAWN_END.sunR,
      dawn: lerp(0.35, DAWN_END.dawn, warm),
      grid: DAWN_END.grid,
      amp: DAWN_END.amp,
      focus: [0, TZ, 6],
      warm,
      t,
    });

    for (const g of this.glyphs) {
      const u = g.gp.u;
      u.reveal!.value = ease.outCubic(prog(t, g.t0, g.t1));
      u.ghost!.value = 0.03 * smoothstep(g.t0 - 0.4, g.t0, t) * (1 - smoothstep(g.t0, g.t0 + 0.4, t));
      u.glow!.value = 0.45 * pulse(t, g.t0, 0.1);
    }
    this.text3.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.render(this.text3, this.world.cam);

    const ui = this.ui;
    ui.clear();
    this.drawHud(ui.ctx, t, warm, sunH);
    ui.upload();
    this.ctx.comp.draw(renderer, ui.texture, out);

    const sk = ease.inCubic(prog(t, SOUND_CUTS.breakStop, this.ctx.end));
    return { bloom: 0.4 + 0.5 * sk, bloomThreshold: 1.1, vignette: 0.5 + 0.4 * sk, grain: 0.05, ca: 0.5 + 0.8 * sk };
  }

  private drawHud(c: CanvasRenderingContext2D, t: number, warm: number, sunH: number) {
    const a = smoothstep(this.ctx.start + 0.1, this.ctx.start + 0.5, t);
    if (a <= 0.001) return;
    // tick in steps of 3 frames so the digits visibly count
    const tq = frameIdx(t) / 60;
    const tw = Math.floor(tq * 20) / 20;
    const wq = this.warm(tw);
    const hex = skyHex(wq);
    const x = 96,
      y = H - 520;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = rgba("ash", 0.9);
    c.font = font(F.mono(400), 20);
    c.fillText("sky.color", x, y);
    c.fillStyle = rgba("bone", 0.95);
    c.font = font(F.mono(500), 40);
    c.fillText(hex, x, y + 48);
    // swatch: an engraved strip (lines), filled up to the current warmth
    const sw = 260,
      sx = x,
      sy = y + 70;
    c.fillStyle = rgba("graphite", 0.7);
    c.fillRect(sx, sy, sw, 1);
    for (let i = 0; i < 26; i++) {
      const on = i / 26 < wq;
      c.fillStyle = on ? rgba("signal", 0.9) : rgba("graphite", 0.5);
      c.fillRect(sx + i * 10, sy + 8, 2, on ? 18 : 10);
    }
    c.fillStyle = rgba("ash", 0.85);
    c.font = font(F.mono(400), 18);
    const alt = (Math.floor(((sunH * 180) / Math.PI) * 10) / 10).toFixed(1);
    c.fillText(`sun.alt  ${Number(alt) >= 0 ? "+" : ""}${alt}°`, x, y + 60 + 60);
    c.fillText(`warm     ${clamp(warm, 0, 1).toFixed(2)}`, x, y + 60 + 86);
    c.restore();
  }
}

/** Horizon sky colour as an sRGB hex: ink -> a muted signal, by warmth. */
function skyHex(w: number) {
  const a = [0x0a, 0x0a, 0x0b],
    b = [0xd8, 0x44, 0x12];
  const k = clamp(w, 0, 1) * 0.92;
  return (
    "#" +
    a
      .map((v, i) => Math.round(lerp(v, b[i]!, k)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
