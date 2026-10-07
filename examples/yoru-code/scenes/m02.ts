// m02 「ぽつぽつ 点と線」 — dots and lines.
// On each sung character of ぽつぽつ an engraved sphere drops onto the night grid and lands on the
// syllable (squash + an engraved ring spreading on the floor); the header ぽつぽつ prints one character
// per landing. On 点 small engraved dots pop up in the air around them (a 3D constellation), on と / 線
// orange lines connect the nodes edge by edge, and 点と線 is cut in big engraved 3D type above.
// Camera: a fast continuous orbit with a slight crane down. No beat-driven motion.
import * as THREE from "three";
import { Scene, type Frame, type PostOverrides } from "../engine/scene";
import { Layer2D, W } from "../engine/gl";
import { LineBatch } from "../engine/lines";
import { LIN, rgba } from "../engine/palette";
import { F, font, layout, type TextLayout } from "../engine/type";
import type { Line } from "../engine/lyrics";
import { clamp, ease, hash, keys, lerp, prog, pulse, smoothstep } from "../engine/util";
import { GridWorld, Rig, sphereMaterial, syncSphere } from "./m02-kit";
import { makeGlyphWord, type GlyphWord } from "./m02-glyph";

interface Node {
  x: number;
  y: number;
  z: number;
  r: number;
  t0: number; // landing (drops) or pop-in (dots)
  drop: boolean;
  mesh: THREE.Mesh;
}
interface Edge {
  a: number;
  b: number;
  t0: number;
}

const DROP_H = 6.5;
const FALL = 0.3;
const KEY_POS = { y: 2.35, back: 2.6 };

export default class M02 extends Scene {
  rig = new Rig(56);
  world = new GridWorld();
  meshes = new THREE.Scene();
  text3 = new THREE.Scene();
  L3 = new LineBatch(6000, { screen2D: false, depthTest: true, blend: "add" });
  ui = new Layer2D();
  line!: Line;
  nodes: Node[] = [];
  edges: Edge[] = [];
  key!: GlyphWord;
  keyT: [number, number][] = [];
  head!: TextLayout;
  headT: number[] = [];
  tTen = 0;
  tTo = 0;

