// m01 「くるくる くろくろ クロのコード」 (0.00–4.92, vocal from 1.58) — opening plate.
// Intro: the camera cranes down out of darkness onto the engraved night grid (mono HUD
// "yoru.code  00:00"). On くるくる the bone top A drops and spins, on くろくろ the black top B with its
// orange rim lands beside it (one signal ring on the floor per landing); the camera keeps a low orbit.
// Each sung kana lands in display type at the top. On クロのコード the camera pulls back and an
// extruded, burin-engraved コード stands up behind the tops one glyph per syllable, クロの smaller above.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Word } from '../engine/lyrics';
import { clamp, ease, keys, lerp, prog, pulse, smoothstep, TAU } from '../engine/util';
import { NightFloor } from './m01-floor';
import { Top, dropMotion } from './m01-tops';
import { Word3D } from './m01-text3d';
import { MODE, syncCam } from './m01-engrave';
import { drawLanding, sylStart } from './m01-kana';
import { dispWord } from './_disp';

const POS_A = new THREE.Vector3(-0.85, 0, 0.9);
const POS_B = new THREE.Vector3(0.9, 0, 0.45);
const WORD_Z = -2.7;
const EM_CODE = 1.75;
const EM_KURO = 0.75;

export default class M01 extends Scene {
  private floor = new NightFloor(46);
  private s3 = new THREE.Scene();
  private ui = new Layer2D();
  private topA = new Top('A', 1.05);
  private topB = new Top('B', 1.05);
  private code!: Word3D;
  private kuro!: Word3D;
  private wA!: Word;
  private wB!: Word;
  private wC!: Word;
  private fam = F.jp(900);

  override init() {
    const line = this.ctx.lyrics.get('クロのコード');
    [this.wA, this.wB, this.wC] = [line.words[0]!, line.words[1]!, dispWord(line.words[2]!)];
    this.code = new Word3D('code', this.fam, EM_CODE, 0.34, { mode: MODE.EXTRUDE, col: 'bone', sideCol: 'signal', sideK: 0.55, freq: 24, rimK: 0.3 });
    this.code.group.position.set(0.15, 0, WORD_Z);
    this.kuro = new Word3D('Claudeの', this.fam, EM_KURO, 0.16, { mode: MODE.EXTRUDE, col: 'bone', sideCol: 'ash', sideK: 0.5, freq: 26, rimK: 0.3 });
    // クロの floats on a second line above コード, left-aligned with it
    this.kuro.group.position.set(0.15 - this.code.width / 2 + this.kuro.width / 2 + 0.05, EM_CODE * 1.02, WORD_Z + 0.05);
    this.s3.add(this.topA.group, this.topB.group, this.code.group, this.kuro.group);
  }

  private camera(t: number) {
    const v0 = this.wA.start, v2 = this.wC.start;
    const a = keys(t, [[0, 0.55], [v0, 0.24, ease.outCubic], [v2, -0.22, ease.linear], [v2 + 0.6, -0.06, ease.outCubic], [this.ctx.end, 0.02, ease.linear]]);
    const v1 = this.wB.start;
    const r = keys(t, [[v0, 6.6], [v2, 8.2, ease.linear], [v2 + 0.6, 10.6, ease.outCubic], [this.ctx.end, 11.2, ease.linear]]);
    const h = keys(t, [[v0, 1.4], [v2, 1.3, ease.linear], [v2 + 0.6, 4.2, ease.outCubic], [this.ctx.end, 4.4, ease.linear]]);
    const ty = keys(t, [[v0, 0.9], [v2, 0.95], [v2 + 0.6, 2.0, ease.outCubic], [this.ctx.end, 2.05]]);
    const tz = keys(t, [[v0, 0.6], [v2, 0.4], [v2 + 0.6, -1.2, ease.outCubic], [this.ctx.end, -1.3]]);
    const tx = keys(t, [[v0, -0.7], [v1 - 0.5, -0.6], [v1 + 0.05, 0.05, ease.inOutCubic]]);
    const ox = tx + Math.sin(a) * r, oz = -0.4 + Math.cos(a) * r;
    // intro crane: from high above (looking straight down at the grid) down to the orbit
    const k = ease.inOutCubic(prog(t, 0.0, v0 - 0.02));
    const px = lerp(0.3, ox, k), py = lerp(15, h, k), pz = lerp(3.0, oz, k);
    const tgx = tx * k, tgy = lerp(0, ty, k), tgz = lerp(-0.6, tz, k);
    this.floor.look(px, py, pz, tgx, tgy, tgz, lerp(0.25, -0.02, k), lerp(52, 46, k));
  }

