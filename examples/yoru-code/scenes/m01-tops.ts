// TOPS — the recurring motif of 「夜をほどくコード」 (m01, m06): two engraved spinning tops on a lathe
// profile. Top A ("くるくる") is bone; top B ("くろくろ") has an ink-black body (dim graphite lines)
// with a C_SIGNAL rim band at its widest ring. Helical burin lines make the spin readable.
// The pivot is the tip (y = 0); height 1 world unit before `scale`.
import * as THREE from 'three';
import { engraveMaterial, MODE } from './m01-engrave';
import { clamp, ease, prog } from '../engine/util';

/** Lathe profile (radius, y), tip to knob. */
const PROFILE: [number, number][] = [
  [0.0, 0.0], [0.035, 0.015], [0.12, 0.085], [0.26, 0.2], [0.4, 0.32], [0.49, 0.4], [0.505, 0.44],
  [0.5, 0.48], [0.46, 0.525], [0.37, 0.565], [0.22, 0.6], [0.1, 0.62], [0.07, 0.65], [0.068, 0.9],
  [0.09, 0.93], [0.092, 0.965], [0.07, 0.99], [0.0, 1.0],
];
/** Object-y range of top B's orange rim band. */
export const TOP_BAND: [number, number] = [0.395, 0.5];

export type TopKind = 'A' | 'B';

export class Top {
  /** Positioned/tilted pivot (tip). */
  group = new THREE.Group();
  /** Spins about local y inside the group. */
  body: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  private axis = new THREE.Vector3();
  constructor(public kind: TopKind, public scale = 1) {
    const geo = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 96);
    this.mat = kind === 'A'
      ? engraveMaterial({ mode: MODE.LATHE, col: 'bone', colScale: 0.95, freq: 58, helix: 5, lineLo: 0.1, lineHi: 0.85, rimK: 0.45 })
      : engraveMaterial({ mode: MODE.LATHE, col: 'ash', colScale: 0.3, freq: 58, helix: -5, lineLo: 0.05, lineHi: 0.5, rimK: 0.6, bandCol: 'signal', band: TOP_BAND });
    this.body = new THREE.Mesh(geo, this.mat);
    this.group.add(this.body);
    this.group.scale.setScalar(scale);
  }

  /**
   * Place the top: tip at (x, y, z), spin angle (rad), tilt (rad) leaning toward precession angle `prec`.
   */
  pose(x: number, y: number, z: number, spin: number, tilt: number, prec: number) {
    this.group.position.set(x, y, z);
    // lean: rotate about the horizontal axis perpendicular to the lean direction
    this.axis.set(Math.sin(prec), 0, -Math.cos(prec));
    this.group.quaternion.setFromAxisAngle(this.axis, tilt);
    this.body.rotation.set(0, spin, 0);
  }

  /** World position of the top's crown centre (for labels/rings). */
  crown(out = new THREE.Vector3()) {
    return out.set(0, 0.6, 0).applyMatrix4(this.group.matrixWorld);
  }
}

/**
 * Drop-and-spin motion shared by m01/m06: the top falls from `h` above the floor, lands at `tLand`
 * with one small hop, wobbles hard and settles to a steady lean. Returns the vertical offset, the
 * tilt and an extra precession speed factor.
 */
export function dropMotion(t: number, tLand: number, h = 4) {
  const fall = 0.32;
  if (t < tLand - fall) return { y: h, tilt: 0.25, live: 0 };
  if (t < tLand) {
    const k = prog(t, tLand - fall, tLand, ease.inQuad);
    return { y: h * (1 - k), tilt: 0.25 * (1 - k) + 0.05, live: 1 };
  }
  const a = t - tLand;
  // two hops: a big one, then a small one
  const hop = a < 0.3 ? 0.5 * Math.sin((a / 0.3) * Math.PI) : a < 0.45 ? 0.12 * Math.sin(((a - 0.3) / 0.15) * Math.PI) : 0;
  const wob = 0.075 + 0.26 * Math.exp(-a * 3.2);
  return { y: hop, tilt: clamp(wob, 0, 0.45), live: 1 };
}

/** Piecewise path of a travelling top on the floor: keys [t, x, z]; eased in-out between keys. */
export function pathAt(t: number, ks: [number, number, number][]): { x: number; z: number } {
  if (t <= ks[0]![0]) return { x: ks[0]![1], z: ks[0]![2] };
  for (let i = 1; i < ks.length; i++) {
    const b = ks[i]!;
    if (t <= b[0]) {
      const a = ks[i - 1]!;
      const u = ease.inOutQuad((t - a[0]) / Math.max(1e-4, b[0] - a[0]));
      return { x: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u };
    }
  }
  const l = ks[ks.length - 1]!;
  return { x: l[1], z: l[2] };
}

/** Extra wobble from a collision at tHit (0 before). */
export function hitWobble(t: number, tHit: number) {
  return t < tHit ? 0 : 0.3 * Math.exp(-(t - tHit) * 4);
}