  override async init() {
    const ly = this.ctx.lyrics;
    this.line = ly.get("ぽつぽつ");
    const w0 = this.line.words[0]!,
      w1 = this.line.words[1]!;
    const s0 = w0.syl ?? [[w0.start, w0.end]];
    const s1 = w1.syl ?? [[w1.start, w1.end]];
    this.headT = s0.map((s) => s[0]);
    this.keyT = s1.map((s) => [s[0], s[1]]);
    this.tTen = s1[0]![0];
    this.tTo = s1[Math.min(1, s1.length - 1)]![0];

    // four drops (one per sung character), placed around the plate's centre
    const dropPos: [number, number][] = [
      [-1.5, 0.9],
      [1.3, 1.5],
      [-0.6, -1.3],
      [1.7, -0.7],
    ];
    dropPos.forEach(([x, z], i) => {
      const r = 0.5;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), sphereMaterial(LIN.bone, LIN.bone.map((v) => v * 0.9) as [number, number, number], 8));
      this.meshes.add(mesh);
      this.nodes.push({ x, y: r, z, r, t0: this.headT[Math.min(i, this.headT.length - 1)]!, drop: true, mesh });
    });
    // small dots floating in the air: the rest of the constellation (pop in on 点)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4 * hash(i, 3);
      const rad = 1.6 + 1.6 * hash(i, 7);
      const x = Math.cos(a) * rad,
        z = Math.sin(a) * rad * 0.8 - 0.2;
      const y = 0.5 + 2.0 * hash(i, 11);
      const r = 0.12 + 0.08 * hash(i, 5);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), sphereMaterial(LIN.bone, LIN.bone, 5));
      this.meshes.add(mesh);
      this.nodes.push({ x, y, z, r, t0: this.tTen + 0.025 * i, drop: false, mesh });
    }
    // edges: each node to its two nearest neighbours (deduplicated), drawn outward from node 0
    const seen = new Set<string>();
    const n = this.nodes;
    const d = (i: number, j: number) => Math.hypot(n[i]!.x - n[j]!.x, n[i]!.y - n[j]!.y, n[i]!.z - n[j]!.z);
    for (let i = 0; i < n.length; i++) {
      const near = n
        .map((_, j) => j)
        .filter((j) => j !== i)
        .sort((a, b) => d(i, a) - d(i, b))
        .slice(0, 2);
      for (const j of near) {
        const k = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(k)) continue;
        seen.add(k);
        this.edges.push({ a: i, b: j, t0: 0 });
      }
    }
    const span = Math.max(0.5, this.keyT[this.keyT.length - 1]![0] + 0.55 - this.tTo);
    const order = this.edges.map((e, i) => ({ i, k: Math.hypot(n[e.a]!.x + n[e.b]!.x, n[e.a]!.z + n[e.b]!.z) }));
    order.sort((a, b) => a.k - b.k);
    order.forEach((o, rank) => (this.edges[o.i]!.t0 = this.tTo + (rank / order.length) * span));

    // key word 点と線 in engraved 3D type (線 in signal)
    this.key = makeGlyphWord(w1.w, F.jp(900), 1.5, LIN.bone, 30);
    this.key.glyphs.forEach((g, i) => {
      if (w1.w[i] === "線") g.setCol(LIN.signal, 1.15);
    });
    this.text3.add(this.key.group);
    this.head = layout(w0.w, F.jp(900), 120);
  }

  private camAt(t: number) {
    const T0 = this.ctx.start,
      T1 = this.ctx.end;
    const a = keys(t, [
      [T0, -0.95],
      [T1, 0.55, ease.outQuad],
    ]);
    const R = keys(t, [
      [T0, 9.6],
      [T1, 8.6, ease.inOutQuad],
    ]);
    const h = keys(t, [
      [T0, 7.4],
      [T1, 5.2, ease.inOutQuad],
    ]);
    this.rig.look(Math.sin(a) * R, h, Math.cos(a) * R, 0, 1.25, -0.35, 0.02 * Math.sin(a), 56);
    return a;
  }

  private nodePos(nd: Node, t: number) {
    if (!nd.drop) {
      const s = ease.outBack(prog(t, nd.t0, nd.t0 + 0.22));
      return { x: nd.x, y: nd.y + 0.05 * Math.sin(t * 2 + nd.x), z: nd.z, sx: s, sy: s, vis: s > 0.001 };
    }
    const dt = t - nd.t0;
    if (dt < -FALL) return { x: nd.x, y: nd.r + DROP_H, z: nd.z, sx: 1, sy: 1, vis: false };
    let y = nd.r;
    let sx = 1,
      sy = 1;
    if (dt < 0) {
      const k = -dt / FALL;
      y = nd.r + DROP_H * k * k;
      sy = 1 + 0.18 * (1 - k);
      sx = 1 / Math.sqrt(sy);
    } else {
      // one small rebound, then rest; squash at contact
      const b = 0.22;
      y = nd.r + (dt < b ? 0.42 * Math.sin((Math.PI * dt) / b) : 0);
      const sq = pulse(t, nd.t0, 0.05) * 0.32 + (dt > b ? pulse(t, nd.t0 + b, 0.04) * 0.12 : 0);
      sy = 1 - sq;
      sx = 1 + sq * 0.6;
    }
    return { x: nd.x, y: y - nd.r * (1 - sy), z: nd.z, sx, sy, vis: true };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const a = this.camAt(t);
    const cam = this.rig.cam;
    this.world.render(renderer, out, cam, { focus: [0, 0, 1], fog: 0.045, grid: 1 });

    // ---- nodes
    const lit = smoothstep(this.tTen - 0.05, this.tTen + 0.1, t);
    const P: { x: number; y: number; z: number; vis: boolean }[] = [];
    for (const nd of this.nodes) {
      const p = this.nodePos(nd, t);
      nd.mesh.visible = p.vis;
      nd.mesh.position.set(p.x, p.y, p.z);
      nd.mesh.scale.set(nd.r * p.sx, nd.r * p.sy, nd.r * p.sx);
      syncSphere(nd.mesh, cam);
      const u = (nd.mesh.material as THREE.RawShaderMaterial).uniforms;
      u.uGlow!.value = nd.drop ? 0.5 * pulse(t, nd.t0, 0.1) + 0.25 * lit * pulse(t, this.tTen, 0.2) : 0;
      P.push({ x: p.x, y: p.y, z: p.z, vis: p.vis });
    }
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.meshes, cam);

    // ---- landing rings on the floor + constellation lines
    const lb = this.L3;
    lb.clear();
    const bone = LIN.bone,
      sig = LIN.signal;
    for (const nd of this.nodes) {
      if (!nd.drop) continue;
      const k = prog(t, nd.t0, nd.t0 + 0.75);
      if (k <= 0 || k >= 1) continue;
      const rr = nd.r * 1.05 + 1.5 * ease.outCubic(k);
      const al = (1 - k) * 0.9;
      const N = 56;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2,
          a1 = ((i + 1) / N) * Math.PI * 2;
        lb.seg(nd.x + Math.cos(a0) * rr, 0.01, nd.z + Math.sin(a0) * rr, nd.x + Math.cos(a1) * rr, 0.01, nd.z + Math.sin(a1) * rr, 1.6, bone[0], bone[1], bone[2], al);
      }
    }
    for (const e of this.edges) {
      const k = ease.outCubic(prog(t, e.t0, e.t0 + 0.28));
      if (k <= 0) continue;
      const A = P[e.a]!,
        B = P[e.b]!;
      if (!A.vis || !B.vis) continue;
      const bx = lerp(A.x, B.x, k),
        by = lerp(A.y, B.y, k),
        bz = lerp(A.z, B.z, k);
      const I = 1.5 + 1.5 * pulse(t, e.t0 + 0.28, 0.12);
      lb.seg(A.x, A.y, A.z, bx, by, bz, 2.4, sig[0] * I, sig[1] * I, sig[2] * I, 1);
      if (k < 1) lb.seg(bx, by, bz, bx, by, bz, 7, sig[0] * 3, sig[1] * 3, sig[2] * 3, 1);
    }
    lb.render(renderer, out, cam);

    // ---- key word: engraved 3D type, turned to follow the orbit (parallax, still readable)
    // stays centred behind the constellation, turned slightly off the camera axis (perspective)
    this.key.group.position.set(-Math.sin(a) * KEY_POS.back, KEY_POS.y, -Math.cos(a) * KEY_POS.back);
    this.key.group.rotation.y = a - 0.16;
    this.key.glyphs.forEach((g, i) => {
      const [s0] = this.keyT[i] ?? [this.tTen, this.tTen];
      g.u.reveal!.value = ease.outCubic(prog(t, s0 - 0.02, s0 + 0.2));
      g.u.glow!.value = 0.5 * pulse(t, s0, 0.12);
      g.u.ghost!.value = 0.03 * smoothstep(s0 - 0.35, s0, t) * (1 - smoothstep(s0, s0 + 0.3, t));
      const pop = 1 + 0.08 * pulse(t, s0, 0.08);
      g.mesh.scale.set(pop, pop, 1);
    });
    this.text3.updateMatrixWorld(true);
    renderer.setRenderTarget(out);
    renderer.render(this.text3, cam);

    // ---- header ぽつぽつ: one character per landing
    const ui = this.ui;
    ui.clear();
    this.drawHeader(ui.ctx, t);
    this.ctx.comp.draw(renderer, ui.upload(), out);

    return { bloom: 0.45, bloomThreshold: 1.0, vignette: 0.5, grain: 0.05, ca: 0.5 };
  }

  private drawHeader(c: CanvasRenderingContext2D, t: number) {
    const L = this.head;
    const size = L.size;
    const x0 = W / 2 - L.width / 2;
    const y = 330;
    c.save();
    c.font = font(F.jp(900), size);
    c.textBaseline = "alphabetic";
    L.glyphs.forEach((g, i) => {
      const t0 = this.headT[i] ?? this.headT[this.headT.length - 1]!;
      const k = prog(t, t0 - 0.12, t0 + 0.04);
      if (k <= 0) {
        c.fillStyle = rgba("graphite", 0.28);
        c.fillText(g.ch, x0 + g.x, y);
        return;
      }
      const dy = -40 * (1 - ease.outCubic(k));
      const after = clamp((t - this.tTen) / 0.4);
      c.fillStyle = rgba("bone", lerp(1, 0.78, after));
      c.fillText(g.ch, x0 + g.x, y + dy);
    });
    // a thin rule and a mono counter under the header (dots so far)
    const nd = this.headT.filter((s) => t >= s).length + (t >= this.tTen ? 9 : 0);
    c.fillStyle = rgba("graphite", 0.9);
    c.fillRect(W / 2 - 60, y + 34, 120, 1.5);
    c.font = font(F.mono(400), 22);
    c.fillStyle = rgba("ash", 0.9);
    const s = `dots ${String(nd).padStart(2, "0")}  ·  lines ${String(this.edges.filter((e) => t >= e.t0 + 0.28).length).padStart(2, "0")}`;
    c.textAlign = "center";
    c.fillText(s, W / 2, y + 76);
    c.restore();
  }
}
