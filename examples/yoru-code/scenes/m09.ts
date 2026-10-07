// m09 「コード コード 夜をほどく」 (last line) + end title.
// Dawn: an engraved ground (grid + topographic contours) under an ink sky with a thin warm band at the horizon.
// Dozens of floating code lines hang in the air in front of the camera; on every sung character a batch of
// them is pulled down onto the far horizon, until they all lie end to end as ONE long horizon line.
// コード is stamped twice (extruded engraved block, the second pushes the first back); 夜をほどく is cut by the
// burin, ほどく in signal. From ~45.0 s the end title: the コード stamps fly back into depth, a second title line
// コード is cut under 夜をほどく (「夜をほどくコード」), the engraved MOON rises beside it, small mono
// "END OF NIGHT". The last two seconds only drift slowly, then fade to ink.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, measure } from "../engine/type";
import type { Line } from "../engine/lyrics";
import { clamp, ease, hash, lerp, prog, pulse, smoothstep } from "../engine/util";
import { EWord, TextRig, pickShot, sylOf } from "./m05-kit";
import { dispWord } from "./_disp";
import { SOUND_CUTS } from "../timeline";
import { BANDS, cityGeometry, cityMaterial, glyphAtlas } from "./m07-city";
import { DawnGround } from "./m09-world";
import { Moon } from "./m09-moon";

const NL = 120;
const HZ = 170; // distance ahead of the travelling camera where the horizon line forms
const HY = 3.0; // height of the horizon line (lies on the far fogged terrain)
const V = 26; // forward flight speed while the line is sung (world units / s)
const VT = 9; // cruising speed under the title
const DT = 1 / 240;
const REP = 120; // speed lines repeat every REP units along z
const MOON_Y = 400; // moon centre (rig px) on the end card
// the moon sits 2.5 behind the type plane, so on screen it lands nearer the centre: rig 400 -> 507 px measured
const CROWN: [number, number, number] = [540, 507, 155]; // emblem crown centre / moon radius on screen (px)

interface CL {
  x: number;
  y: number;
  base: number;
  len: number;
  x0: number;
  x1: number;
  ev: number;
  hot: boolean;
}

export default class M09 extends Scene {
  world = new DawnGround();
  L3 = new LineBatch(4000, { screen2D: false, blend: "add" });
  burst = new LineBatch(4 * 180 + 64, { screen2D: true, blend: "add" });
  dist = new Float32Array(0);
  city3 = new THREE.Scene();
  cMat = cityMaterial(glyphAtlas());
  zCity = 0;
  rig = new TextRig();
  moon = new Moon();
  ui = new Layer2D();
  line!: Line;
  codeA!: EWord;
  codeB!: EWord;
  yoru!: EWord;
  hodoku!: EWord;
  codeT!: EWord;
  lines: CL[] = [];
  events: number[] = [];
  tTitle = 45.0;

