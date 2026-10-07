// s07 「新しいチャットで 君は私を忘れる」 — the chorus opens. The chat history stands in depth as
// engraved panels (their bubbles carry the earlier lines: the conversation so far). The camera
// whips from panel to panel on the beats; on every off-beat 8th a white sweep wipes the panel in
// front. On the downbeat of 君は everything left is wiped in one flash and we land on an empty
// "new chat" panel in 3/4 view; the line is set on its face, and 忘れる peels off into particles
// blown away as it is sung.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { FSPass, Layer2D, W } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout } from "../engine/type";
import type { Line, Word } from "../engine/lyrics";
import { clamp, ease, frameIdx, hash, lerp, noise1, prog, pulse, smoothstep } from "../engine/util";
import { beatsIn } from "./stack-kit";
import { GlyphPlane, lin } from "./s07-kit";
import { Panel, buildAtlas } from "./s07-panels";

type V3 = THREE.Vector3;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const PW = 6.4,
  PH = 4.0; // history panel size (world)
const D = 6; // depth pitch between panels
const NW = 12,
  NH = 7.5; // new chat panel
const SWEEP = 0.16; // sweep duration (s)

interface Hist {
  panel: Panel;
  pos: V3;
  rot: THREE.Euler;
  tSweep: number;
  side: number;
}
interface Ch {
  g: GlyphPlane;
  t0: number;
  t1: number;
  x: number;
  y: number;
  hot: boolean;
  pts?: { x: number; y: number; u: number; v: number; h: number }[];
}

