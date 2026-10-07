// m06 「くるくる くろくろ まだ踊る」 (17.72–21.06) — the TOPS return and dance.
// A big engraved vinyl disc turns on the night grid. On くるくる the bone top A drops onto the record,
// on くろくろ the black/orange top B joins it, and the two orbit each other (a dance) while the record
// turns. The camera starts high above the grooves and cranes down while orbiting; on まだ踊る an
// extruded engraved 踊る stands up behind the record one glyph per syllable, まだ smaller above it.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Word } from '../engine/lyrics';
import { clamp, ease, keys, lerp, prog, pulse, smoothstep, TAU } from '../engine/util';
import { NightFloor } from './m01-floor';
import { Top, dropMotion } from './m01-tops';
import { Word3D } from './m01-text3d';
import { MODE, syncCam } from './m01-engrave';
import { drawLanding, sylStart } from './m01-kana';
import { Vinyl } from './m06-disc';

const WORD_Z = -4.0;
const EM_ODORU = 2.1;
const EM_MADA = 0.8;
const ORBIT_R = 1.05;

export default class M06 extends Scene {
  private floor = new NightFloor(46);
  private s3 = new THREE.Scene();
  private ui = new Layer2D();
  private vinyl = new Vinyl(3.0, 0.12);
  private topA = new Top('A', 0.95);
  private topB = new Top('B', 0.95);
  private odoru!: Word3D;
  private mada!: Word3D;
  private wA!: Word;
  private wB!: Word;
  private wC!: Word;
  private fam = F.jp(900);

  override init() {
    const line = this.ctx.lyrics.get('まだ踊る');
    [this.wA, this.wB, this.wC] = [line.words[0]!, line.words[1]!, line.words[2]!];
    this.odoru = new Word3D('踊る', this.fam, EM_ODORU, 0.38, { mode: MODE.EXTRUDE, col: 'bone', sideCol: 'signal', sideK: 0.55, freq: 24, rimK: 0.3 });
    this.odoru.group.position.set(0, 0, WORD_Z);
    this.mada = new Word3D('まだ', this.fam, EM_MADA, 0.18, { mode: MODE.EXTRUDE, col: 'bone', sideCol: 'ash', sideK: 0.5, freq: 26, rimK: 0.3 });
    this.mada.group.position.set(-this.odoru.width / 2 + this.mada.width / 2 + 0.05, EM_ODORU * 1.0, WORD_Z + 0.05);
    this.s3.add(this.vinyl.group, this.topA.group, this.topB.group, this.odoru.group, this.mada.group);
  }

  private camera(t: number) {
    const T0 = this.ctx.start, T1 = this.ctx.end, v2 = this.wC.start;
    const a = keys(t, [[T0, -0.95], [v2, -0.25, ease.linear], [T1, 0.06, ease.outCubic]]);
    // by まだ (v2) the crane has settled near its final framing, so the standing words land in the
    // free band under the kana instead of under them
    const r = keys(t, [[T0, 3.2], [v2 - 0.9, 7.0, ease.inOutCubic], [v2, 9.6, ease.inOutCubic], [T1, 10.6, ease.outCubic]]);
    const h = keys(t, [[T0, 9.5], [v2 - 0.9, 3.6, ease.inOutCubic], [v2, 3.7, ease.inOutCubic], [T1, 3.9, ease.outCubic]]);
    const ty = keys(t, [[T0, 0], [v2 - 0.9, 0.5, ease.inOutCubic], [v2, 1.75, ease.inOutCubic], [T1, 1.9, ease.outCubic]]);
    const tz = keys(t, [[T0, 0], [v2 - 0.9, -0.4, ease.inOutCubic], [v2, -1.4, ease.inOutCubic], [T1, -1.6, ease.outCubic]]);
    this.floor.look(Math.sin(a) * r, h, Math.cos(a) * r, 0, ty, tz, 0, keys(t, [[T0, 50], [T1, 46]]));
  }

