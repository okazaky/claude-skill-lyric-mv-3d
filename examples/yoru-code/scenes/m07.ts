// m07 「コード コード 音になる」 (chorus 2). The camera starts low over a floor of tiny code-glyph tiles and cranes
// up and forward while the floor lifts into an engraved spectrum city: one band of bars rises on every sung
// character, front to back. コード is stamped twice as an extruded engraved block (the second pushes the first
// back); on 音 a single signal bar shoots up out of the city and 音 is cut huge in signal, になる beside it.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, clearRT } from "../engine/gl";
import { LIN, rgba } from "../engine/palette";
import { F, font } from "../engine/type";
import type { Line } from "../engine/lyrics";
import { clamp, ease, lerp, prog, pulse } from "../engine/util";
import { EWord, TextRig, projectPx, sylOf } from "./m05-kit";
import { dispWord } from "./_disp";
import { BANDS, HOT_COL, HOT_ROW, cityGeometry, cityMaterial, glyphAtlas } from "./m07-city";

export default class M07 extends Scene {
  cam = new THREE.PerspectiveCamera(46, 1080 / 1920, 0.1, 200);
  world = new THREE.Scene();
  cmat = cityMaterial(glyphAtlas());
  city = new THREE.Mesh(cityGeometry(), this.cmat);
  rig = new TextRig();
  ui = new Layer2D();
  line!: Line;
  codeA!: EWord;
  codeB!: EWord;
  oto!: EWord;
  ninaru!: EWord;
  events: number[] = [];
  tOto = 0;

  override async init() {
    this.line = this.ctx.lyrics.get("コード コード 音になる");
    this.city.frustumCulled = false;
    this.world.add(this.city);
    for (const w of this.line.words) for (let i = 0; i < w.w.length; i++) this.events.push(sylOf(w, i)[0]);
    this.tOto = this.line.words[2]!.start;
    const r = this.rig;
    const big = r.em(270);
    this.codeA = new EWord("code", F.jp(900), big, big * 0.32);
    this.codeB = new EWord("code", F.jp(900), big, big * 0.32);
    this.oto = new EWord("音", F.jp(900), r.em(420), r.em(420) * 0.3, 420);
    this.ninaru = new EWord("になる", F.jp(900), r.em(150), r.em(150) * 0.3);
    this.codeA.setCol(LIN.bone, 0.95);
    this.codeB.setCol(LIN.bone, 0.95);
    this.oto.setCol(LIN.signal, 1.15);
    this.oto.glyphs[0]!.fu.freq!.value = 44;
    this.oto.glyphs[0]!.fu.plate!.value = 0.8;
    this.ninaru.setCol(LIN.bone, 0.92);
    r.scene.add(this.codeA.group, this.codeB.group, this.oto.group, this.ninaru.group);
    const x0 = 540 - (this.oto.width + this.ninaru.width) * r.U * 0.5 - 18;
    this.oto.group.position.set(r.wx(x0), r.wy(930), 0);
    this.ninaru.group.position.set(r.wx(x0) + this.oto.width + r.em(36), r.wy(930), 0);
  }

  private camera(t: number) {
    const k = ease.inOutCubic(prog(t, this.ctx.start, this.ctx.end));
    const ex = lerp(-1.2, 2.6, k),
      ey = lerp(5.2, 10.5, k),
      ez = lerp(5.0, 6.5, k);
    this.cam.position.set(ex, ey, ez);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(lerp(0.2, 0.6, k), lerp(-0.5, 0.8, k), lerp(-6.5, -12, k));
    this.cam.updateMatrixWorld(true);
  }

  private stamp(word: EWord, t: number, t0: number) {
    const k = prog(t, t0 - 0.02, t0 + 0.2, ease.outExpo);
    word.reveal = t >= t0 - 0.02 ? 1 : 0;
    return k;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const w = this.line.words;
    clearRT(renderer, out, LIN.ink);

    // ---- city
    this.camera(t);
    const u = this.cmat.uniforms;
    const rise = u.uRise!.value as number[];
    for (let b = 0; b < BANDS; b++) {
      const e = this.events[Math.min(b, this.events.length - 1)]!;
      rise[b] = ease.outBack(prog(t, e - 0.02, e + 0.32));
    }
    u.uHotRise!.value = ease.outExpo(prog(t, this.tOto - 0.02, this.tOto + 0.5));
    u.uHot!.value = pulse(t, this.tOto, 0.35);
    (u.uCam!.value as THREE.Vector3).copy(this.cam.position);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.world, this.cam);

