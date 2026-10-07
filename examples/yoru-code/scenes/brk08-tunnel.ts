// brk08 helpers: floating WINDOW slabs (black terminal slabs with an engraved bezel, a hatched title
// bar with 3 dots, code rows on the screen) merged into one geometry, and their engraving shader.
// Vertex motion (cheap, GPU): every slab orbits the tunnel axis (uSpin); on the breakout (uBlast =
// seconds since it) each slab is blown radially outward and tumbles; uOff translates the whole mesh
// (used for the small flock that flies ahead in the open-air shots).
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";
import { LineBatch } from "../engine/lines";
import { LIN } from "../engine/palette";
import { hash, mulberry32 } from "../engine/util";

/** The tunnel hangs high in the sky: terrain is far below when the walls blow away. */
export const AXIS_Y = 14;

export interface Slab {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  pitch: number;
  roll: number;
  id: number;
  hot: number;
}

/** Slabs scattered in a ring around the tunnel axis from z0 down to zEnd. */
export function makeSlabs(z0: number, zEnd: number): Slab[] {
  const rnd = mulberry32(808);
  const out: Slab[] = [];
  let id = 0;
  for (let z = z0; z > zEnd; z -= 0.85) {
    const n = 2 + Math.floor(rnd() * 2.2);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const r = 3.0 + 2.0 * rnd();
      const w = 1.3 + 1.1 * rnd();
      out.push({
        x: Math.cos(a) * r,
        y: AXIS_Y + Math.sin(a) * r * 0.82,
        z: z - rnd() * 0.85,
        w,
        h: w * (0.56 + 0.16 * rnd()),
        d: 0.1 + 0.06 * rnd(),
        yaw: (rnd() - 0.5) * 0.9 - Math.cos(a) * 0.35,
        pitch: (rnd() - 0.5) * 0.5 + Math.sin(a) * 0.25,
        roll: (rnd() - 0.5) * 0.25,
        id: id++,
        hot: rnd() < 0.09 ? 1 : 0,
      });
    }
  }
  return out;
}

/** A loose flock of windows around the origin (local coords; place it with uOff). */
export function makeFlock(n: number): Slab[] {
  const rnd = mulberry32(99);
  return Array.from({ length: n }, (_, i) => {
    const w = 1.2 + 0.9 * rnd();
    return {
      x: (rnd() - 0.5) * 9,
      y: (rnd() - 0.5) * 3.2,
      z: -(rnd() * 14),
      w,
      h: w * 0.62,
      d: 0.12,
      yaw: (rnd() - 0.5) * 0.7,
      pitch: (rnd() - 0.5) * 0.4,
      roll: (rnd() - 0.5) * 0.5,
      id: 1000 + i,
      hot: i % 5 === 2 ? 1 : 0,
    };
  });
}

