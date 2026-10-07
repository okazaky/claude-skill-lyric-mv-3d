// m04 helpers: the WINDOW (a 3D black terminal slab: engraved bezel, title bar with 3 dots, dark
// back panel) and the MOON (an engraved bone sphere). Both live in the window's local frame.
import * as THREE from "three";
import { LIN } from "../engine/palette";
import { boxField, boxMaterial, sphereMaterial, type Box } from "./m02-kit";

export const WIN = {
  w: 3.7,
  h: 4.0,
  d: 0.8,
  bar: 0.5,
  side: 0.18,
  moonR: 0.48,
};
/** interior box (window-local): x in [-ix, ix], y in [iy0, iy1] */
export const INNER = {
  ix: WIN.w / 2 - WIN.side,
  iy0: -WIN.h / 2 + WIN.side,
  iy1: WIN.h / 2 - WIN.bar,
  panelZ: -WIN.d / 2 + 0.065,
};

export interface TermWindow {
  group: THREE.Group;
  mat: THREE.RawShaderMaterial;
  dots: THREE.Mesh[];
  moon: THREE.Mesh;
}

export function makeWindow(): TermWindow {
  const { w, h, d, bar, side } = WIN;
  const boxes: Box[] = [
    { x: 0, y: h / 2 - bar / 2, z: 0, w, h: bar, d, kind: 3 },
    { x: -w / 2 + side / 2, y: -bar / 2, z: 0, w: side, h: h - bar, d, kind: 3 },
    { x: w / 2 - side / 2, y: -bar / 2, z: 0, w: side, h: h - bar, d, kind: 3 },
    { x: 0, y: -h / 2 + side / 2, z: 0, w: w - 2 * side, h: side, d, kind: 3 },
    // dark back panel (the terminal's glass)
    { x: 0, y: (INNER.iy0 + INNER.iy1) / 2, z: -d / 2 + 0.03, w: w - 2 * side, h: INNER.iy1 - INNER.iy0, d: 0.06, kind: 2 },
    // a thin rule under the title bar
    { x: 0, y: INNER.iy1 - 0.015, z: d / 2 - 0.05, w: w - 2 * side, h: 0.03, d: 0.1, kind: 1 },
  ];
  const mat = boxMaterial(LIN.bone, 11);
  const slab = new THREE.Mesh(boxField(boxes), mat);
  slab.frustumCulled = false;
  const group = new THREE.Group();
  group.add(slab);
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const col = i === 0 ? LIN.signal : LIN.bone;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), sphereMaterial(col, col, 4));
    m.scale.setScalar(0.085);
    m.position.set(-w / 2 + 0.32 + i * 0.27, h / 2 - bar / 2, d / 2 + 0.02);
    m.frustumCulled = false;
    group.add(m);
    dots.push(m);
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), sphereMaterial(LIN.bone, LIN.bone.map((v) => v * 0.9) as [number, number, number], 10));
  moon.frustumCulled = false;
  group.add(moon);
  return { group, mat, dots, moon };
}