    // ---- type
    const r = this.rig;
    r.look(lerp(1.8, -1.6, f.p), 1.0);
    const big = r.em(270);
    const kA = this.stamp(this.codeA, t, w[0]!.start);
    const kB = this.stamp(this.codeB, t, w[1]!.start);
    const shrink = ease.inOutCubic(prog(t, this.tOto - 0.1, this.tOto + 0.25));
    const sc = lerp(1, 70 / 270, shrink);
    const bx = r.wx(540) - this.codeA.width / 2,
      by = r.wy(560);
    const smallW = this.codeA.width * (70 / 270);
    const gap = r.em(34);
    const lx = r.wx(540) - (smallW * 2 + gap) / 2,
      ly = r.wy(318);
    const push = ease.outCubic(prog(t, w[1]!.start, w[1]!.start + 0.3));
    this.codeA.group.position.set(
      lerp(bx, lx, shrink),
      lerp(by + push * big * 1.3, ly, shrink),
      lerp(lerp(4.5, 0, kA) - push * 4.5, 0, shrink),
    );
    this.codeA.opacity = clamp(kA * 3) * lerp(1, 0.42, push * (1 - shrink)) * lerp(1, 0.8, shrink);
    this.codeA.group.scale.setScalar(sc);
    this.codeB.group.position.set(lerp(bx, lx + smallW + gap, shrink), lerp(by, ly, shrink), lerp(4.5, 0, kB) * (1 - shrink));
    this.codeB.opacity = clamp(kB * 3) * lerp(1, 0.8, shrink);
    this.codeB.group.scale.setScalar(sc);
    for (const [word, wd] of [
      [this.codeA, w[0]!],
      [this.codeB, w[1]!],
    ] as const)
      word.glyphs.forEach((g, i) => (g.glow = 0.9 * pulse(t, sylOf(dispWord(wd), i)[0], 0.12)));
    const wo = w[2]!;
    const go = this.oto.glyphs[0]!;
    const [a0, b0] = sylOf(wo, 0);
    go.reveal = prog(t, a0 - 0.02, a0 + Math.min(0.35, b0 - a0), ease.outCubic);
    go.glow = 0.5 * pulse(t, a0, 0.2);
    go.group.position.z = lerp(2.0, 0, prog(t, a0 - 0.02, a0 + 0.3, ease.outExpo));
    this.ninaru.glyphs.forEach((g, i) => {
      const [a, b] = sylOf(wo, i + 1);
      g.reveal = prog(t, a - 0.02, a + Math.max(0.12, Math.min(0.22, b - a)), ease.outCubic);
      g.glow = 0.5 * pulse(t, a, 0.12);
    });
    r.render(renderer, out);

    // ---- small mono label on the hot bar
    const ui = this.ui;
    ui.clear();
    const la = prog(t, this.tOto + 0.15, this.tOto + 0.4);
    if (la > 0) {
      const p = projectPx(this.cam, HOT_COL + 0.45, 4.2 * u.uHotRise!.value, -HOT_ROW + 0.4);
      if (p && p.y > 240 && p.y < 1500) {
        const c = ui.ctx;
        c.globalAlpha = la;
        c.fillStyle = rgba("signal", 0.95);
        c.fillRect(p.x, p.y, 46, 1);
        c.font = font(F.mono(500), 22);
        c.fillText("440Hz", p.x + 54, p.y + 8);
        c.font = font(F.mono(400), 16);
        c.fillStyle = rgba("ash", 0.9);
        c.fillText("code → sound", p.x + 54, p.y + 30);
      }
    }
    ui.upload();
    this.ctx.comp.draw(renderer, ui.texture, out);

    return { bloom: 0.4, bloomThreshold: 1.1, vignette: 0.5, grain: 0.05, ca: 0.4 };
  }
}
