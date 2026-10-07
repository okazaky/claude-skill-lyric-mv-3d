// s08 「トークンの海に 溶けていく」 — the token ocean. After the wipe, the camera drops to the surface
// of an engraved sea whose swell is driven by the bass and whose rings are struck by every kick;
// thousands of glyph tokens ride the swell. 私 (forgotten in s07) stands in the water and sinks,
// coming apart into points that spread over the surface. The line hangs above the horizon; each
// character of 溶けていく sinks into the sea after it is sung and dissolves where the water takes it.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { FSPass, Layer2D, W } from "../engine/gl";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, textPoints } from "../engine/type";
import type { Line, Word } from "../engine/lyrics";
import { clamp, ease, frameIdx, hash, lerp, noise1, prog, pulse, smoothstep } from "../engine/util";
import { beatsIn } from "./stack-kit";
import { GlyphPlane, lin, type RGB } from "./s08-kit";
import { Me, Sea, Tokens } from "./s08-sea";

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mix3 = (a: RGB, b: RGB, k: number): RGB => [
  lerp(a[0], b[0], k),
  lerp(a[1], b[1], k),
  lerp(a[2], b[2], k),
];

interface Ch {
  g: GlyphPlane;
  me?: Me;
  t0: number;
  x: number;
  y: number;
}

