// m03 helper: an engraved laptop (keyboard slab + key grid + hinged screen) built from box fields.
// Keys can be pressed / heated through the material's slot arrays (see m02-kit boxMaterial).
import * as THREE from "three";
import { boxField, type Box } from "./m02-kit";

export const KB = {
  cols: 10,
  rows: 4,
  pitch: 0.29,
  key: 0.235,
  keyH: 0.075,
  baseW: 3.2,
  baseD: 2.05,
  baseH: 0.16,
  scrH: 2.0,
  tilt: -0.3,
};
const ROWS = ["1234567890", "QWERTYUIOP", "ASDFGHJKL;", "ZXCVBNM,./"];

export interface Laptop {
  group: THREE.Group;
  hinge: THREE.Group;
  /** local centre of the top of a key (by legend) */
  keyAt(ch: string): THREE.Vector3;
}

/** slotOf: legend -> slot index for keys that press/heat in this laptop. */
export function makeLaptop(mat: THREE.Material, slotOf: Record<string, number>): Laptop {
  const boxes: Box[] = [];
  const { cols, rows, pitch, key, keyH, baseW, baseD, baseH } = KB;
  boxes.push({ x: 0, y: baseH / 2, z: 0, w: baseW, h: baseH, d: baseD, kind: 0 });
  const kz0 = -baseD / 2 + 0.3;
  const keyPos = new Map<string, THREE.Vector3>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = ROWS[r]![c]!;
      const x = (c - (cols - 1) / 2) * pitch + (r - 1.5) * 0.04;
      const z = kz0 + r * pitch;
      const y = baseH + keyH / 2;
      boxes.push({ x, y, z, w: key, h: keyH, d: key, kind: 1, slot: slotOf[ch] ?? -1 });
      keyPos.set(ch, new THREE.Vector3(x, baseH + keyH, z));
    }
  }
  // space bar + trackpad
  boxes.push({ x: 0, y: baseH + keyH / 2, z: kz0 + rows * pitch, w: pitch * 5, h: keyH, d: key, kind: 1, slot: slotOf[" "] ?? -1 });
  boxes.push({ x: 0, y: baseH + 0.004, z: baseD / 2 - 0.42, w: 1.1, h: 0.008, d: 0.55, kind: 2 });
  const base = new THREE.Mesh(boxField(boxes), mat);
  base.frustumCulled = false;

  const scr: Box[] = [
    { x: 0, y: KB.scrH / 2, z: -0.05, w: baseW, h: KB.scrH, d: 0.1, kind: 3 },
    { x: 0, y: KB.scrH / 2 + 0.03, z: 0.006, w: baseW - 0.26, h: KB.scrH - 0.3, d: 0.02, kind: 2 },
  ];
  const screen = new THREE.Mesh(boxField(scr), mat);
  screen.frustumCulled = false;
  const hinge = new THREE.Group();
  hinge.position.set(0, baseH, -baseD / 2 + 0.05);
  hinge.rotation.x = KB.tilt;
  hinge.add(screen);

  const group = new THREE.Group();
  group.add(base, hinge);
  return {
    group,
    hinge,
    keyAt: (ch: string) => (keyPos.get(ch) ?? new THREE.Vector3()).clone(),
  };
}