  /** The dance: both tops share one orbit centre; B sits opposite A. */
  private poseTop(top: Top, w: Word, t: number, phase: number, seed: number) {
    const m = dropMotion(t, w.start, 4);
    const T0 = this.ctx.start;
    // orbit speeds up a touch on 踊る (event on the word start, eased; not per beat)
    const lt = t - T0;
    const boost = TAU * 0.22 * Math.max(0, t - this.wC.start);
    const phi = TAU * 0.32 * lt + boost + phase;
    const rr = ORBIT_R * (1 + 0.08 * Math.sin(lt * 2.3 + seed));
    const x = Math.cos(phi) * rr, z = Math.sin(phi) * rr;
    const a = t - w.start;
    top.group.visible = m.live > 0;
    top.pose(x, this.vinyl.top + m.y, z, TAU * (2.6 * a + seed), m.tilt, phi + Math.PI / 2);
    let g = 0;
    for (let i = 0; i < w.w.length; i++) g = Math.max(g, pulse(t, sylStart(w, i), 0.09));
    top.mat.uniforms.glow!.value = 0.55 * g;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    this.camera(t);
    const fl = this.floor;
    this.vinyl.set(-TAU * 0.3 * (t - this.ctx.start), fl.cam);
    this.poseTop(this.topA, this.wA, t, 0, 0.21);
    this.poseTop(this.topB, this.wB, t, Math.PI, 0.73);
    fl.shadow(0, 0, 0, 0, 0);
    fl.shadow(1, 0, 0, 0, 0);
    for (let i = 0; i < 4; i++) fl.ring(i, 0, 0, -10, 0);

    const C = this.wC;
    for (let i = 0; i < 2; i++) {
      const ts = sylStart(C, i);
      this.mada.stand(i, prog(t, ts - 0.04, ts + 0.2, ease.outBack), 1 - smoothstep(ts + 0.05, ts + 0.4, t));
    }
    for (let i = 0; i < 2; i++) {
      const ts = sylStart(C, 2 + i);
      this.odoru.stand(i, prog(t, ts - 0.05, ts + 0.28, ease.outBack), 1 - smoothstep(ts + 0.08, ts + 0.6, t));
    }

    fl.render(renderer, out, t, 1);
    this.s3.updateMatrixWorld(true);
    syncCam(this.s3, fl.cam);
    renderer.setRenderTarget(out);
    renderer.clear(false, true, false);
    renderer.render(this.s3, fl.cam);

    this.drawUI(t);
    this.ctx.comp.draw(renderer, this.ui.upload(), out);
    return { bloom: 0.5, bloomThreshold: 0.95, vignette: 0.55, grain: 0.05, ca: 0.6 };
  }

  private drawUI(t: number) {
    const L = this.ui, c = L.ctx;
    L.clear();
    c.save();
    c.font = font(F.mono(500), 24);
    c.letterSpacing = '4px';
    c.fillStyle = rgba('bone', 0.8);
    c.fillText(`yoru.code  00:${String(Math.floor(t)).padStart(2, '0')}`, 72, 270);
    c.font = font(F.mono(400), 17);
    c.fillStyle = rgba('ash', 0.7);
    const rpm = 18;
    c.fillText(`deck ${rpm} rpm   tops orbit ${(0.32 * 60).toFixed(1)} rpm`, 72, 304);
    c.restore();
    const back = smoothstep(this.wC.start - 0.35, this.wC.start + 0.05, t);
    const size = lerp(168, 128, back);
    const yA = lerp(500, 450, back), yB = lerp(690, 600, back);
    const al = lerp(1, 0.85, back);
    drawLanding(c, this.wA, this.fam, size, 70, yA, t, { align: 'left', alpha: al });
    drawLanding(c, this.wB, this.fam, size, W - 70, yB, t, { align: 'right', alpha: al });
  }
}
