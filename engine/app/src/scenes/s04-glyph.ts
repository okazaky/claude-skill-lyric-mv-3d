// s04 helpers: 好き as an extruded 3D object (voxelised from F.jp(900) on a regular grid, only the
// exposed faces emitted), shaded as engraving — hatched orange face, darker hatched side walls — and the
// atoms it breaks into on the glass.
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";
import { F, font, layout } from "../engine/type";
import { hash } from "../engine/util";

export const SUKI_H = 1.6; // world height of the glyph em
const PX = 260; // raster size
const STEP = 2; // voxel pitch in raster px
const DEPTH = 0.32; // extrusion depth (world)

export interface Cell {
  x: number; // glyph-local world coords of the voxel centre (front face at z = 0)
  y: number;
}

/** Regular-grid voxel cells of 好き, centred on the glyph's optical centre. */
export function sukiCells(): {
  cells: Cell[];
  size: number;
  occ: Set<string>;
  cols: number;
  rows: number;
} {
  const lay = layout("好き", F.jp(900), PX);
  const pad = Math.ceil(PX * 0.2);
  const W = Math.ceil(lay.width + pad * 2),
    H = Math.ceil(PX * 1.5);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.font = font(F.jp(900), PX);
  c.fillStyle = "#fff";
  c.textBaseline = "alphabetic";
  const base = Math.round(PX * 1.12);
  c.fillText("好き", pad, base);
  const data = c.getImageData(0, 0, W, H).data;
  const wpp = SUKI_H / PX;
  const cx = pad + lay.width / 2,
    cy = base - PX * 0.4;
  const cells: Cell[] = [];
  const occ = new Set<string>();
  const cols = Math.floor(W / STEP),
    rows = Math.floor(H / STEP);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const px = i * STEP + STEP / 2,
        py = j * STEP + STEP / 2;
      if (data[(Math.floor(py) * W + Math.floor(px)) * 4 + 3]! > 110) {
        occ.add(`${i},${j}`);
        cells.push({ x: (px - cx) * wpp, y: -(py - cy) * wpp });
      }
    }
  }
  return { cells, size: STEP * wpp, occ, cols, rows };
}

/** Merged geometry of the exposed voxel faces (front + side walls; the back is never seen). */
export function sukiGeometry(): THREE.BufferGeometry {
  const lay = sukiCells();
  const { size, occ, cols, rows } = lay;
  const pos: number[] = [];
  const nor: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0]!, v[1]!, v[2]!);
      nor.push(n[0]!, n[1]!, n[2]!);
    }
  };
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!occ.has(`${i},${j}`)) continue;
      const cell = lay.cells[k++]!;
      const h = size / 2;
      const x0 = cell.x - h,
        x1 = cell.x + h,
        y0 = cell.y - h,
        y1 = cell.y + h,
        zf = 0,
        zb = -DEPTH;
      quad([x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], [0, 0, 1]);
      if (!occ.has(`${i - 1},${j}`))
        quad([x0, y0, zb], [x0, y0, zf], [x0, y1, zf], [x0, y1, zb], [-1, 0, 0]);
      if (!occ.has(`${i + 1},${j}`))
        quad([x1, y0, zf], [x1, y0, zb], [x1, y1, zb], [x1, y1, zf], [1, 0, 0]);
      if (!occ.has(`${i},${j - 1}`))
        quad([x0, y1, zf], [x1, y1, zf], [x1, y1, zb], [x0, y1, zb], [0, 1, 0]);
      if (!occ.has(`${i},${j + 1}`))
        quad([x0, y0, zb], [x1, y0, zb], [x1, y0, zf], [x0, y0, zf], [0, -1, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
out vec3 vP; out vec3 vN; out float vFront;
void main() {
  vP = position;
  vFront = normal.z;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vP; in vec3 vN; in float vFront;
out vec4 fragColor;
${GLSL_COMMON}
uniform float uHeat;
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
  float lamb = sat(dot(n, L));
  float front = step(0.5, vFront);
  vec3 col;
  if (front > 0.5) {
    // the face: signal plate engraved with diagonal hatch (denser toward the lower right)
    float h = hatch((vP.x + vP.y) * 26.0, 0.25 + 0.3 * sat(0.5 - vP.y * 0.4));
    col = C_SIGNAL * (0.75 + 0.35 * lamb) * (1.0 - 0.55 * h) + heat(0.5) * uHeat * 0.5;
  } else {
    // side walls: dark, hatched along the depth so the extrusion reads
    float h = hatch(vP.z * 60.0, 0.35 + 0.4 * (1.0 - lamb));
    col = C_INK2 + C_SIGNAL * (0.05 + 0.22 * lamb) * (1.0 - 0.6 * h) + C_BONE * 0.04 * lamb;
  }
  fragColor = vec4(col, 1.0);
}`;

export function sukiMesh(): { mesh: THREE.Mesh; mat: THREE.RawShaderMaterial } {
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uHeat: { value: 0 } },
    depthTest: true,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(sukiGeometry(), mat);
  mesh.frustumCulled = false;
  return { mesh, mat };
}

export interface Atom {
  x: number; // glyph-local
  y: number;
  z: number;
  t: number; // tangential speed factor
  n: number; // speed along the wall normal (toward the camera)
  a: number; // direction angle in the wall plane
  hot: number;
  spin: number;
}

/** One atom per voxel (thinned), with deterministic burst parameters. */
export function makeAtoms(): Atom[] {
  const { cells } = sukiCells();
  const out: Atom[] = [];
  cells.forEach((c, i) => {
    if (hash(i, 11) > 0.16) return;
    const r = Math.hypot(c.x, c.y) + 1e-3;
    const toCam = hash(i, 4) < 0.14; // a few fly hard at the lens
    out.push({
      x: c.x,
      y: c.y,
      z: -hash(i, 8) * DEPTH,
      t: 1.0 + 3.2 * hash(i, 1) ** 2,
      n: toCam ? 9 + 7 * hash(i, 9) : 0.4 + 4.5 * hash(i, 4),
      a: Math.atan2(c.y / r, c.x / r) + (hash(i, 2) - 0.5) * 0.9,
      hot: hash(i, 5) < 0.14 ? 1 : 0,
      spin: hash(i, 6),
    });
  });
  return out;
}
