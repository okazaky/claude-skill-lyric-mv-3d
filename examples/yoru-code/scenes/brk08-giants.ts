// brk08 giants: the big subjects of the open-air interlude (one per two bars).
// - Monoliths: skyscraper-sized extruded engraved words (code / Claude / brackets) lining the flight path;
//   each glyph slams upright from the ground as the camera closes in.
// - Rings: orbit rings around the sun for the final dive (world-space circles far ahead, facing the camera).
import * as THREE from "three";
import { LineBatch } from "../engine/lines";
import { LIN } from "../engine/palette";
import { F } from "../engine/type";
import { clamp, ease, hash } from "../engine/util";
import { MODE } from "./m01-engrave";
import { Word3D } from "./m01-text3d";

const WORDS = ["code", "Claude", "{ }", "code", "</>", "Claude", "code", "( )", "Claude", "code", "01", "Claude", "code", "{ }"];

interface Mono {
  word: Word3D;
  z: number;
  side: number;
}

export class Monoliths {
  scene = new THREE.Scene();
  items: Mono[] = [];

  /** Words alternate sides from z0 forward (towards -z), one every `step` world units. */
  constructor(z0: number, step: number) {
    WORDS.forEach((txt, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const hot = txt === "Claude";
      const em = 6.5 + 2.5 * hash(i, 31);
      const word = new Word3D(txt, txt.length > 3 && !/[{(<0]/.test(txt) ? F.jp(900) : F.mono(500), em, em * 0.28, {
        mode: MODE.EXTRUDE,
        col: "bone",
        sideCol: hot ? "signal" : "ash",
        sideK: hot ? 0.6 : 0.45,
        freq: 22,
        rimK: 0.35,
        fogK: 0.022,
      });
      const z = z0 - i * step;
      const x = side * (word.width / 2 + 3.2 + 2.5 * hash(i, 32));
      word.group.position.set(x, -0.6, z);
      word.group.rotation.y = -side * (0.15 + 0.15 * hash(i, 33));
      this.scene.add(word.group);
      this.items.push({ word, z, side });
    });
  }

  /** Glyphs stand up (hinged at the base) when the camera is within ~55 units, one after another. */
  update(camZ: number) {
    for (const m of this.items) {
      const d = camZ - m.z;
      m.word.group.visible = d > -8 && d < 75;
      m.word.glyphs.forEach((_, i) => {
        const u = (75 - d - i * 2.2) / 16;
        const hot = u > 0 ? 0.8 * clamp(1.6 - u) : 0; // fresh glyph glows signal, cools as it settles
        m.word.stand(i, ease.outBack(clamp(u)), hot);
      });
    }
  }
}

/** Emblem rings around the sun: circles on the plane facing the camera, `dist` ahead along the sun direction.
 * tiltK 1 = scattered (each ring tilted its own way), 0 = perfect concentric circles. crown 0..1 draws 24 radial
 * ticks just outside the outer ring (every 6th long and signal), like a dial. */
export function fillRings(
  lb: LineBatch,
  cam: THREE.Vector3,
  sunDir: THREE.Vector3,
  dist: number,
  radii: number[],
  hot: number,
  tiltK: number,
  crown: number,
) {
  lb.clear();
  const c = cam.clone().addScaledVector(sunDir, dist);
  const ux = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
  const uy = new THREE.Vector3().crossVectors(ux, sunDir).normalize();
  const at = (a: number, r: number, tilt: number, spin: number) =>
    c
      .clone()
      .addScaledVector(ux, Math.cos(a + spin) * r)
      .addScaledVector(uy, Math.sin(a + spin) * r * (1 - Math.abs(tilt)))
      .addScaledVector(sunDir, Math.sin(a + spin) * r * tilt);
  const N = 160;
  radii.forEach((r, k) => {
    if (r <= 0.01) return;
    const isHot = k === 2;
    const col = isHot ? LIN.signal.map((v) => v * (1.2 + hot)) : LIN.bone.map((v) => v * (0.5 + 0.5 * hot));
    const tilt = tiltK * 0.55 * Math.sin(k * 1.7 + 0.6);
    const spin = tiltK * k * 0.9;
    for (let i = 0; i < N; i++) {
      const A = at((i / N) * Math.PI * 2, r, tilt, spin),
        B = at(((i + 1) / N) * Math.PI * 2, r, tilt, spin);
      lb.seg(A.x, A.y, A.z, B.x, B.y, B.z, isHot ? 2.6 : 1.5, col[0]!, col[1]!, col[2]!, 0.9);
    }
  });
  const rOut = radii[radii.length - 1] ?? 0;
  if (crown <= 0.01 || rOut <= 0.01) return;
  for (let i = 0; i < 24; i++) {
    const a = Math.PI / 2 + (i / 24) * Math.PI * 2;
    const major = i % 6 === 0;
    const r0 = rOut * 1.08,
      r1 = rOut * (1.08 + (major ? 0.22 : 0.1) * crown);
    const A = at(a, r0, 0, 0),
      B = at(a, r1, 0, 0);
    const col = major ? LIN.signal.map((v) => v * (1.3 + hot)) : LIN.bone.map((v) => v * 0.7);
    lb.seg(A.x, A.y, A.z, B.x, B.y, B.z, major ? 2.6 : 1.6, col[0]!, col[1]!, col[2]!, 0.9 * Math.min(1, crown));
  }
}