  override async init() {
    this.line = this.ctx.lyrics.get("コード コード 夜をほどく", 1);
    for (const w of this.line.words) for (let i = 0; i < w.w.length; i++) this.events.push(sylOf(w, i)[0]);
    // the end title lands on the biggest swell of the track (everything comes back in after the drop)
    this.tTitle = SOUND_CUTS.rise;
    const city = new THREE.Mesh(cityGeometry(), this.cMat);
    city.frustumCulled = false;
    this.city3.add(city);
    const n = Math.ceil((this.ctx.end - this.ctx.start + 1) / DT);
    this.dist = new Float32Array(n + 1);
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      this.dist[i] = acc;
      acc += this.speed(this.ctx.start + i * DT) * DT;
    }
    // the glyph metropolis erupts on the swell, a skyline 80+ units ahead of the title camera
    this.zCity = -this.travel(this.tTitle) - 22 - 150;
    // speed lines: world-fixed code strokes along the flight path that rush past the camera; on their sung
    // character each one leaves the air and becomes a contiguous piece of ONE horizon line far ahead
    const span = 260;
    // a permutation (no gaps, no overlaps): the pieces tile the horizon line end to end
    const settles = Array.from({ length: NL }, (_, i) => i).filter((i) => hash(i, 9) >= 0.3);
    const NS = settles.length;
    const slot = new Map(settles.map((v, j) => [v, j] as const));
    const perm = Array.from({ length: NS }, (_, i) => i).sort((p, q) => hash(p, 7) - hash(q, 7));
    for (let i = 0; i < NL; i++) {
      const side = hash(i, 1) < 0.5 ? -1 : 1;
      const order = perm[slot.get(i) ?? 0]!;
      this.lines.push({
        x: side * (1.6 + 13 * hash(i, 2) ** 1.4),
        y: 0.6 + 13 * hash(i, 3) ** 1.6,
        base: hash(i, 4) * REP,
        len: 2.5 + 7 * hash(i, 5) ** 2,
        x0: -span / 2 + (span * order) / NS,
        x1: -span / 2 + (span * (order + 1)) / NS,
        ev: slot.has(i) ? i % this.events.length : -1, // -1: a pure speed line that never settles
        hot: hash(i, 8) < 0.07,
      });
    }
    const r = this.rig;
    const big = r.em(270);
    this.codeA = new EWord("code", F.jp(900), big, big * 0.32);
    this.codeB = new EWord("code", F.jp(900), big, big * 0.32);
    const em2 = r.em(186);
    this.yoru = new EWord("夜を", F.jp(900), em2, em2 * 0.32);
    this.hodoku = new EWord("ほどく", F.jp(900), em2, em2 * 0.34);
    const em3 = r.em(290);
    this.codeT = new EWord("code", F.jp(900), em3, em3 * 0.34);
    this.codeA.setCol(LIN.bone, 0.95);
    this.codeB.setCol(LIN.bone, 0.95);
    this.yoru.setCol(LIN.bone, 0.92);
    this.hodoku.setCol(LIN.signal, 1.15);
    this.codeT.setCol(LIN.bone, 0.95);
    for (const g of this.hodoku.glyphs) g.fu.plate!.value = 0.8;
    r.scene.add(this.codeA.group, this.codeB.group, this.yoru.group, this.hodoku.group, this.codeT.group, this.moon.mesh);
    const lineW = this.yoru.width + this.hodoku.width;
    const lx = r.wx(540) - lineW / 2;
    this.yoru.group.position.set(lx, r.wy(930), 0);
    this.hodoku.group.position.set(lx + this.yoru.width, r.wy(930), 0);
    this.codeT.group.position.set(r.wx(540) - this.codeT.width / 2, r.wy(1250), 0);
  }

  /** forward speed: fast, near-hover in the drop (42.03), building rush into the swell, then a cruise under the title */
  private speed(t: number) {
    const { drop, rise } = SOUND_CUTS;
    if (t < drop) return V;
    if (t < rise - 0.85) return lerp(V, 0.25 * V, ease.outCubic(clamp((t - drop) / 0.35)));
    if (t < rise) return lerp(0.25 * V, 2.2 * V, ease.inCubic(prog(t, rise - 0.85, rise)));
    return VT + (2.2 * V - VT) * Math.exp(-(t - rise) / 0.8);
  }

  /** distance flown forward (camera travels toward -z), integrated from speed() */
  private travel(t: number) {
    const x = (t - this.ctx.start) / DT;
    const i = clamp(Math.floor(x), 0, this.dist.length - 2);
    return lerp(this.dist[i]!, this.dist[i + 1]!, clamp(x - i, 0, 1));
  }

  /** hard cuts on word/syllable starts: valley skim / crane up into the open / banking dive / low rush / rising title flight */
  private camera(t: number) {
    const w = this.line.words;
    const s = pickShot(t, [this.ctx.start, SOUND_CUTS.drop, w[2]!.start, sylOf(w[2]!, 2)[0], this.tTitle], this.ctx.end);
    const q = ease.outCubic(s.p);
    const z = -this.travel(t);
    const W_ = this.world;
    if (s.i === 0) {
      W_.aim(lerp(-1.2, 1.2, s.p), 1.7 + 0.3 * Math.sin(s.lt * 5), z, lerp(-0.06, 0.05, s.p), 0.14, lerp(-0.14, 0.03, q), 80);
    } else if (s.i === 1) {
      // the drop: almost still, hanging high in the quiet
      W_.aim(lerp(2.4, 3.0, s.p), lerp(9, 10, s.p), z + 8, lerp(0.2, 0.14, s.p), lerp(-0.04, -0.08, s.p), lerp(0.04, 0.0, s.p), 62);
    } else if (s.i === 2) {
      const d = ease.inOutCubic(s.p);
      W_.aim(lerp(9, 2.5, d), lerp(13, 3.6, d), z + 4, lerp(-0.42, -0.08, d), lerp(-0.2, 0.02, d), lerp(0.38, 0.06, d), 80);
    } else if (s.i === 3) {
      W_.aim(lerp(-0.8, 0.4, s.p), lerp(2.6, 2.0, q), z - 22 * ease.inQuad(s.p), 0.02, 0.12, lerp(-0.05, 0.02, q), lerp(80, 86, q));
    } else {
      // title: keep flying forward and rise so the vast horizon opens up behind the title (horizon stays low)
      const b = ease.inOutQuad(s.p);
      W_.aim(0, lerp(2.6, 24, b), z - 22, 0, lerp(0.37, 0.33, b), 0, 72); // centred and level: the end card is symmetric
    }
  }

  private drawLines(t: number) {
    const lb = this.L3;
    lb.clear();
    const T0 = this.ctx.start;
    const zc = -this.travel(t);
    const camX = this.world.cam.position.x;
    const sp = clamp((this.travel(t + 1 / 60) - this.travel(t)) * 60 / V); // speed 0..1 stretches the strokes
    const appear = smoothstep(T0 - 0.1, T0 + 0.25, t);
    for (const l of this.lines) {
      const free = l.ev < 0;
      const e = free ? 1e9 : this.events[l.ev]!;
      const k = free ? 0 : ease.inOutCubic(prog(t, e - 0.05, e + 0.6));
      if (free && t > this.tTitle + 1.2) continue;
      // world-fixed stroke, wrapped into the window [zc-115, zc+5] ahead of the camera: it rushes past
      const zw = zc - 115 + ((((l.base - (zc - 115)) % REP) + REP) % REP);
      const len = l.len * lerp(0.4, 1.6, sp);
      const far = smoothstep(zc - 115, zc - 80, zw); // fade in at the far end (no popping)
      const ax = lerp(camX + l.x, camX + l.x0, k),
        ay = lerp(l.y, HY, k),
        az = lerp(zw, zc - HZ, k);
      const bx = lerp(camX + l.x, camX + l.x1, k),
        by = lerp(l.y, HY, k),
        bz = lerp(zw + len, zc - HZ, k);
      // the hot strokes cool to bone under the title so the finished horizon is one even line (symmetric card)
      const hk = l.hot ? 1 - smoothstep(this.tTitle, this.tTitle + 1.0, t) : 0;
      const c = [0, 1, 2].map((j) => lerp(LIN.bone[j]!, LIN.signal[j]!, hk)) as [number, number, number];
      const I = lerp(lerp(0.75, 1.15, k), 1.7, hk);
      const flash = 0.7 * pulse(t, e + 0.7, 0.2);
      const a = appear * lerp(far * 0.85, 1, k) * (free ? 1 - smoothstep(this.tTitle, this.tTitle + 1.2, t) : 1);
      lb.seg(ax, ay, az, bx, by, bz, lerp(1.7, 2.6, k), c[0] * (I + flash), c[1] * (I + flash), c[2] * (I + flash), a);
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const w = this.line.words;
    const T1 = this.ctx.end;
    const tt = this.tTitle;
    const conv = prog(t, this.events[0]!, this.events[this.events.length - 1]! + 0.9);
    this.camera(t);
    this.world.render(renderer, out, {
      dawn: lerp(0.7, 1.0, conv),
      grid: 0.9,
      warm: lerp(0.5, 1, smoothstep(tt - 0.3, tt + 0.8, t)),
      sun: Math.max(lerp(0.6, 1, conv), 1 - smoothstep(this.ctx.start, this.ctx.start + 0.6, t)),
    });
    this.drawLines(t);
    this.L3.render(renderer, out, this.world.cam);
    if (t >= tt - 0.02) this.renderCity(t, out);

    // ---- type
    const r = this.rig;
    const after = prog(t, tt, T1);
    const pre = prog(t, this.ctx.start, tt);
    r.look(lerp(lerp(3.0, -2.5, pre), 0, ease.outCubic(prog(t, tt, tt + 1.2))), 0.6 + 0.9 * Math.sin(pre * Math.PI) - 1.2 * after);
    const big = r.em(270);
    const kA = prog(t, w[0]!.start - 0.02, w[0]!.start + 0.2, ease.outExpo);
    const kB = prog(t, w[1]!.start - 0.02, w[1]!.start + 0.2, ease.outExpo);
    this.codeA.reveal = t >= w[0]!.start - 0.02 ? 1 : 0;
    this.codeB.reveal = t >= w[1]!.start - 0.02 ? 1 : 0;
    const push = ease.outCubic(prog(t, w[1]!.start, w[1]!.start + 0.3));
    const leave = ease.inCubic(prog(t, tt - 0.15, tt + 0.5));
    const bx = r.wx(540) - this.codeA.width / 2,
      by = r.wy(520);
    this.codeA.group.rotation.y = (1 - kA) * 0.9;
    this.codeB.group.rotation.y = (1 - kB) * 0.9;
    this.codeA.group.position.set(bx, by + push * big * 1.3 + leave * 1.0, lerp(4.5, 0, kA) - push * 4.5 - leave * 14);
    this.codeA.opacity = clamp(kA * 3) * lerp(1, 0.42, push) * (1 - leave);
    this.codeB.group.position.set(bx, by + leave * 1.2, lerp(4.5, 0, kB) - leave * 14);
    this.codeB.opacity = clamp(kB * 3) * (1 - leave);
    for (const [word, wd] of [
      [this.codeA, w[0]!],
      [this.codeB, w[1]!],
    ] as const)
      word.glyphs.forEach((g, i) => (g.glow = 0.9 * pulse(t, sylOf(dispWord(wd), i)[0], 0.12)));
    const wy = w[2]!;
    [...this.yoru.glyphs, ...this.hodoku.glyphs].forEach((g, i) => {
      const [a, b] = sylOf(wy, i);
      g.reveal = prog(t, a - 0.02, a + Math.max(0.14, Math.min(0.3, b - a)), ease.outCubic);
      g.glow = 0.5 * pulse(t, a, 0.15);
      const k = prog(t, a - 0.02, a + 0.25, ease.outExpo);
      g.group.position.z = lerp(4.0, 0, k);
      g.group.rotation.y = (1 - k) * -1.0;
    });
    // title card: the whole title drifts slowly toward the lens (+8 % size, stays inside 960 px)
    const near = 0.9 * ease.inOutQuad(after);
    this.yoru.group.position.z = near;
    this.hodoku.group.position.z = near;
    this.codeT.group.position.z = near;
    // title line 2: コード, cut glyph by glyph
    this.codeT.glyphs.forEach((g, i) => {
      const a = tt + 0.25 + i * 0.22;
      g.reveal = prog(t, a, a + 0.5, ease.outCubic);
      g.glow = 0.3 * pulse(t, a, 0.2);
      const k = prog(t, a, a + 0.3, ease.outExpo);
      g.group.position.z = lerp(4.0, 0, k);
      g.group.rotation.x = (1 - k) * -1.1;
    });
    // the moon rises from behind the title to the centre above it: the mark of the end card
    const mr = ease.outCubic(prog(t, tt + 0.4, tt + 2.2));
    const mrad = r.em(190);
    this.moon.update(r.cam, r.wx(540), r.wy(lerp(900, MOON_Y, mr)), -2.5, mrad, 0.35 + 0.08 * (t - tt), 0.22, mr);
    r.render(renderer, out);

    // ---- title burst on the swell: rings and rays fly out from behind the title
    this.fillBurst(t);
    if (this.burst.count > 0) this.burst.render(renderer, out);

    // ---- END OF NIGHT
    const ui = this.ui;
    ui.clear();
    this.drawCrown(ui.ctx, t);
    const ea = smoothstep(tt + 1.2, tt + 1.9, t);
    if (ea > 0) {
      const c = ui.ctx;
      c.globalAlpha = ea;
      const s = "END OF NIGHT";
      c.font = font(F.mono(500), 26);
      c.fillStyle = rgba("bone", 0.85);
      const tw = measure(s, F.mono(500), 26, 6);
      let x = W / 2 - tw / 2;
      for (const ch of s) {
        c.fillText(ch, x, 1318);
        x += measure(ch, F.mono(500), 26) + 6;
      }
      c.fillStyle = rgba("ash", 0.7);
      c.fillRect(W / 2 - 40, 1336, 80, 1);
      c.font = font(F.mono(400), 16);
      const s2 = "yoru.code — 05:12 · exit 0";
      c.fillStyle = rgba("ash", 0.85);
      c.fillText(s2, W / 2 - measure(s2, F.mono(400), 16) / 2, 1364);
    }
    ui.upload();
    this.ctx.comp.draw(renderer, ui.texture, out);

    // out of brk08's glare (bright at the first frame) and a hit on the swell
    const glare = 1 - smoothstep(this.ctx.start, this.ctx.start + 0.45, t);
    const hit = pulse(t, tt, 0.3);
    const sk = t < tt ? ease.inCubic(prog(t, SOUND_CUTS.riseStop, tt)) : 0; // the gap before the swell
    return {
      bloom: 0.4 + 1.6 * glare + 1.1 * hit,
      bloomThreshold: lerp(1.1, 0.45, Math.max(glare, hit)),
      vignette: 0.5 + 0.45 * sk - 0.2 * hit,
      grain: 0.05,
      ca: 0.4 + 2.0 * glare + 1.6 * hit,
      fade: smoothstep(T1 - 0.9, T1 - 0.02, t),
    };
  }

  private fillBurst(t: number) {
    const lb = this.burst;
    lb.clear();
    const u = t - this.tTitle;
    if (u < 0 || u > 1.6) return;
    const cx = W / 2,
      cy = 1020;
    const N = 180;
    for (let k = 0; k < 4; k++) {
      const p = ease.outExpo(clamp((u - k * 0.07) / 1.2));
      if (p <= 0) continue;
      const r = 80 + p * (1100 + 380 * k);
      const a = (1 - p) * 0.95;
      const c = k === 1 ? LIN.signal.map((v) => v * 1.6) : LIN.bone.map((v) => v * 1.1);
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2,
          a1 = ((i + 1) / N) * Math.PI * 2;
        lb.seg(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r * 0.86, 0, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r * 0.86, 0, k === 1 ? 6 : 3.2, c[0]!, c[1]!, c[2]!, a);
      }
    }
    const pr = ease.outExpo(clamp(u / 0.9));
    for (let i = 0; i < 56; i++) {
      const ang = (i / 56) * Math.PI * 2 + 0.3 * hash(i, 41);
      const r0 = 120 + pr * (300 + 900 * hash(i, 42)),
        r1 = r0 + 80 + 260 * hash(i, 43) * (1 - pr);
      const a = (1 - pr) * 0.9;
      const c = i % 9 === 0 ? LIN.signal.map((v) => v * 1.6) : LIN.bone;
      lb.seg(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0, 0, cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1, 0, 2, c[0]!, c[1]!, c[2]!, a);
    }
  }

  /** The interlude's emblem returns around the moon: two concentric rings drawn clockwise + a 24-tick crown. */
  private drawCrown(c: CanvasRenderingContext2D, t: number) {
    const k = prog(t, this.tTitle + 1.9, this.tTitle + 2.9, ease.inOutCubic);
    if (k <= 0) return;
    const [cx, cy, r] = CROWN;
    c.save();
    c.lineCap = "round";
    const ring = (rr: number, col: string, w: number, d: number) => {
      const u = clamp((k - d) / (1 - d));
      if (u <= 0) return;
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2);
      c.stroke();
    };
    ring(r * 1.17, rgba("signal", 0.95), 3, 0);
    ring(r * 1.31, rgba("bone", 0.6), 1.5, 0.15);
    for (let i = 0; i < 24; i++) {
      const u = clamp((k - 0.35 - i * 0.02) / 0.2);
      if (u <= 0) continue;
      const a = -Math.PI / 2 + (i / 24) * Math.PI * 2;
      const major = i % 6 === 0;
      const r0 = r * 1.38,
        r1 = r * (1.38 + (major ? 0.13 : 0.06) * u);
      c.strokeStyle = major ? rgba("signal", 0.95) : rgba("bone", 0.55);
      c.lineWidth = major ? 3 : 1.5;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
    }
    c.restore();
  }

  /** m07 glyph city x4 as a dawn skyline under the title: bands erupt front to back on the swell, then the hot tower */
  private renderCity(t: number, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const tt = this.tTitle;
    const u = this.cMat.uniforms;
    const rise = u.uRise!.value as number[];
    for (let b = 0; b < BANDS; b++) rise[b] = ease.outBack(prog(t, tt + b * 0.06, tt + b * 0.06 + 0.45));
    u.uHotRise!.value = 0; // no off-centre tower: the skyline under the title stays symmetric
    u.uHot!.value = 0;
    (u.uXform!.value as THREE.Vector4).set(0, -0.6, this.zCity, 4);
    (u.uCam!.value as THREE.Vector3).copy(this.world.cam.position);
    u.uFogStart!.value = 40;
    u.uFogLen!.value = 220;
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.city3, this.world.cam);
  }
}