  private poseTop(top: Top, home: THREE.Vector3, w: Word, t: number, seed: number) {
    const m = dropMotion(t, w.start, 4.5);
    const a = t - w.start;
    const spin = TAU * (2.4 * a + seed);
    const prec = seed * 2 + TAU * 0.9 * a;
    const wx = 0.06 * Math.sin(a * 2.1 + seed), wz = 0.06 * Math.cos(a * 1.7 + seed);
    top.group.visible = m.live > 0;
    top.pose(home.x + wx, m.y, home.z + wz, spin, m.tilt, prec);
    // a soft glint in the burin lines on each sung kana of its word
    let g = 0;
    for (let i = 0; i < w.w.length; i++) g = Math.max(g, pulse(t, sylStart(w, i), 0.09));
    top.mat.uniforms.glow!.value = 0.55 * g;
    const sh = m.live * clamp(1 - m.y / 4.5) * 0.85;
    return { x: home.x + wx, z: home.z + wz, sh };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    this.camera(t);
    const a = this.poseTop(this.topA, POS_A, this.wA, t, 0.13);
    const b = this.poseTop(this.topB, POS_B, this.wB, t, 0.61);
    const fl = this.floor;
    fl.shadow(0, a.x, a.z, 0.62, a.sh);
    fl.shadow(1, b.x, b.z, 0.62, b.sh);
    fl.ring(0, POS_A.x, POS_A.z, this.wA.start, 1);
    fl.ring(1, POS_B.x, POS_B.z, this.wB.start, 1);
    fl.ring(2, 0.15, WORD_Z + 0.4, sylStart(this.wC, 7), 0.7);
    fl.ring(3, 0, 0, -10, 0);

    // words: Claudeの on display glyphs 0..6, code on 7..10 (each glyph stands up on its onset)
    const C = this.wC;
    for (let i = 0; i < 7; i++) {
      const ts = sylStart(C, i);
      this.kuro.stand(i, prog(t, ts - 0.04, ts + 0.2, ease.outBack), 1 - smoothstep(ts + 0.05, ts + 0.4, t));
    }
    for (let i = 0; i < 4; i++) {
      const ts = sylStart(C, 7 + i);
      this.code.stand(i, prog(t, ts - 0.05, ts + 0.26, ease.outBack), 1 - smoothstep(ts + 0.08, ts + 0.55, t));
    }

    fl.render(renderer, out, t, smoothstep(0.1, 1.2, t));
    this.s3.updateMatrixWorld(true);
    syncCam(this.s3, fl.cam);
    renderer.setRenderTarget(out);
    renderer.clear(false, true, false);
    renderer.render(this.s3, fl.cam);

    this.drawUI(t);
    this.ctx.comp.draw(renderer, this.ui.upload(), out);
    return { bloom: 0.5, bloomThreshold: 0.95, vignette: 0.55, grain: 0.05, ca: 0.6, fade: 1 - smoothstep(0, 0.5, t) };
  }

  private drawUI(t: number) {
    const L = this.ui, c = L.ctx;
    L.clear();
    // HUD (mono: ASCII only), inside the safe area
    const ha = smoothstep(0.2, 0.8, t);
    c.save();
    c.globalAlpha = ha;
    c.font = font(F.mono(500), 24);
    c.letterSpacing = '4px';
    c.fillStyle = rgba('bone', 0.8);
    const sec = Math.floor(t);
    c.fillText(`yoru.code  00:${String(sec).padStart(2, '0')}`, 72, 270);
    c.font = font(F.mono(400), 17);
    c.fillStyle = rgba('ash', 0.7);
    const n = (t >= this.wA.start ? 1 : 0) + (t >= this.wB.start ? 1 : 0);
    c.fillText(`tops ${n}/2   spin 2.4 rps`, 72, 304);
    c.restore();
    // くるくる (left) and くろくろ (right), stacked; they step back a little when the word stands up
    const back = smoothstep(this.wC.start, this.wC.start + 0.5, t);
    const size = lerp(168, 128, back);
    const yA = lerp(500, 450, back), yB = lerp(690, 600, back);
    drawLanding(c, this.wA, this.fam, size, 70, yA, t, { align: 'left', alpha: lerp(1, 0.85, back) });
    drawLanding(c, this.wB, this.fam, size, W - 70, yB, t, { align: 'right', alpha: lerp(1, 0.85, back) });
    // tiny label under top B
    const p = this.floor.project(POS_B.x, 0, POS_B.z);
    if (p && t >= this.wB.start + 0.3) {
      c.save();
      c.globalAlpha = smoothstep(this.wB.start + 0.3, this.wB.start + 0.6, t) * 0.8;
      c.font = font(F.mono(400), 16);
      c.fillStyle = rgba('ash', 0.85);
      c.fillText('TOP_B  rim: signal', Math.min(p.x + 30, W - 260), Math.min(p.y + 40, H - 400));
      c.restore();
    }
  }
}