export function slabGeometry(slabs: Slab[]): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const bp = box.getAttribute("position") as THREE.BufferAttribute;
  const bn = box.getAttribute("normal") as THREE.BufferAttribute;
  const nv = bp.count;
  const N = slabs.length * nv;
  const pos = new Float32Array(N * 3);
  const nor = new Float32Array(N * 3);
  const loc = new Float32Array(N * 3);
  const lnr = new Float32Array(N * 3);
  const cen = new Float32Array(N * 3);
  const dat = new Float32Array(N * 4);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  slabs.forEach((s, i) => {
    e.set(s.pitch, s.yaw, s.roll, "YXZ");
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.w, s.h, s.d));
    for (let k = 0; k < nv; k++) {
      const o = i * nv + k;
      v.set(bp.getX(k), bp.getY(k), bp.getZ(k));
      loc.set([v.x * s.w, v.y * s.h, v.z * s.d], o * 3);
      v.applyMatrix4(m);
      pos.set([v.x, v.y, v.z], o * 3);
      n.set(bn.getX(k), bn.getY(k), bn.getZ(k));
      lnr.set([n.x, n.y, n.z], o * 3);
      n.applyQuaternion(q);
      nor.set([n.x, n.y, n.z], o * 3);
      cen.set([s.x, s.y, s.z], o * 3);
      dat.set([s.w, s.h, s.id, s.hot], o * 4);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("aLoc", new THREE.BufferAttribute(loc, 3));
  g.setAttribute("aLN", new THREE.BufferAttribute(lnr, 3));
  g.setAttribute("aCen", new THREE.BufferAttribute(cen, 3));
  g.setAttribute("aSlab", new THREE.BufferAttribute(dat, 4));
  return g;
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal; in vec3 aLoc; in vec3 aLN; in vec3 aCen; in vec4 aSlab;
uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform float uT, uSpin, uBlast; uniform vec3 uOff, uAxis;
out vec3 vW; out vec3 vN; out vec3 vL; out vec3 vLN; out vec4 vS;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
void main() {
  float h = fract(sin(aSlab.z * 91.7) * 4375.85);
  float h2 = fract(sin(aSlab.z * 37.3) * 2531.17);
  vec3 p = position;
  vec3 n = normal;
  // tumble about the slab's own centre after the breakout
  if (uBlast > 0.0) {
    float ta = uBlast * (2.0 + 4.0 * h2) * (h > 0.5 ? 1.0 : -1.0);
    vec3 lp = p - aCen;
    lp.yz = rot(ta) * lp.yz; n.yz = rot(ta) * n.yz;
    lp.xy = rot(ta * 0.6) * lp.xy; n.xy = rot(ta * 0.6) * n.xy;
    p = aCen + lp;
  }
  // orbit around the tunnel axis
  float ang = uSpin * uT * (0.12 + 0.3 * h) * (h > 0.5 ? 1.0 : -1.0);
  p.xy = rot(ang) * (p.xy - uAxis.xy) + uAxis.xy;
  n.xy = rot(ang) * n.xy;
  // breakout: blown radially outward, fast at first
  if (uBlast > 0.0) {
    vec2 c = rot(ang) * (aCen.xy - uAxis.xy);
    vec2 dir = normalize(c + vec2(1e-3));
    float r = (14.0 + 22.0 * h2) * (1.0 - exp(-uBlast * 1.6));
    p.xy += dir * r;
    p.z += 3.0 * uBlast * (h - 0.5);
  }
  p += uOff;
  vW = p; vN = n; vL = aLoc; vLN = aLN; vS = aSlab;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vW; in vec3 vN; in vec3 vL; in vec3 vLN; in vec4 vS;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 uCam; uniform float uFogStart, uFogLen;
float edgeLine(float e) { return pxLine(e / max(fwidth(e), 1e-5), 0.4, 1.4); }
float hash3(float a, float b, float c) { return fract(sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453); }
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.45, 0.6, 0.66));
  float lam = sat(dot(n, L) * 0.8 + 0.2);
  float w = vS.x, h = vS.y, id = vS.z, hot = vS.w;
  vec3 ln = vLN;
  vec3 col = C_INK;
  if (ln.z > 0.5) {
    vec2 p = vL.xy;
    float e = min(0.5 * w - abs(p.x), 0.5 * h - abs(p.y));
    float bez = 0.07;
    float bar = 0.15;
    float rim = edgeLine(e);
    if (e < bez) {
      float hb = hatch((p.x + p.y) * 70.0, 0.12 + 0.5 * lam);
      col = C_INK2 + C_BONE * (0.28 * hb * (0.4 + 0.6 * lam));
      col += C_BONE * 0.55 * edgeLine(bez - e) * 0.6;
    } else if (p.y > 0.5 * h - bez - bar) {
      float hb = hatch(p.y * 150.0, 0.18 + 0.25 * lam);
      col = C_INK2 + C_BONE * 0.16 * hb;
      vec2 c0 = vec2(-0.5 * w + bez + 0.09, 0.5 * h - bez - 0.5 * bar);
      for (int i = 0; i < 3; i++) {
        vec2 c = c0 + vec2(float(i) * 0.1, 0.0);
        float d = length(p - c) - 0.032;
        float dot_ = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
        vec3 dc = (i == 0 && hot > 0.5) ? C_SIGNAL * 1.6 : C_BONE * 0.7;
        col = mix(col, dc, dot_);
      }
      col += C_BONE * 0.35 * edgeLine(abs(p.y - (0.5 * h - bez - bar)));
    } else {
      col = C_INK + C_BONE * 0.035 * hatch(p.y * 110.0, 0.25);
      float top = 0.5 * h - bez - bar - 0.06;
      float rowH = 0.072;
      float ry = (top - p.y) / rowH;
      float row = floor(ry);
      float fy = fract(ry);
      float x = p.x + 0.5 * w - bez - 0.06;
      float tokW = 0.085;
      float k = floor(x / tokW);
      float fx = fract(x / tokW);
      float indent = floor(hash3(row, id, 1.0) * 3.0);
      float len = indent + 2.0 + floor(hash3(row, id, 2.0) * 9.0);
      float on = step(indent, k) * step(k, len) * step(0.22, hash3(row, k, id)) * step(0.0, ry);
      on *= step(x, w - 2.0 * bez - 0.12) * step(0.0, x);
      float glyph = step(abs(fy - 0.5), 0.16) * step(fx, 0.82);
      float tone = 0.32 + 0.3 * hash3(row, id, 3.0);
      col += C_BONE * tone * on * glyph;
      float cr = floor(hash3(id, 4.0, 5.0) * 6.0);
      float cursor = hot * step(abs(row - cr), 0.0) * step(abs(k - (len + 2.0)), 0.0) * step(abs(fy - 0.5), 0.3);
      col = mix(col, C_SIGNAL * 1.5, cursor * step(0.0, ry));
    }
    col += C_BONE * 0.6 * rim;
  } else if (ln.z < -0.5) {
    float eb = min(0.5 * w - abs(vL.x), 0.5 * h - abs(vL.y));
    col = C_INK2 * 0.8 + C_BONE * 0.18 * engrave(vL.xy, 0.15 + 0.4 * lam, 30.0, 0.6) + C_BONE * 0.4 * edgeLine(eb);
  } else {
    float along = abs(ln.x) > 0.5 ? vL.y : vL.x;
    float hs = hatch(vL.z * 90.0, 0.2 + 0.5 * lam);
    col = C_INK2 + C_BONE * 0.25 * hs;
    float ee = min(0.5 * (abs(ln.x) > 0.5 ? h : w) - abs(along), 0.05 - abs(abs(vL.z) - 0.05));
    col += C_BONE * 0.5 * edgeLine(ee);
  }
  float dist = length(vW - uCam);
  float fog = exp(-max(dist - uFogStart, 0.0) / uFogLen);
  col = mix(C_INK, col, fog);
  // fogged slabs fade out (alpha) so they dissolve into the open sky instead of turning into ink cards
  fragColor = vec4(col * fog, fog);
}`;

export function slabMaterial(): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uFogStart: { value: 5 },
      uFogLen: { value: 20 },
      uT: { value: 0 },
      uSpin: { value: 1 },
      uBlast: { value: 0 },
      uOff: { value: new THREE.Vector3() },
      uAxis: { value: new THREE.Vector3(0, AXIS_Y, 0) },
    },
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/** Static code-stream dashes running along the tunnel (token-like runs with gaps). */
export function fillStreams(lb: LineBatch, z0: number, zEnd: number) {
  lb.clear();
  const rnd = mulberry32(4242);
  const lanes = 48;
  for (let l = 0; l < lanes; l++) {
    const a = (l / lanes) * Math.PI * 2 + rnd() * 0.08;
    const r = 1.9 + 0.8 * rnd();
    const x = Math.cos(a) * r,
      y = AXIS_Y + Math.sin(a) * r * 0.82;
    const hotLane = l % 17 === 7;
    let z = z0 - rnd() * 3;
    while (z > zEnd) {
      const len = 0.25 + 2.2 * rnd() ** 2;
      const gap = 0.3 + 2.8 * rnd();
      const tone = 0.22 + 0.35 * hash(l, Math.floor(z));
      const c = hotLane ? LIN.signal.map((v) => v * 1.4) : LIN.bone.map((v) => v * tone);
      lb.seg(x, y, z, x, y, z - len, hotLane ? 2.0 : 1.3, c[0]!, c[1]!, c[2]!, hotLane ? 0.9 : 0.7);
      z -= len + gap;
    }
  }
}
