// m05 「コード コード 夜をほどく」 (chorus 1). An engraved 3D tube knot turns in the dark above a hairline floor
// while the camera orbits it. コード is stamped twice as an extruded engraved block (the first one is pushed back
// into depth by the second). On 夜をほどく both コード shrink into a small line at the top, 夜を is cut by the
// burin and ほどく lands huge in signal; the knot's 14 strands unravel one after another into straight parallel
// rods on the floor that recede to the vanishing point while the camera pulls back and up.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W, clearRT } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font } from "../engine/type";
import type { Line } from "../engine/lyrics";
import { clamp, ease, lerp, prog, pulse } from "../engine/util";
import { EWord, TextRig, sylOf } from "./m05-kit";
import { dispWord } from "./_disp";
import { SOUND_CUTS } from "../timeline";
import { K, knotGeometry, knotLength, knotMaterial } from "./m05-knot";

const FLOOR_Y = -2.2;

export default class M05 extends Scene {
  cam = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.1, 300);
  world = new THREE.Scene();
  kmat = knotMaterial();
  knot = new THREE.Mesh(knotGeometry(), this.kmat);
  floor = new LineBatch(9000, { screen2D: false, depthTest: true, blend: "add" });
  rig = new TextRig();
  ui = new Layer2D();
  line!: Line;
  codeA!: EWord;
  codeB!: EWord;
  yoru!: EWord;
  hodoku!: EWord;
  tU = 0;

  override async init() {
    const ly = this.ctx.lyrics;
    this.line = ly.get("コード コード 夜をほどく", 0);
    this.knot.frustumCulled = false;
    this.world.add(this.knot);
    this.kmat.uniforms.uKLen!.value = knotLength(this.kmat.uniforms.uKR!.value as number);
    this.kmat.uniforms.uFloorY!.value = FLOOR_Y;
    const r = this.rig;
    const big = r.em(290);
    this.codeA = new EWord("code", F.jp(900), big, big * 0.32);
    this.codeB = new EWord("code", F.jp(900), big, big * 0.32);
    this.yoru = new EWord("夜を", F.jp(900), r.em(130), r.em(130) * 0.3);
    this.hodoku = new EWord("ほどく", F.jp(900), r.em(300), r.em(300) * 0.34);
    this.codeA.setCol(LIN.bone, 0.95);
    this.codeB.setCol(LIN.bone, 0.95);
    this.yoru.setCol(LIN.bone, 0.9);
    this.hodoku.setCol(LIN.signal, 1.15);
    for (const g of this.hodoku.glyphs) {
      g.fu.freq!.value = 30;
      g.fu.plate!.value = 0.75;
    }
    r.scene.add(this.codeA.group, this.codeB.group, this.yoru.group, this.hodoku.group);
    this.yoru.group.position.set(r.wx(96), r.wy(520), 0);
    this.hodoku.group.position.set(r.wx(540) - this.hodoku.width / 2, r.wy(870), 0);
    this.tU = this.line.words[2]!.start;
    this.buildFloor();
  }

  private buildFloor() {
    const lb = this.floor;
    lb.clear();
    const y = FLOOR_Y;
    const c = LIN.bone;
    // wide floor: the pull-out on the band entry reveals it running out to the horizon
    for (let x = -72; x <= 72; x += 1.2) {
      for (let z = 40; z > -150; z -= 3) {
        const a = 0.2 * Math.exp(-Math.max(0, -z) / 45);
        lb.seg(x, y, z, x, y, z - 3, 1.0, c[0], c[1], c[2], a);
      }
    }
    for (let z = 40; z > -150; z -= 1.2) {
      const a = 0.2 * Math.exp(-Math.max(0, -z) / 45);
      lb.seg(-72, y, z, 72, y, z, 1.0, c[0], c[1], c[2], a);
    }
  }

  /** stamp: 0 before the word, slam from close to the lens onto the plate */
  private stamp(word: EWord, t: number, t0: number) {
    const k = prog(t, t0 - 0.02, t0 + 0.2, ease.outExpo);
    word.reveal = t >= t0 - 0.02 ? 1 : 0;
    word.group.position.z = lerp(4.5, 0, k);
    word.opacity = clamp(k * 3);
    return k;
  }

  private camera(t: number) {
    const lt = t - this.ctx.start;
    const back = ease.inOutCubic(prog(t, this.tU + 0.05, this.ctx.end - 0.05));
    // the gap (chorusStop): the camera is sucked in toward the knot, lens narrows;
    // the band entry (chorusIn): hard cut to a high, wide pull-out that keeps flying back over the floor
    const { chorusStop, chorusIn } = SOUND_CUTS;
    const cut = t >= chorusIn;
    const lc = t - chorusIn;
    const suck = ease.inCubic(prog(t, chorusStop, chorusIn));
    // after the cut: the wide view lingers, then a "グヨーン" swoop into the knot — slow start, hard rush, soft landing
    const out = ease.outCubic(clamp(lc / 0.35));
    const swoop = ease.inOutExpo(prog(t, chorusIn + 0.3, this.tU + 0.15));
    const th = cut ? 0.25 + 0.12 * lc + 0.35 * swoop : -0.55 + 0.42 * lt;
    const R = cut ? lerp(lerp(19, 24, out), 6.5, swoop) : lerp(12.5, 7.5, suck);
    const ex = lerp(Math.sin(th) * R, 0.4, back);
    const ey = lerp(cut ? lerp(lerp(5.5, 7.5, out), 1.9, swoop) : 1.6 + 0.25 * lt - 0.6 * suck, 3.0, back);
    const ez = lerp(Math.cos(th) * R, 15.5, back);
    this.cam.fov = cut ? lerp(lerp(lerp(78, 70, out), 44, swoop), 40, back) : lerp(40, 30, suck);
    this.cam.updateProjectionMatrix();
    const tx = 0,
      ty = lerp(0.35, 0.9, back),
      tz = lerp(0, -22, back);
    this.cam.position.set(ex, ey, ez);
    this.cam.up.set(lerp(0.04, 0, back), 1, 0);
    this.cam.lookAt(tx, ty, tz);
    this.cam.updateMatrixWorld(true);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t,
      lt = f.lt;
    const w = this.line.words;
    clearRT(renderer, out, LIN.ink);

    // ---- world: knot + floor
    this.camera(t);
    const u = this.kmat.uniforms;
    u.uRotY!.value = 0.6 + 0.5 * lt;
    u.uRotX!.value = 0.55 + 0.12 * lt;
    (u.uKPos!.value as THREE.Vector3).set(0, -0.75, 0);
    (u.uCam!.value as THREE.Vector3).copy(this.cam.position);
    const ms = u.uM!.value as number[];
    let untied = 0;
    for (let k = 0; k < K; k++) {
      const order = (k * 5) % K; // strands leave in a scattered order around the knot
      const a = this.tU + 0.22 + order * 0.04;
      ms[k] = ease.inOutCubic(prog(t, a, a + 0.55));
      if (ms[k]! > 0.98) untied++;
    }
    u.uHot!.value = pulse(t, w[2]!.syl![2]![0], 0.25);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.world, this.cam);
    this.floor.render(renderer, out, this.cam);

    // ---- type
    const r = this.rig;
    r.look(lerp(-1.9, 1.7, f.p), 0.9 + 0.3 * f.p);
    const kA = this.stamp(this.codeA, t, w[0]!.start);
    const kB = this.stamp(this.codeB, t, Math.max(w[1]!.start, SOUND_CUTS.chorusIn));
    const shrink = ease.inOutCubic(prog(t, this.tU - 0.08, this.tU + 0.3));
    const big = r.em(290);
    const sc = lerp(1, 70 / 290, shrink);
    const bx = r.wx(540) - this.codeA.width / 2;
    const by = r.wy(560);
    // small line at the top: 「コード コード」
    const smallW = this.codeA.width * (70 / 290);
    const gap = r.em(34);
    const lx = r.wx(540) - (smallW * 2 + gap) / 2,
      ly = r.wy(318);
    // A: pushed back and up by B, then into the small line
    const push = ease.outCubic(prog(t, w[1]!.start, w[1]!.start + 0.35));
    this.codeA.group.position.x = lerp(bx, lx, shrink);
    this.codeA.group.position.y = lerp(by + push * big * 1.3, ly, shrink);
    this.codeA.group.position.z = lerp(lerp(4.5, 0, kA) - push * 4.5, 0, shrink);
    this.codeA.opacity = clamp(kA * 3) * lerp(1, 0.42, push * (1 - shrink)) * lerp(1, 0.8, shrink);
    this.codeA.group.scale.setScalar(sc);
    this.codeB.group.position.x = lerp(bx, lx + smallW + gap, shrink);
    this.codeB.group.position.y = lerp(by, ly, shrink);
    this.codeB.group.position.z = lerp(4.5, 0, kB) * (1 - shrink);
    this.codeB.opacity = clamp(kB * 3) * lerp(1, 0.8, shrink);
    this.codeB.group.scale.setScalar(sc);
    // per-character flash on each sung kana
    for (const [word, wd] of [
      [this.codeA, w[0]!],
      [this.codeB, w[1]!],
    ] as const)
      word.glyphs.forEach((g, i) => (g.glow = 0.9 * pulse(t, sylOf(dispWord(wd), i)[0], 0.12)));
    // 夜を / ほどく: cut by the burin on their syllables
    const wy = w[2]!;
    this.yoru.glyphs.forEach((g, i) => {
      const [a, b] = sylOf(wy, i);
      g.reveal = prog(t, a, a + Math.max(0.14, Math.min(0.3, b - a)), ease.outCubic);
    });
    this.hodoku.glyphs.forEach((g, i) => {
      const [a, b] = sylOf(wy, i + 2);
      g.reveal = prog(t, a - 0.02, a + Math.max(0.12, Math.min(0.24, b - a)), ease.outCubic);
      g.glow = 0.5 * pulse(t, a, 0.15);
      g.group.position.z = lerp(1.6, 0, prog(t, a - 0.02, a + 0.22, ease.outExpo));
    });
    r.render(renderer, out);

    // ---- one small mono readout under the knot
    const ui = this.ui;
    ui.clear();
    const c = ui.ctx;
    const ra = prog(t, this.tU + 0.1, this.tU + 0.4);
    if (ra > 0) {
      c.globalAlpha = ra;
      c.font = font(F.mono(400), 22);
      c.fillStyle = rgba("ash", 0.9);
      c.fillText("night.untie()", 96, 1490);
      c.fillStyle = rgba(untied === K ? "signal" : "bone", 0.9);
      const s = `strands ${String(untied).padStart(2, "0")}/${K}`;
      c.fillText(s, W - 96 - c.measureText(s).width, 1490);
      c.fillStyle = rgba("ash", 0.5);
      c.fillRect(96, 1506, W - 192, 1);
      c.fillStyle = rgba("signal", 0.9);
      c.fillRect(96, 1506, ((W - 192) * untied) / K, 2);
    }
    ui.upload();
    this.ctx.comp.draw(renderer, ui.texture, out);

    const flash = pulse(t, SOUND_CUTS.chorusIn, 0.22);
    const sk = t < SOUND_CUTS.chorusIn ? ease.inCubic(prog(t, SOUND_CUTS.chorusStop, SOUND_CUTS.chorusIn)) : 0;
    return { bloom: 0.4 + 0.9 * flash, bloomThreshold: lerp(1.1, 0.6, flash), vignette: 0.5 + 0.4 * sk - 0.2 * flash, grain: 0.05, ca: 0.4 + 1.2 * flash };
  }
}
