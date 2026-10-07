// brk08 (間奏, 28.11-41.28, no lyric). Starts on the break hit (SOUND_CUTS.breakHit = the "チャーン"):
// 1) 28.11 BREAKOUT: window slabs blow outward high in the open dawn sky; 28.56 (drums in) dive to the ground.
// 2) ground skim (y < 1) into a canyon of skyscraper-sized engraved words that slam upright ahead;
//    from 31.89 the camera drops one step per descending note of the riff (STEPS), last and deepest on the bass drop.
// 3) 35.23: low through the street of a glyph metropolis (m07 city x2.2, centre column flattened);
//    on 36.89 the hot signal tower erupts and the camera runs up beside it.
// 4) 38.56: the emblem. Camera centred on the sun at the vanishing point of the flat grid; the scattered tilted
//    rings settle into perfect concentric circles with a tick crown on the bar head 40.23, held to the hand-off.
// Small mono HUD: INTERLUDE, bar counter, speed, altitude.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, measure } from "../engine/type";
import { clamp, ease, frameIdx, lerp, prog, pulse, smoothstep } from "../engine/util";
import { syncCam } from "./m01-engrave";
import { DAWN_END } from "./m08-world";
import { OpenWorld } from "./brk08-world";
import { AXIS_Y, fillStreams, makeSlabs, slabGeometry, slabMaterial } from "./brk08-tunnel";
import { Monoliths, fillRings } from "./brk08-giants";
import { BANDS, cityGeometry, cityMaterial, glyphAtlas } from "./m07-city";

const DT = 1 / 240;
// descending riff in the canyon (other stem A3 G#3 F#3 E3 D3, then the bass drops an octave): time -> camera height
const STEPS: [number, number][] = [
  [31.95, 3.4],
  [32.53, 2.75],
  [32.99, 2.15],
  [33.27, 1.6],
  [33.55, 1.15],
  [34.53, 0.55],
];

type R = [number, number];
interface Shot {
  t0: number;
  x: R;
  y: R;
  yaw: R;
  pitch: R;
  roll: R;
  fov: R;
}

export default class Brk08 extends Scene {
  world = new OpenWorld();
  tunnel3 = new THREE.Scene();
  tMat = slabMaterial();
  mono!: Monoliths;
  sea3 = new THREE.Scene();
  cMat = cityMaterial(glyphAtlas());
  rings = new LineBatch(160 * 8 + 64, { screen2D: false, depthTest: false, blend: "add" });
  sunDir = new THREE.Vector3(0, 0, -1);
  zSeaA = 0;
  zSeaB = 0;
  tSea = 0;
  tHot = 0;
  tSun = 0;
  tWarp = 0;
  streams = new LineBatch(5000, { screen2D: false, depthTest: true, blend: "add" });
  ui = new Layer2D();
  dist = new Float32Array(0);
  tB = 0; // breakout
  tC = 0; // canyon (stepped descent)

  shots: Shot[] = [];
  bars: number[] = [];