export default class S08 extends Scene {
  cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 400);
  world = new THREE.Scene();
  fxScene = new THREE.Scene();
  textScene = new THREE.Scene();
  rig = new THREE.Group();
  hud = new Layer2D();
  shared: Record<string, THREE.IUniform> = {
    uT: { value: 0 },
    uAmp: { value: 1 },
    uKick: { value: new THREE.Vector4(-99, -99, -99, -99) },
    uC: { value: new THREE.Vector2(5, -10) },
  };
  sea!: Sea;
  tokens!: Tokens;
  me!: Me;
  sky = new FSPass(
    /* glsl */ `
    uniform float hy; uniform float t;
    void main() {
      float dy = vUv.y - hy;
      vec3 c = C_INK + C_INK2 * 0.5 * exp(-max(dy, 0.0) * 5.0);
      // engraved haze over the horizon: fine horizontal lines, denser near the water
      float u = dy * 260.0;
      c += C_BONE * 0.08 * hatch(u, 0.45) * exp(-max(dy, 0.0) * 22.0) * step(0.0, dy); // only a thin band over the horizon
      c += C_BONE * 0.05 * exp(-abs(dy) * 60.0);
      fragColor = vec4(c, 1.0);
    }`,
    { hy: { value: 0.6 }, t: { value: 0 } },
  );

  T0 = 0;
  T1 = 0;
  L!: Line;
  w1!: Word;
  w2!: Word;
  beats: number[] = [];
  kicks: number[] = [];
  tDb = 0;
  line1: Ch[] = [];
  line2: Ch[] = [];
  meO = v3(5.2, 0, -12);
  z0 = 6; // camera z at the scene start

  override async init() {
    const { lyrics, audio } = this.ctx;
    this.T0 = this.ctx.start;
    this.T1 = this.ctx.end;
    this.L = lyrics.get("トークンの海に");
    [this.w1, this.w2] = this.L.words as [Word, Word];
    for (const w of [this.w1, this.w2])
      if (!w.syl || w.syl.length !== Array.from(w.w).length)
        throw new Error(`s08: syl/char mismatch in ${w.w}`);
    this.beats = beatsIn(audio, this.T0 - 1e-3, this.T1);
    this.kicks = beatsIn(audio, this.T0 - 3, this.T1);
    this.tDb =
      audio.downbeats.find((d) => d > this.T0 + 0.1 && d < this.T1) ?? this.beats[2] ?? this.T0;
    (this.shared.uC!.value as THREE.Vector2).set(this.meO.x, this.meO.z);

    const bone = [...LIN.bone],
      sig = [...LIN.signal];
    this.sea = new Sea(this.shared);
    this.tokens = new Tokens(this.shared, bone, sig);
    this.world.add(this.sea.mesh);
    this.fxScene.add(this.tokens.points);

    // 私: ~4.6 world units tall, origin at the bottom centre
    this.me = new Me(this.shared, this.glyphCloud("私", 4.6, 3), bone, sig);
    this.me.mat.uniforms.uDot!.value = 3.0;
    this.fxScene.add(this.me.points);

    const fam = F.jp(900);
    this.line1 = this.setLine(this.w1, fam, 1.25, 1.8, false);
    this.line2 = this.setLine(this.w2, fam, 1.25, 0.0, true);
    this.textScene.add(this.rig);
  }

  /** Ink points of a glyph in world units, origin at the bottom centre, y up. */
  private glyphCloud(ch: string, height: number, step: number) {
    const pts = textPoints(ch, F.jp(900), 420, step, 7);
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    const s = height / (y1 - y0);
    return pts.map((p) => ({ x: (p.x - (x0 + x1) / 2) * s, y: (y1 - p.y) * s }));
  }

  /** Per-character planes, centred on the line, baseline at `y` (rig space). */
  private setLine(w: Word, fam: string, em: number, y: number, sinks: boolean): Ch[] {
    const lay = layout(w.w, fam, 100);
    const total = (lay.width / 100) * em;
    return lay.glyphs.map((gl, i) => {
      const g = new GlyphPlane(gl.ch, fam, 220, em);
      const sLog = em / 220;
      const x = (gl.x / 100) * em - total / 2 + g.cx * sLog;
      const yy = y + g.cy * sLog;
      g.mesh.position.set(x, yy, 0);
      this.rig.add(g.mesh);
      let me: Me | undefined;
      if (sinks) {
        // the character's own ink, shown only where it is under water: it spreads over the surface
        const pts = g.points(3).map((p) => ({ x: p.x, y: p.y + g.h / 2 }));
        me = new Me(this.shared, pts, [...LIN.bone], [...LIN.signal]);
        me.mat.uniforms.uOnlyWet!.value = 1;
        me.mat.uniforms.uDot!.value = 2.4;
        this.fxScene.add(me.points);
      }
      return { g, me, t0: w.syl![i]![0], x, y: yy };
    });
  }

  // ------------------------------------------------------------ camera: drops to the water, skims forward
  private camState(t: number) {
    const lt = t - this.T0;
    const drop = ease.outExpo(clamp(lt / 0.55));
    const z = this.z0 - 2.1 * lt;
    let y = lerp(4.2, 1.15, drop) + 0.12 * Math.sin(t * 2.3);
    for (const b of this.beats) y -= 0.16 * pulse(t, b, 0.09) * drop; // the kick pushes the camera into the swell
    const x = 0.3 * Math.sin(lt * 0.9) + lerp(-1.5, 0, drop);
    const pos = v3(x, y, z);
    const tgt = v3(x * 0.4 + 0.6, lerp(-1.2, 0.85, drop), z - 20);
    const roll = lerp(-0.18, 0, drop) + 0.025 * Math.sin(t * 1.9 + 0.7);
    return { pos, tgt, roll, fov: lerp(50, 40, drop) };
  }

  // ------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const kick = f.a.kick;
    const cs = this.camState(t);
    const jit = 0.04 * kick;
    cs.pos.x += (hash(frameIdx(t), 1) - 0.5) * jit;
    cs.pos.y += (hash(frameIdx(t), 2) - 0.5) * jit;
    const cam = this.cam;
    cam.fov = cs.fov;
    cam.position.copy(cs.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(cs.tgt);
    cam.rotateZ(cs.roll);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // shared wave state
    const u = this.shared;
    u.uT!.value = t;
    u.uAmp!.value = 0.75 + 0.7 * f.a.bass + 0.25 * kick;
    const past = this.kicks.filter((k) => k <= t + 1e-4).slice(-4);
    while (past.length < 4) past.unshift(-99);
    (u.uKick!.value as THREE.Vector4).set(past[0]!, past[1]!, past[2]!, past[3]!);
    (this.sea.mat.uniforms.uCam!.value as THREE.Vector3).copy(cam.position);
    this.tokens.mat.uniforms.uTick!.value = Math.floor(frameIdx(t) / 4);

    // sky with the horizon where the camera sees it
    const hp = v3(cam.position.x, 0, cam.position.z - 300).project(cam);
    this.sky.u.hy!.value = hp.y * 0.5 + 0.5;
    this.sky.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.world, cam);

    this.updateMe(t, kick);
    this.updateText(t, cs.pos);
    renderer.render(this.fxScene, cam);
    renderer.render(this.textScene, cam);

    this.drawHud(t);
    this.ctx.comp.draw(renderer, this.hud.upload(), out);

    const shk = 6 * kick + 10 * pulse(t, this.tDb, 0.06);
    return {
      bloom: 0.55,
      ca: 1.1 + 1.5 * pulse(t, this.tDb, 0.1),
      vignette: 0.5,
      grain: 0.06,
      exposure: 1 + 0.12 * pulse(t, this.tDb, 0.12),
      shake: [noise1(t * 60, 3) * shk, noise1(t * 60, 4) * shk],
      zoom: 1 + 0.015 * kick,
    };
  }

  private updateMe(t: number, kick: number) {
    const p = prog(t, this.T0, this.T1);
    const m = this.me.mat.uniforms;
    (m.uO!.value as THREE.Vector3).copy(this.meO);
    m.uSink!.value = lerp(-0.4, -5.2, Math.pow(p, 2.2)) - 0.25 * kick;
    m.uFade!.value = 1;
  }

  private updateText(t: number, camPos: THREE.Vector3) {
    // the line hangs over the water a fixed distance ahead (world-axis aligned: the planes face the camera)
    this.rig.position.set(camPos.x * 0.6 - 2.0, 1.75, camPos.z - 14);
    let beatK = 0;
    for (const b of this.beats) beatK = Math.max(beatK, pulse(t, b, 0.08));
    const pre2 = smoothstep(this.w2.start - 0.45, this.w2.start - 0.1, t);
    for (const c of this.line1) {
      const lit = t >= c.t0;
      const k = lit ? ease.outExpo(clamp((t - c.t0) / 0.25)) : 0;
      const hot = lit ? 1 - smoothstep(c.t0 + 0.06, c.t0 + 0.35, t) : 0;
      c.g.mesh.position.set(c.x, c.y + (lit ? 0.5 * (1 - k) : 0), lit ? 1.2 * (1 - k) : 0);
      c.g.mesh.scale.setScalar((lit ? lerp(1.3, 1, k) : 1) * (1 + 0.03 * beatK));
      const isSea = c.g.text === "海";
      const col = lit
        ? isSea
          ? lin("signal", 1.3 + 1.2 * hot)
          : mix3(lin("bone", 0.9), lin("signal", 1.7), hot)
        : lin("bone", 0.9);
      c.g.set({ col, opacity: lit ? 1 : 0.24 * smoothstep(this.T0, this.T0 + 0.2, t) });
    }
    const wp = new THREE.Vector3();
    for (let i = 0; i < this.line2.length; i++) {
      const c = this.line2[i]!;
      const lit = t >= c.t0;
      const k = lit ? ease.outExpo(clamp((t - c.t0) / 0.22)) : 0;
      // after it is sung, the character sinks into the sea
      const s = Math.max(0, t - (c.t0 + 0.3));
      const sink = 2.2 * Math.pow(s, 1.6); // slow enough that the whole line is lit at く
      c.g.mesh.position.set(c.x, c.y - sink + (lit ? 0.4 * (1 - k) : 0), lit ? 1.0 * (1 - k) : 0);
      c.g.mesh.scale.setScalar((lit ? lerp(1.3, 1, k) : 1) * (1 + 0.03 * beatK));
      c.g.mesh.updateMatrixWorld(true);
      c.g.mesh.getWorldPosition(wp);
      // the water line (mean sea level, y = 0) eats the glyph from the bottom
      const bottom = wp.y - c.g.h / 2;
      const dis = clamp(-(bottom - 0.15) / (c.g.h + 0.3));
      const col = lit
        ? mix3(
            lin("bone", 0.9),
            lin("signal", 1.5),
            smoothstep(0.0, 0.3, dis) + (1 - smoothstep(c.t0 + 0.05, c.t0 + 0.3, t)),
          )
        : lin("bone", 0.9);
      c.g.set({
        col: mix3(col, lin("signal", 1.5), 0),
        opacity: lit ? 1 : 0.24 * pre2,
        dis,
        disDir: 1,
        seed: 11 + i,
      });
      if (c.me) {
        const mu = c.me.mat.uniforms;
        (mu.uO!.value as THREE.Vector3).set(wp.x, wp.y - c.g.h / 2, wp.z);
        mu.uSink!.value = 0;
        mu.uFade!.value = lit ? 1 : 0;
      }
    }
  }

  // ------------------------------------------------------------ HUD
  private drawHud(t: number) {
    const L = this.hud;
    L.clear();
    const c = L.ctx;
    const p = prog(t, this.T0, this.T1);
    const n = Math.round(lerp(0, 200000, ease.inCubic(p)));
    c.textAlign = "right";
    c.font = font(F.mono(500), 13);
    c.letterSpacing = "3px";
    c.fillStyle = rgba("bone", 0.55);
    c.fillText("TOKENIZER · BPE", W - 104, 104);
    c.fillText("CONTEXT", W - 104, 136);
    c.letterSpacing = "0px";
    c.font = font(F.mono(400), 34);
    c.fillStyle = rgba("bone", 0.9);
    c.fillText(`${n.toLocaleString("en-US")} tok`, W - 104, 178);
    c.fillStyle = rgba("bone", 0.18);
    c.fillRect(W - 364, 194, 260, 1);
    c.font = font(F.jp(400), 17);
    c.fillStyle = rgba("bone", 0.6);
    c.fillText("トークン化しています", W - 104, 222);
    // 私 → token ids, the last one flickers as it is being split
    c.font = font(F.mono(400), 15);
    const ids = [79, 12043, 1903, 46229];
    const shown = Math.min(ids.length, 1 + Math.floor(p * 5));
    const flick = hash(frameIdx(t), 9) > 0.5 ? 1 : 0.5;
    c.fillStyle = rgba("signal", 0.95 * flick);
    c.fillText(`[${ids.slice(0, shown).join(", ")}]`, W - 104, 252);
    c.textAlign = "left";
  }
}