export default class S07 extends Scene {
  cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  aux = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 300);
  panelScene = new THREE.Scene();
  textScene = new THREE.Scene();
  rig = new THREE.Group();
  face = new THREE.Group();
  edges = new LineBatch(4000, { screen2D: false, blend: "add", depthTest: true });
  fx = new LineBatch(40000, { screen2D: false, blend: "add" });
  hud = new Layer2D();
  bg = new FSPass(
    /* glsl */ `
    uniform float z; uniform float flash;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      float r = length(p);
      vec3 c = C_INK + C_INK2 * 0.55 * (1.0 - smoothstep(0.0, 0.9, r));
      // receding engraved rings: the tunnel of the conversation, parallax with the dolly
      float u = log(max(r, 1e-3)) * 9.0 + z * 0.35;
      c += C_GRAPHITE * 0.07 * hatch(u, 0.06) * smoothstep(0.05, 0.5, r);
      fragColor = vec4(c, 1.0);
    }`,
    { z: { value: 0 }, flash: { value: 0 } },
  );

  T0 = 0;
  T1 = 0;
  tB = 0;
  tCut = 0;
  L!: Line;
  w1!: Word;
  w2!: Word;
  beatsA: number[] = [];
  beatsB: number[] = [];
  sweepsA: number[] = [];
  hist: Hist[] = [];
  newPanel!: Panel;
  newPos = v3(-0.8, 0.3, -14);
  newRot = new THREE.Euler(0, -0.6, 0.0);
  line1: Ch[] = [];
  line2: Ch[] = [];

  override async init() {
    const { lyrics, audio } = this.ctx;
    this.T0 = this.ctx.start;
    this.T1 = this.ctx.end;
    this.L = lyrics.get("新しいチャットで");
    [this.w1, this.w2] = this.L.words as [Word, Word];
    for (const w of [this.w1, this.w2])
      if (!w.syl || w.syl.length !== w.w.length)
        throw new Error(`s07: syl/char mismatch in ${w.w}`);
    // the big flash: first downbeat at 君は (the chorus downbeat itself lies in s06's window)
    const db = audio.downbeats.find((d) => d > this.w1.end - 0.25 && d < this.w2.start + 0.3);
    this.tB = db ?? audio.timeOfBeat(Math.round(audio.beatAt(this.w2.start)));
    this.tCut = Math.min(this.tB, this.w2.start) - 0.01; // land before 君 is sung
    this.beatsA = beatsIn(audio, this.T0 - 1e-3, this.tCut);
    this.beatsB = beatsIn(audio, this.tB - 1e-3, this.T1);
    this.sweepsA = this.beatsA
      .map((b) => audio.timeOfBeat(audio.beatAt(b) + 0.5))
      .filter((x) => x < this.tCut);

    // ---- history panels: the conversation so far (earlier lines), most recent in front
    const prev = lyrics.lines.slice(0, this.L.i).map((l) => l.text);
    const nHist = this.beatsA.length + Math.max(1, this.beatsB.length);
    const pairs: [string, string][] = [];
    for (let k = 0; k < nHist; k++) {
      const n = prev.length;
      pairs.push([
        prev[(n - 1 - (k % n) + n) % n] ?? "",
        prev[(n - 2 - (k % n) + 2 * n) % n] ?? "",
      ]);
    }
    const { tex, tiles } = buildAtlas(pairs);
    for (let k = 0; k < nHist; k++) {
      const side = k % 2 ? 1 : -1;
      const pos = v3(side * 1.5 + (hash(k, 1) - 0.5) * 0.8, (hash(k, 2) - 0.5) * 0.9, -k * D);
      const rot = new THREE.Euler(0, -pos.x * 0.07 + side * 0.08, (hash(k, 3) - 0.5) * 0.08);
      const p = new Panel(tex, k, tiles, PW, PH);
      p.mesh.position.copy(pos);
      p.mesh.rotation.copy(rot);
      this.panelScene.add(p.mesh);
      // phase A panels are swept on the off-beat 8ths, the next one in the flash, the rest on phase B's beats
      const tSweep =
        k < this.sweepsA.length
          ? this.sweepsA[k]!
          : k === this.sweepsA.length
            ? this.tB - 0.02
            : (this.beatsB[k - this.sweepsA.length] ?? this.T1 + 9);
      this.hist.push({ panel: p, pos, rot, tSweep, side });
    }
    this.newPanel = new Panel(tex, tiles - 1, tiles, NW, NH, true);
    this.newPanel.mesh.position.copy(this.newPos);
    this.newPanel.mesh.rotation.copy(this.newRot);
    this.panelScene.add(this.newPanel.mesh);

    // ---- type
    const fam = F.jp(900);
    this.line1 = this.setLine(this.w1, fam, 0.8, this.rig, () => false);
    this.textScene.add(this.rig);
    this.line2 = this.setLine(this.w2, fam, 1.32, this.face, (i) => i >= 4);
    this.face.position.copy(this.newPos);
    this.face.rotation.copy(this.newRot);
    this.textScene.add(this.face);
    for (const c of this.line2)
      if (c.hot)
        c.pts = c.g.points(3).map((p, j) => ({ ...p, h: hash(j, c.g.text.charCodeAt(0)) }));
  }

  /** Per-character planes laid out with the font's own advances, centred, baseline at y = 0. */
  private setLine(
    w: Word,
    fam: string,
    em: number,
    parent: THREE.Object3D,
    hot: (i: number) => boolean,
  ): Ch[] {
    const lay = layout(w.w, fam, 100);
    const total = (lay.width / 100) * em;
    return lay.glyphs.map((gl, i) => {
      const g = new GlyphPlane(gl.ch, fam, 220, em);
      const sLog = em / 220;
      const x = (gl.x / 100) * em - total / 2 + g.cx * sLog;
      const y = g.cy * sLog - em * 0.36;
      g.mesh.position.set(x, y, 0.04);
      parent.add(g.mesh);
      return { g, t0: w.syl![i]![0], t1: w.syl![i]![1], x, y, hot: hot(i) };
    });
  }

  // ------------------------------------------------------------ camera
  private camFor(k: number): { pos: V3; tgt: V3 } {
    if (k < 0) return { pos: v3(0.5, 1.6, 15), tgt: v3(-0.4, 0, 0) };
    const h = this.hist[k]!;
    return {
      pos: h.pos.clone().add(v3(-h.pos.x * 0.45 - h.side * 0.9, 0.45, 6.4)),
      tgt: h.pos.clone().add(v3(0.2, -0.1, -1.6)),
    };
  }

  /** Camera state. `base` drops the whip (arc, roll, shake): the lyric rig rides on the base path. */
  private camAt(t: number, base = false): { pos: V3; tgt: V3; roll: number; fov: number } {
    if (t < this.tCut) {
      let j = -1;
      for (let i = 0; i < this.beatsA.length; i++) if (t >= this.beatsA[i]! - 1e-4) j = i;
      j = Math.max(0, j);
      const tb = this.beatsA[j]!;
      const a = this.camFor(j - 1),
        b = this.camFor(j);
      const tn = this.beatsA[j + 1] ?? this.tCut;
      const e = ease.inOutCubic(clamp((t - tb) / Math.max(0.2, tn - tb)));
      const pos = a.pos.clone().lerp(b.pos, e),
        tgt = a.tgt.clone().lerp(b.tgt, e);
      const drift = (t - tb) * 0.6; // a steady push, no per-beat lurch
      pos.z -= drift;
      tgt.z -= drift;
      const sgn = j % 2 ? -1 : 1;
      let roll = 0;
      if (!base) {
        pos.x += sgn * 0.3 * Math.sin(Math.PI * e);
        roll = sgn * 0.03 * Math.sin(Math.PI * e);
      }
      return { pos, tgt, roll, fov: lerp(52, 42, ease.outCubic(clamp((t - this.T0) / 0.4))) };
    }
    // phase B: 3/4 view of the new chat; keeps pushing in and swinging toward the front (yaw drift),
    // punched on every beat; whips in from the last history panel
    const p = prog(t, this.tCut, this.T1);
    const tgt = this.newPos.clone().add(v3(0.5 + 0.4 * p, -0.25, 0));
    const a = lerp(0.1, -0.24, ease.inOutQuad(p));
    let dist = lerp(11.2, 8.9, p);
    let lift = lerp(1.35, 0.45, ease.inOutQuad(p));
    if (false)
      for (const b of this.beatsB) {
        const k = pulse(t, b, 0.07);
        dist -= 0.75 * k;
        lift += 0.12 * k;
      }
    const pos = tgt.clone().add(v3(Math.sin(a) * dist, lift, Math.cos(a) * dist));
    const e = ease.outExpo(clamp((t - this.tCut) / 0.24));
    const last = this.camAt(this.tCut - 1e-3, true);
    const pp = last.pos.clone().lerp(pos, e),
      tt = last.tgt.clone().lerp(tgt, e);
    return {
      pos: pp,
      tgt: tt,
      roll: base ? 0 : 0.03 * (1 - e) + 0.022 * Math.sin(t * 2.1) - 0.015 * p,
      fov: 40,
    };
  }

  private applyCam(c: THREE.PerspectiveCamera, s: { pos: V3; tgt: V3; roll: number; fov: number }) {
    c.fov = s.fov;
    c.position.copy(s.pos);
    c.up.set(0, 1, 0);
    c.lookAt(s.tgt);
    c.rotateZ(s.roll);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  // ------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const phaseB = t >= this.tCut;
    const cs = this.camAt(t);
    // whip shake on the landing beats, kick punch in phase B
    const kick = f.a.kick;
    const sh = (phaseB ? 0.05 : 0.09) * kick;
    cs.pos.x += (hash(frameIdx(t), 1) - 0.5) * sh;
    cs.pos.y += (hash(frameIdx(t), 2) - 0.5) * sh;
    this.applyCam(this.cam, cs);

    this.bg.u.z!.value = -cs.pos.z;
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();

    this.updatePanels(t);
    renderer.render(this.panelScene, this.cam);
    this.drawEdges(t);
    this.edges.render(renderer, out, this.cam);

    this.updateText(t);
    renderer.setRenderTarget(out);
    renderer.render(this.textScene, this.cam);

    this.fx.clear();
    this.drawParticles(t);
    if (this.fx.count) this.fx.render(renderer, out, this.cam);

    this.drawHud(t, phaseB);
    this.ctx.comp.draw(renderer, this.hud.upload(), out);

    const flash =
      // additive in linear light: even 0.05 greys the frame, so every flash is cut off hard
      1.2 * pulse(t, this.tB, 0.03) * (1 - smoothstep(this.tB + 0.06, this.tB + 0.14, t));
    const shk = (phaseB ? 9 : 5) * kick + 22 * pulse(t, this.tB, 0.05);
    return {
      bloom: 0.6,
      ca: 1.3 + 2.5 * pulse(t, this.tB, 0.08),
      vignette: 0.45,
      grain: 0.06,
      flash,
      exposure: 1 + 0.25 * pulse(t, this.tB, 0.1),
      shake: [noise1(t * 60, 1) * shk, noise1(t * 60, 2) * shk],
      zoom: 1 + 0.03 * pulse(t, this.tB, 0.12),
    };
  }

  private sweepState(t: number, ts: number) {
    const sw = t < ts ? -1 : clamp((t - ts) / SWEEP);
    const blank = smoothstep(ts + SWEEP, ts + SWEEP + 0.14, t);
    const gone = prog(t, ts + SWEEP + 0.03, ts + SWEEP + 0.16, ease.inQuad);
    return { sw, blank, gone };
  }

  /** Phase B: the rest of the history streams past the new chat in depth, wiped as it goes by on its beat. */
  private flyPast(t: number, h: Hist, s: { sw: number; blank: number }) {
    const u = clamp((t - (h.tSweep - 0.85)) / 1.5);
    const c = this.newPos;
    const y = (hash(h.side, h.tSweep * 7) - 0.5) * 3.2;
    const far = v3(c.x + (h.side > 0 ? 10 : -11), c.y + y, c.z - 40);
    const near = v3(c.x + (h.side > 0 ? 9 : -10), c.y + y * 0.6, c.z + 7);
    h.panel.mesh.position.copy(far.lerp(near, ease.inQuad(u)));
    h.panel.mesh.rotation.set(0.05, -h.side * 0.45 - 0.3, h.side * (0.05 + 0.35 * u));
    const vis = smoothstep(0, 0.12, u) * (1 - smoothstep(0.85, 1, u));
    h.panel.set({ sweep: s.sw, blank: s.blank, opacity: vis, fogNear: 10, fogFar: 44, lightK: 1 });
    h.panel.mesh.visible = vis > 0.001;
  }

  private updatePanels(t: number) {
    const phaseB = t >= this.tCut;
    for (const h of this.hist) {
      const s = this.sweepState(t, h.tSweep);
      if (phaseB && h.tSweep > this.tB + 0.1) {
        this.flyPast(t, h, s);
        continue;
      }
      // wiped panels drop back and away
      h.panel.mesh.position.set(h.pos.x, h.pos.y - 5 * s.gone * s.gone, h.pos.z - 2 * s.gone);
      h.panel.mesh.rotation.set(h.rot.x - 0.5 * s.gone, h.rot.y, h.rot.z + h.side * 0.2 * s.gone);
      // in phase B the history behind the new chat is dimmer (it is out of focus, being wiped)
      h.panel.set({
        sweep: s.sw,
        blank: s.blank,
        opacity: 1 - s.gone,
        fogNear: phaseB ? 9 : 7,
        fogFar: phaseB ? 46 : 34,
        lightK: 1,
      });
      h.panel.mesh.visible = s.gone < 0.999;
    }
    const inB = smoothstep(this.tCut - 0.02, this.tCut + 0.02, t);
    this.newPanel.mesh.visible = inB > 0;
    const caretOn = Math.floor((t - this.tCut) / 0.28) % 2 === 0 ? 1 : 0;
    this.newPanel.set({
      sweep: -1,
      blank: 0,
      opacity: inB,
      fogNear: 30,
      fogFar: 80,
      lightK: 1.2,
      caret: caretOn,
    });
  }

  /** Panel thickness and the stacked pages behind each panel, as 3D hairlines. */
  private drawEdges(t: number) {
    const lb = this.edges;
    lb.clear();
    const m = new THREE.Matrix4();
    const corner = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(m);
    const rect = (
      w: number,
      h: number,
      z: number,
      wd: number,
      c: [number, number, number],
      a: number,
    ) => {
      const P = [
        corner(-w / 2, -h / 2, z),
        corner(w / 2, -h / 2, z),
        corner(w / 2, h / 2, z),
        corner(-w / 2, h / 2, z),
      ];
      for (let i = 0; i < 4; i++) {
        const p = P[i]!,
          q = P[(i + 1) % 4]!;
        lb.seg(p.x, p.y, p.z, q.x, q.y, q.z, wd, c[0], c[1], c[2], a);
      }
      return P;
    };
    const bone = lin("bone", 0.55),
      graph = lin("graphite", 0.9);
    const draw = (mesh: THREE.Mesh, w: number, h: number, alpha: number, pages: number) => {
      mesh.updateMatrixWorld();
      m.copy(mesh.matrixWorld);
      const F0 = rect(w, h, 0.0, 1.3, bone, alpha);
      const B0 = rect(w, h, -0.16, 1, graph, alpha);
      for (let i = 0; i < 4; i++)
        lb.seg(
          F0[i]!.x,
          F0[i]!.y,
          F0[i]!.z,
          B0[i]!.x,
          B0[i]!.y,
          B0[i]!.z,
          1,
          graph[0],
          graph[1],
          graph[2],
          alpha,
        );
      for (let k = 1; k <= pages; k++)
        rect(w - k * 0.12, h - k * 0.12, -0.16 - k * 0.22, 1, graph, alpha * (0.7 - k * 0.12));
    };
    for (const h of this.hist) {
      if (!h.panel.mesh.visible) continue;
      const s = this.sweepState(t, h.tSweep);
      draw(h.panel.mesh, PW, PH, h.panel.mat.uniforms.opacity!.value as number, 4);
      // the sweep's scanning bar overshoots the panel
      if (s.sw >= 0 && s.sw < 1) {
        const e = s.sw * 1.3 - 0.15;
        const x = (e - 0.5) * PW;
        const a = corner(x + 0.06 * PH, -PH / 2 - 0.5, 0.02),
          b = corner(x - 0.06 * PH, PH / 2 + 0.5, 0.02);
        lb.seg(
          a.x,
          a.y,
          a.z,
          b.x,
          b.y,
          b.z,
          3,
          LIN.bone[0] * 1.3,
          LIN.bone[1] * 1.3,
          LIN.bone[2] * 1.3,
          1,
        );
        lb.seg(
          a.x,
          a.y,
          a.z,
          b.x,
          b.y,
          b.z,
          1.2,
          LIN.signal[0] * 3,
          LIN.signal[1] * 3,
          LIN.signal[2] * 3,
          1,
        );
      }
    }
    if (this.newPanel.mesh.visible)
      draw(this.newPanel.mesh, NW, NH, this.newPanel.mat.uniforms.opacity!.value as number, 2);
  }

  // ------------------------------------------------------------ type
  private updateText(t: number) {
    // line 1 rides in front of the camera's base path (no whip, slight lag): readable through the whips
    const b = this.camAt(t - 0.05, true);
    this.applyCam(this.aux, b);
    const fwd = v3(0, 0, -1).applyQuaternion(this.aux.quaternion);
    const up = v3(0, 1, 0).applyQuaternion(this.aux.quaternion);
    this.rig.position.copy(b.pos).addScaledVector(fwd, 8.2).addScaledVector(up, 0.55);
    this.rig.quaternion.copy(this.aux.quaternion);
    this.rig.rotateY(0.16);
    this.rig.rotateX(0.05);
    const out1 = smoothstep(this.tCut, this.tCut + 0.05, t);
    this.rig.visible = out1 < 1;
    const pre1 = smoothstep(this.w1.start - 0.4, this.w1.start - 0.05, t);
    // while the panel behind the line is wiped to white paper, the line prints in ink (inverted)
    let paperK = 0;
    for (const h of this.hist) {
      const s = this.sweepState(t, h.tSweep);
      if (s.sw >= 0) paperK = Math.max(paperK, smoothstep(0.35, 0.6, s.sw) * (1 - s.blank) * (1 - s.gone));
    }
    const fg = mix3(lin("bone", 0.88), lin("ink", 1), paperK);
    for (const c of this.line1) {
      const lit = t >= c.t0;
      const k = lit ? ease.outExpo(clamp((t - c.t0) / 0.25)) : 0;
      const hot = lit ? 1 - smoothstep(c.t0 + 0.06, c.t0 + 0.3, t) : 0;
      c.g.mesh.position.set(c.x, c.y, 0.04 + (lit ? 0.9 * (1 - k) : 0));
      c.g.mesh.scale.setScalar(lit ? lerp(1.3, 1, k) : 1);
      const col = lit ? mix3(fg, lin("signal", 1.6 - 0.6 * paperK), hot) : fg;
      c.g.set({ col, opacity: (lit ? 1 : (0.26 + 0.2 * paperK) * pre1) * (1 - out1) });
    }
    // line 2 on the new chat's face
    const inB = smoothstep(this.tCut - 0.01, this.tCut + 0.03, t);
    this.face.visible = inB > 0;
    let beatK = 0;
    for (const bt of this.beatsB) beatK = Math.max(beatK, pulse(t, bt, 0.08));
    this.face.scale.setScalar(1 + 0 * beatK);
    for (let i = 0; i < this.line2.length; i++) {
      const c = this.line2[i]!;
      const lit = t >= c.t0;
      const k = lit ? ease.outExpo(clamp((t - c.t0) / 0.22)) : 0;
      const hotK = lit ? 1 - smoothstep(c.t0 + 0.05, c.t0 + 0.3, t) : 0;
      c.g.mesh.position.set(c.x, c.y + 0.25, 0.04 + (lit ? 1.1 * (1 - k) : 0));
      c.g.mesh.scale.setScalar(lit ? lerp(1.35, 1, k) : 1);
      let col = lin("bone", 0.88);
      if (lit)
        col = c.hot
          ? lin("signal", 1.25 + 1.2 * hotK)
          : mix3(lin("bone", 0.88), lin("signal", 1.6), hotK);
      const dis = c.hot ? clamp((t - (c.t0 + 0.12)) / 0.55) : 0;
      c.g.set({ col, opacity: (lit ? 1 : 0.24) * inB, dis, disDir: 0, seed: i });
    }
  }

  /** 忘れる blows away: each ink point leaves when the dissolve front passes it, streaks off to the right. */
  private drawParticles(t: number) {
    if (t < this.tCut) return;
    this.face.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    const qx = v3(1, 0, 0).applyEuler(this.newRot),
      qn = v3(0, 0, 1).applyEuler(this.newRot),
      qy = v3(0, 1, 0);
    const p0 = new THREE.Vector3();
    for (const c of this.line2) {
      if (!c.pts) continue;
      const ts = c.t0 + 0.12;
      if (t < ts) continue;
      m.copy(c.g.mesh.matrixWorld);
      for (let j = 0; j < c.pts.length; j++) {
        const p = c.pts[j]!;
        const td = ts + (0.55 * (p.u * 0.72 + p.h * 0.28)) / 1.05;
        const age = t - td;
        const life = 0.5 + 0.35 * hash(j, 7);
        if (age < 0 || age > life) continue;
        p0.set(p.x, p.y, 0).applyMatrix4(m);
        const at = (a: number) => {
          const vx = 5 + 7 * hash(j, 1),
            vy = 0.4 + 2.2 * (hash(j, 2) - 0.35),
            vz = 2.4 * hash(j, 3);
          const sw = Math.sin(a * 9 + j) * 0.12 * a;
          return p0
            .clone()
            .addScaledVector(qx, vx * a + 9 * a * a)
            .addScaledVector(qy, vy * a + 1.2 * a * a + sw)
            .addScaledVector(qn, vz * a);
        };
        const a = at(age),
          b = at(Math.max(0, age - 0.07)); // trail: where it was 70 ms ago
        const k = 1 - age / life;
        const hot = k * k;
        const I = 0.34;
        this.fx.seg(
          b.x,
          b.y,
          b.z,
          a.x,
          a.y,
          a.z,
          0.8 + 1.0 * k,
          (LIN.signal[0] + (1 - LIN.signal[0]) * hot * 0.4) * I,
          (LIN.signal[1] + (0.8 - LIN.signal[1]) * hot * 0.4) * I,
          (LIN.signal[2] + (0.5 - LIN.signal[2]) * hot * 0.4) * I,
          Math.min(1, k * 1.5) * 0.6,
        );
      }
    }
  }

  // ------------------------------------------------------------ HUD (machine voice, small)
  private drawHud(t: number, phaseB: boolean) {
    const L = this.hud;
    L.clear();
    const c = L.ctx;
    const swept = this.hist.filter((h) => t >= h.tSweep + SWEEP).length;
    const total = 48213;
    const left = phaseB
      ? 0
      : Math.round(total * (1 - swept / Math.max(1, this.sweepsA.length + 1)));
    c.font = font(F.mono(500), 13);
    c.letterSpacing = "3px";
    c.fillStyle = rgba("bone", 0.55);
    c.textAlign = "right";
    c.fillText("CONTEXT WINDOW", W - 104, 136);
    c.letterSpacing = "0px";
    c.font = font(F.mono(400), 34);
    c.fillStyle = phaseB ? rgba("signal", 1) : rgba("bone", 0.9);
    c.fillText(`${left.toLocaleString("en-US")} tok`, W - 104, 178);
    c.fillStyle = rgba("bone", 0.18);
    c.fillRect(W - 364, 194, 260, 1);
    c.font = font(F.jp(400), 17);
    c.fillStyle = rgba("bone", 0.6);
    c.fillText(
      phaseB
        ? "新しいチャット ・ 記憶なし"
        : `履歴を消去しています（${swept} / ${this.hist.length}）`,
      W - 104,
      222,
    );
    c.font = font(F.mono(500), 13);
    c.letterSpacing = "3px";
    c.fillStyle = rgba("bone", 0.55);
    c.fillText(
      phaseB ? "SESSION NEW · 0 MSG" : `SESSION 00${41 - swept * 5} · CLEARING`,
      W - 104,
      104,
    );
    c.letterSpacing = "0px";
    c.textAlign = "left";
  }
}

function mix3(
  a: [number, number, number],
  b: [number, number, number],
  k: number,
): [number, number, number] {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
