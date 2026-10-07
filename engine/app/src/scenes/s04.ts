// s04 「好きと打ったら 『私はAIなので』」 — adapted from prompt.ts. The camera starts behind the input
// field looking down a dark corridor at a tilted pane of engraved glass with HUD rings stacked in front
// of it. 好きと打ったら is typed on its syllables; on ⏎ the word 好き lifts out of the field as an extruded
// 3D object, hangs, and is flung down the corridor into the glass while the reply 「私はAIなので」 arrives
// cold. On the downbeat 好き hits the glass and shatters into atoms that fly back through the corridor;
// the glass cracks. The camera dollies in and yaws across the corridor; rings step round on every beat.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W, H, clearRT } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font } from "../engine/type";
import type { Word } from "../engine/lyrics";
import { clamp, ease, keys, lerp, noise1, prog, pulse, type Key } from "../engine/util";
import { S04UI } from "./s04-ui";
import { wallMesh, drawRings, drawCorridor, wallToWorld, WALL_RY, IMP_L } from "./s04-geo";
import { sukiMesh, makeAtoms, SUKI_H, type Atom } from "./s04-glyph";

type P3 = { x: number; y: number; z: number };
const GLYPH_BACK = 0.34; // the glyph's depth: where its front sits when its back touches the glass

export default class S04 extends Scene {
  cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 200);
  vp = new THREE.Matrix4();
  v4 = new THREE.Vector4();
  v3 = new THREE.Vector3();
  world = new THREE.Scene();
  wall = wallMesh();
  suki = sukiMesh();
  lines3 = new LineBatch(60000, { screen2D: false, depthTest: true, blend: "add" });
  text = new Layer2D();
  ui!: S04UI;
  wIn!: Word;
  wRep!: Word;
  tEnter = 0;
  tShat = 0;
  tPush = 0;
  atoms: Atom[] = [];
  nrm: P3 = { x: Math.sin(WALL_RY), y: 0, z: Math.cos(WALL_RY) };
  right: P3 = { x: Math.cos(WALL_RY), y: 0, z: -Math.sin(WALL_RY) };
  imp: P3 = { x: 0, y: 0, z: 0 };

  override init() {
    const { lyrics, audio } = this.ctx;
    const line = lyrics.get("好きと打ったら");
    this.wIn = line.words[0]!;
    this.wRep = line.words[1]!;
    this.tEnter = this.wIn.end - 0.03;
    // the impact: the downbeat nearest the reply's な (after "AI")
    const na = this.wRep.syl?.[5]?.[0] ?? (this.wRep.start + this.wRep.end) / 2;
    const dbs = audio.downbeats.filter((d) => d > this.tEnter + 0.8 && d < this.ctx.end - 0.8);
    this.tShat = dbs.length
      ? dbs.reduce((a, d) => (Math.abs(d - na) < Math.abs(a - na) ? d : a))
      : na;
    this.tPush = this.tShat - 0.42;
    this.ui = new S04UI(this.wIn, this.wRep, this.tEnter, this.tShat);
    this.world.add(this.wall.mesh, this.suki.mesh);
    this.imp = wallToWorld(this.wall.mesh.matrixWorld, IMP_L.x, IMP_L.y, 0);
    this.atoms = makeAtoms();
  }

  // ---------------------------------------------------------------- camera
  private camAt(t: number) {
    const T0 = this.ctx.start,
      T1 = this.ctx.end,
      te = this.tEnter,
      ts = this.tShat;
    const K = (v: number[]) =>
      keys(t, [
        [T0, v[0]!],
        [te, v[1]!, ease.inOutQuad],
        [ts, v[2]!, ease.inOutCubic],
        [ts + 0.7, v[3]!, ease.outExpo],
        [T1, v[4]!, ease.inOutQuad],
      ] as Key[]);
    const pos = {
      x: K([-3.2, -1.6, 0.8, 2.0, 3.4]),
      y: K([0.3, 0.6, 0.9, 0.7, 1.1]),
      z: K([10, 7.0, 3.2, 4.6, 5.6]),
    };
    const tgt = {
      x: K([2.2, 1.4, 0.6, -0.2, -1.0]),
      y: K([0.4, 0.6, 0.8, 0.6, 0.6]),
      z: K([-14, -14, -13, -14, -14]),
    };
    return { pos, tgt, roll: K([0.03, 0.01, -0.02, 0.035, 0.05]) };
  }
  private setCam(c0: { pos: P3; tgt: P3; roll: number }, shake: [number, number]) {
    const c = this.cam;
    c.position.set(c0.pos.x, c0.pos.y, c0.pos.z);
    c.up.set(0, 1, 0);
    c.lookAt(c0.tgt.x + shake[0], c0.tgt.y + shake[1], c0.tgt.z);
    c.rotateZ(c0.roll);
    c.updateMatrixWorld(true);
    this.vp.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  }
  private proj(x: number, y: number, z: number) {
    const v = this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    if (v.w <= 0.05) return null;
    const P11 = this.cam.projectionMatrix.elements[5]!;
    return {
      x: ((v.x / v.w) * 0.5 + 0.5) * W,
      y: (0.5 - (v.y / v.w) * 0.5) * H,
      s: (0.5 * H * P11) / v.w,
    };
  }
  /** World point at distance d along the ray through screen pixel (px, py). */
  private unproj(px: number, py: number, d: number): P3 {
    const v = this.v3.set((px / W) * 2 - 1, 1 - (py / H) * 2, 0.5).unproject(this.cam);
    const c = this.cam.position;
    const dx = v.x - c.x,
      dy = v.y - c.y,
      dz = v.z - c.z;
    const l = Math.hypot(dx, dy, dz);
    return { x: c.x + (dx / l) * d, y: c.y + (dy / l) * d, z: c.z + (dz / l) * d };
  }

  /** Pose of the 3D 好き: lifts out of the field on ⏎, hangs, is flung into the glass. */
  private sukiPose(t: number) {
    if (t < this.tEnter || t >= this.tShat) return null;
    const lift = prog(t, this.tEnter, this.tEnter + 0.5, ease.outExpo);
    const D0 = 3.2;
    const a = this.ui.sukiAnchor(t);
    const start = this.unproj(a.x, a.y, D0);
    const s0 = 80 / ((0.5 * H * this.cam.projectionMatrix.elements[5]!) / D0) / SUKI_H;
    const hold: P3 = {
      x: 0.3 + 0.15 * noise1(t * 0.7, 3),
      y: 0.55 + 0.1 * noise1(t * 0.6, 4),
      z: -3.2,
    };
    const f = prog(t, this.tPush, this.tShat, ease.inCubic);
    const n = this.nrm,
      I = this.imp;
    const hit = { x: I.x + n.x * GLYPH_BACK, y: I.y, z: I.z + n.z * GLYPH_BACK };
    const p = {
      x: lerp(start.x, lerp(hold.x, hit.x, f), lift),
      y: lerp(start.y, lerp(hold.y, hit.y, f), lift),
      z: lerp(start.z, lerp(hold.z, hit.z, f), lift),
    };
    const c = this.cam.position;
    const face = Math.atan2(c.x - p.x, c.z - p.z) + 0.42; // turned so the side walls show
    return {
      p,
      scale: lerp(s0, 1, lift),
      yaw: lerp(face + 0.12 * noise1(t * 0.5, 7), WALL_RY, f),
      pitch: lerp(-0.1, 0, f),
      lift,
      f,
    };
  }

  // ---------------------------------------------------------------- render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const hit = pulse(t, this.tShat, 0.12);
    const shakeA = 0.04 * f.a.kick + 0.3 * hit;
    const shake: [number, number] = [shakeA * noise1(t * 40, 1), shakeA * noise1(t * 43, 2)];
    this.setCam(this.camAt(t), shake);

    const pose = this.sukiPose(t);
    const m = this.suki.mesh;
    m.visible = !!pose;
    if (pose) {
      m.position.set(pose.p.x, pose.p.y, pose.p.z);
      m.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
      m.scale.setScalar(pose.scale);
      this.suki.mat.uniforms.uHeat!.value = pose.f;
    }

    clearRT(renderer, out, LIN.ink);
    const u = this.wall.mat.uniforms;
    const crack = prog(t, this.tShat, this.tShat + 0.5, ease.outExpo);
    u.uCrack!.value = t >= this.tShat ? Math.max(0.02, crack) : 0;
    u.uKick!.value = f.a.kick;
    u.uCold!.value = prog(t, this.tEnter, this.tEnter + 1.0);
    u.uFlash!.value = hit;
    renderer.setRenderTarget(out);
    renderer.render(this.world, this.cam);

    const L3 = this.lines3;
    L3.clear();
    const jolt = t >= this.tShat ? ease.outExpo(prog(t, this.tShat, this.tShat + 0.5)) : 0;
    drawCorridor(L3, f.a.kick, f.beat);
    drawRings(L3, this.wall.mesh.matrixWorld, t, f.beat, jolt, u.uCold!.value as number);
    this.drawAtoms(L3, t);
    L3.render(renderer, out, this.cam);

    const T = this.text;
    T.clear();
    const c = T.ctx;
    this.ui.draw(c, t, f.beat);
    this.ui.drawReply(c, t, 150, 250);
    if (pose) this.drawTag(c, pose);
    this.ctx.comp.draw(renderer, T.upload(), out);

    return {
      bloomThreshold: 0.95,
      bloomKnee: 0.2,
      bloom: 0.55 + 0.15 * hit,
      vignette: 0.55,
      flash: 0,
      ca: 1 + 3 * hit,
      zoom: 1 + 0.01 * f.a.kick + 0.04 * hit,
    };
  }

  /** Deadpan annotation riding under the 3D word. */
  private drawTag(
    c: CanvasRenderingContext2D,
    pose: { p: P3; scale: number; lift: number; f: number },
  ) {
    const q = this.proj(pose.p.x - 0.75 * pose.scale, pose.p.y - 0.75 * pose.scale, pose.p.z);
    if (!q) return;
    const a = pose.lift * (1 - pose.f);
    if (a < 0.02) return;
    c.save();
    c.font = font(F.mono(400), 14);
    c.fillStyle = rgba("bone", 0.55 * a);
    c.fillText("token 31402 · 0.31", q.x, q.y + 18);
    c.fillStyle = rgba("signal", 0.8 * a);
    c.fillRect(q.x, q.y + 2, 90, 2);
    c.restore();
  }

  /** After the impact: the atoms burst off the glass back down the corridor (drag + gravity). */
  private drawAtoms(L: LineBatch, t: number) {
    const tau = t - this.tShat;
    if (tau < 0) return;
    const k = 1.3,
      g = -0.9;
    const drag = (1 - Math.exp(-k * tau)) / k;
    const vfac = Math.exp(-k * tau);
    const s = LIN.signal,
      b = LIN.bone;
    const fade = 1 - 0.55 * prog(tau, 0.4, 2.6);
    const I = this.imp,
      n = this.nrm,
      r = this.right;
    for (const a of this.atoms) {
      const ca = Math.cos(a.a) * a.t,
        sa = Math.sin(a.a) * a.t;
      // velocity in world: tangential spread in the glass plane + bounce along the normal
      const vx = r.x * ca + n.x * a.n,
        vy = sa + 0.5,
        vz = r.z * ca + n.z * a.n;
      const bx = I.x + r.x * a.x + n.x * (GLYPH_BACK + a.z),
        by = I.y + a.y,
        bz = I.z + r.z * a.x + n.z * (GLYPH_BACK + a.z);
      const x = bx + vx * drag,
        y = by + vy * drag + 0.5 * g * tau * tau,
        z = bz + vz * drag;
      const q = this.proj(x, y, z);
      if (!q) continue;
      // defocus: atoms near the lens get wide and faint
      const w = clamp(0.035 * q.s, 1.2, 26);
      const dof = w > 4 ? 4 / w : 1;
      const st = 0.03;
      const hot = a.hot || tau < 0.12;
      const col = hot ? s : b;
      const br = hot ? (tau < 0.12 ? 2.0 : 1.5) : 0.9;
      L.seg(
        x,
        y,
        z,
        x - vx * vfac * st,
        y - (vy * vfac + g * tau) * st,
        z - vz * vfac * st,
        w,
        col[0] * br,
        col[1] * br,
        col[2] * br,
        clamp(fade * dof * (0.55 + 0.45 * a.spin)),
      );
    }
  }
}