  override async init() {
    const T0 = this.ctx.start,
      T1 = this.ctx.end;
    this.bars = this.ctx.audio.downbeats.filter((b) => b > T0 + 0.3 && b < T1 - 0.3);
    const b = (i: number) => this.bars[Math.min(i, this.bars.length - 1)] ?? T0;
    // breakout = the break hit itself (scene start): the window slabs blow outward around the camera at once
    this.tB = T0;
    // the canyon of words starts on the first bar head after 31.0 s (31.89)
    const tC = this.bars.find((x) => x > 31.0) ?? b(1);
    this.tC = tC;
    const iB = this.bars.indexOf(tC);
    const half = (b(iB + 1) - b(iB)) / 2; // 2 beats in 4/4
    const n = Math.ceil((T1 - T0 + 1) / DT);
    this.dist = new Float32Array(n + 1);
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      this.dist[i] = acc;
      acc += this.speed(T0 + i * DT) * DT;
    }
    // render cost: clip geometry beyond the fog (the world pass only uses ray directions)
    this.world.cam.far = 80;
    const zB = this.camZ(this.tB);
    const tunnel = new THREE.Mesh(slabGeometry(makeSlabs(8, zB - 28)), this.tMat);
    tunnel.frustumCulled = false;
    this.tunnel3.add(tunnel);
    fillStreams(this.streams, 8, zB - 6);
    const bi = (k: number) => b(iB + k);
    this.tSea = bi(2);
    this.tHot = bi(3);
    this.tSun = bi(4);
    this.tWarp = bi(5);
    // canyon of giant words: the first ones are already standing when the canyon shot starts
    this.mono = new Monoliths(this.camZ(tC) - 45, 13);
    // glyph metropolis: copy A holds the hot tower ~24 units ahead of the camera at tHot, copy B precedes it
    const S = 2.2;
    this.zSeaA = this.camZ(this.tHot) - 24 + 12 * S;
    this.zSeaB = this.zSeaA + 40 * S;
    const sea = new THREE.Mesh(cityGeometry(), this.cMat);
    sea.frustumCulled = false;
    this.sea3.add(sea);
    const sky = 0.06;
    this.shots = [
      // BREAKOUT on the チャーン: high in the open dawn sky, window slabs blowing away all around, ultra-wide
      { t0: T0, x: [0, 0.3], y: [AXIS_Y, AXIS_Y + 3], yaw: [0, 0.04], pitch: [0.04, -0.08], roll: [0.12, 0.0], fov: [104, 92] },
      // drums in: plunge to the ground
      { t0: b(0), x: [0.3, 0], y: [AXIS_Y + 3, 0.75], yaw: [0.04, 0], pitch: [-0.55, 0.03], roll: [0.0, -0.1], fov: [92, 96] },
      // ground skim: the giant words rise far ahead
      { t0: b(0) + half, x: [0, -0.4], y: [0.75, 0.6], yaw: [0, 0.03], pitch: [0.06, 0.08], roll: [-0.1, 0.06], fov: [96, 94] },
      // canyon of words, stepping down with the riff (y from STEPS)
      { t0: tC, x: [0, 0], y: [0, 0], yaw: [0, 0.02], pitch: [-0.02, 0.06], roll: [0.06, -0.04], fov: [90, 90] },
      { t0: tC + half, x: [-1.2, 1.0], y: [0, 0], yaw: [0.05, -0.05], pitch: [0.06, 0.1], roll: [0.1, -0.08], fov: [90, 88] },
      // side tracking: words slide past (parallax)
      { t0: bi(1), x: [-1.0, -0.5], y: [0, 0], yaw: [0.9, 0.7], pitch: [0.08, 0.1], roll: [0.0, -0.05], fov: [80, 78] },
      // worm's eye: the words tower overhead, deepest step on the bass drop
      { t0: bi(1) + half, x: [0.3, -0.3], y: [0, 0], yaw: [-0.05, 0.05], pitch: [0.3, 0.38], roll: [0.25, -0.2], fov: [94, 92] },
      // low through the street of the glyph metropolis as its towers rise
      { t0: this.tSea, x: [0, 0], y: [1.3, 1.2], yaw: [0, 0.02], pitch: [0.04, 0.06], roll: [0.05, -0.05], fov: [92, 92] },
      { t0: this.tSea + half, x: [0, 0.4], y: [1.2, 1.1], yaw: [0.02, 0.1], pitch: [0.06, 0.08], roll: [-0.05, 0.08], fov: [92, 90] },
      // the hot tower erupts: run up beside it, looking up its face
      { t0: this.tHot, x: [0.4, 3.3], y: [1.1, 21], yaw: [0.1, 0.42], pitch: [0.35, 0.18], roll: [0.08, -0.12], fov: [90, 84] },
      // crest over the top, settle toward the sun
      { t0: this.tHot + half, x: [3.3, 0], y: [21, 14], yaw: [0.42, 0], pitch: [-0.12, 0.0], roll: [-0.12, 0.0], fov: [84, 70] },
      // the emblem: centred, level, sun at the vanishing point; slow push while the rings settle
      { t0: this.tSun, x: [0, 0], y: [9, 2.4], yaw: [0, 0], pitch: [0.0, 0.03], roll: [0, 0], fov: [70, 60] },
      { t0: this.tWarp, x: [0, 0], y: [2.4, 2.2], yaw: [0, 0], pitch: [0.03, 0.03], roll: [0, 0], fov: [60, 56] },
    ];
  }

  /** Forward speed (world units / s). */
  private speed(t: number) {
    const T0 = this.ctx.start;
    if (t < this.tB) {
      const u = clamp((t - T0) / (this.tB - T0), 0, 1);
      return 8 + 24 * u * u;
    }
    const base = 28 + 12 * Math.exp(-(t - this.tB) * 1.2);
    return lerp(base, 18, smoothstep(this.ctx.end - 1.6, this.ctx.end, t));
  }
  private distAt(t: number) {
    const x = (t - this.ctx.start) / DT;
    const i = clamp(Math.floor(x), 0, this.dist.length - 2);
    return lerp(this.dist[i]!, this.dist[i + 1]!, clamp(x - i, 0, 1));
  }
  private camZ(t: number) {
    return 6 - this.distAt(t);
  }
  private shotAt(t: number) {
    let k = 0;
    for (let i = 0; i < this.shots.length; i++) if (t >= this.shots[i]!.t0) k = i;
    const s = this.shots[k]!;
    const t1 = this.shots[k + 1]?.t0 ?? this.ctx.end;
    return { s, k, p: prog(t, s.t0, t1) };
  }

  private camAt(t: number) {
    const z = this.camZ(t);
    const { s, p } = this.shotAt(t);
    const q = ease.inOutQuad(p);
    const L = (r: R) => lerp(r[0], r[1], q);
    const sway = t < this.tSun ? 0.1 * Math.sin(t * 0.9) : 0;
    const x = L(s.x) + sway,
      y = t >= this.tC && t < this.tSea ? this.stepY(t) : L(s.y);
    const yaw = L(s.yaw),
      pitch = L(s.pitch);
    const dx = Math.sin(yaw) * Math.cos(pitch),
      dy = Math.sin(pitch),
      dz = -Math.cos(yaw) * Math.cos(pitch);
    this.world.look(x, y, z, x + dx * 14, y + dy * 14, z + dz * 14, L(s.roll), L(s.fov));
    return { z, y };
  }

  /** Height in the canyon: one quick drop per descending riff note (~0.14 s ease), held between notes. */
  private stepY(t: number) {
    let y = 4.0;
    for (const [ts, h] of STEPS) y = lerp(y, h, ease.outCubic(prog(t, ts - 0.03, ts + 0.13)));
    return y;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const { z, y } = this.camAt(t);
    const open = t >= this.tB;
    const vis = open ? 1 : 0; // the open sky is there from the first frame of the hit
    // sun: swells from the turn (tSun), floods the frame in the warp
    const em = smoothstep(this.tSun, this.tWarp, t);
    const sunR = DAWN_END.sunR * (1 + 0.6 * em);
    const sunH = lerp(DAWN_END.sunH, 0.06, em);
    this.world.render(renderer, out, {
      sunH,
      sunAz: DAWN_END.sunAz,
      sunR,
      dawn: DAWN_END.dawn,
      grid: DAWN_END.grid,
      amp: 0.5 * (1 - em),
      warm: DAWN_END.warm,
      vis,
      sky: 1 - 0.35 * em,
      t,
    });
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    const cam = this.world.cam;
    const blast = open ? t - this.tB : 0;
    // tunnel slabs: gone (culled) once they have flown off, ~2.5 s after the breakout
    if (blast < 2.5) {
      const u = this.tMat.uniforms;
      (u.uCam!.value as THREE.Vector3).copy(cam.position);
      u.uT!.value = t - this.ctx.start;
      u.uBlast!.value = blast;
      u.uFogLen!.value = open ? 14 : 20;
      renderer.render(this.tunnel3, cam);
      if (!open) this.streams.render(renderer, out, cam);
    }
    // canyon of giant words (breakout -> tSea)
    if (open && t < this.tSea + 0.05) {
      this.mono.update(z);
      this.mono.scene.updateMatrixWorld(true);
      syncCam(this.mono.scene, cam);
      renderer.render(this.mono.scene, cam);
    }
    // glyph metropolis (tSea -> tSun + one bar)
    if (t >= this.tSea - 0.02 && t < this.tWarp) this.renderSea(t, cam);
    // the emblem: scattered tilted rings settle into concentric circles + tick crown on tWarp
    if (t >= this.tSun) {
      const ro = t - this.tSun;
      const lock = ease.inOutCubic(prog(t, this.tSun + 0.4, this.tWarp));
      const radii = [0, 1, 2, 3, 4].map((k) => {
        const open = ease.outCubic(clamp((ro - k * 0.1) / 0.8));
        return open * lerp(34 - k * 3.5, 7.2 * 1.3 ** k, lock);
      });
      this.sunDir.set(Math.sin(DAWN_END.sunAz) * Math.cos(sunH), Math.sin(sunH), -Math.cos(DAWN_END.sunAz) * Math.cos(sunH)).normalize();
      const crown = ease.outBack(prog(t, this.tWarp, this.tWarp + 0.35));
      fillRings(this.rings, cam.position, this.sunDir, 70, radii, pulse(t, this.tWarp, 0.4), 1 - lock, crown);
      this.rings.render(renderer, out, cam);
    }

    const ui = this.ui;
    ui.clear();
    this.drawHud(ui.ctx, t, y);
    ui.upload();
    this.ctx.comp.draw(renderer, ui.texture, out);
    const glare = ease.inCubic(prog(t, this.ctx.end - 0.3, this.ctx.end)); // flash hand-off into m09
    const hit = pulse(t, this.tB, 0.25) + 0.6 * pulse(t, b0(this.bars), 0.2) + pulse(t, this.tSea, 0.2) + pulse(t, this.tHot, 0.3) + 0.7 * pulse(t, this.tWarp, 0.35);
    return {
      bloom: 0.45 + 0.8 * hit + 1.4 * glare,
      bloomThreshold: lerp(1.0, 0.45, Math.max(glare, clamp(hit))),
      vignette: 0.5 - 0.25 * glare + 0.1 * smoothstep(this.tSun, this.tWarp, t),
      grain: 0.05,
      ca: 0.7 + 1.5 * hit + 2.0 * glare,
    };
  }

  /** Two copies of the m07 glyph city, x2.2, as a metropolis under the flight path; copy A carries the hot tower. */
  private renderSea(t: number, cam: THREE.PerspectiveCamera) {
    const { renderer } = this.ctx;
    const u = this.cMat.uniforms;
    const rise = u.uRise!.value as number[];
    const xf = u.uXform!.value as THREE.Vector4;
    (u.uCam!.value as THREE.Vector3).copy(cam.position);
    u.uFogStart!.value = 18;
    u.uFogLen!.value = 70;
    u.uStreet!.value = 0.5;
    const copies: [number, number, boolean][] = [
      [this.zSeaB, this.tSea - 0.25, false],
      [this.zSeaA, this.tSea + 0.6, true],
    ];
    for (const [zs, t0, hot] of copies) {
      for (let b = 0; b < BANDS; b++) rise[b] = ease.outBack(prog(t, t0 + b * 0.09, t0 + b * 0.09 + 0.4));
      u.uHotRise!.value = hot ? ease.outExpo(prog(t, this.tHot - 0.02, this.tHot + 0.45)) : 0;
      u.uHot!.value = hot ? pulse(t, this.tHot, 0.4) : 0;
      xf.set(0, -0.4, zs, 2.2);
      renderer.render(this.sea3, cam);
    }
  }

  private drawHud(c: CanvasRenderingContext2D, t: number, alt: number) {
    const T0 = this.ctx.start;
    const a = smoothstep(T0 + 0.05, T0 + 0.35, t) * (1 - 0.5 * smoothstep(this.ctx.end - 1.0, this.ctx.end, t));
    if (a <= 0.001) return;
    const tq = frameIdx(t) / 60;
    const bi = this.bars.filter((b) => b <= tq).length;
    const v = this.speed(tq);
    c.save();
    c.globalAlpha = a;
    c.font = font(F.mono(500), 24);
    c.fillStyle = rgba("bone", 0.9);
    c.fillText("INTERLUDE", 96, 262);
    c.fillStyle = rgba("signal", 0.95);
    c.fillRect(96, 276, 26, 2);
    c.font = font(F.mono(400), 17);
    c.fillStyle = rgba("ash", 0.85);
    c.fillText(`bar ${String(bi + 1).padStart(2, "0")}/${String(this.bars.length + 1).padStart(2, "0")}`, 96, 304);
    const s1 = `v ${v.toFixed(1).padStart(5, " ")} u/s`;
    c.fillText(s1, W - 96 - measure(s1, F.mono(400), 17), 262);
    const s2 = t >= this.tB ? `alt ${alt.toFixed(1)}` : "alt ----";
    c.fillText(s2, W - 96 - measure(s2, F.mono(400), 17), 288);
    c.restore();
  }
}

const b0 = (bars: number[]) => bars[0] ?? 0;
