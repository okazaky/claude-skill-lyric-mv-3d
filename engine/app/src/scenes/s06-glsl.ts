// s06 shader: an endless library corridor (two walls of shelves, books from per-slot hashes),
// raymarched and shaded as engraving. One book (right wall, level 1, slot IB) is the phantom:
// pulled out, lit from inside in signal orange, and finally sliced into hairlines that fly apart.
import { GLSL_CAM } from "./s05-cam";

export const HW = 2.2; // corridor half width (book fronts sit around x = HW)
export const LV = 1.1; // shelf pitch
export const SLOT = 0.16; // book slot width
export const IB = 20; // phantom book slot index (right wall)
export const KB = 1; // phantom book shelf level
export const BOOK_H = 0.8,
  BOOK_D = 0.5,
  PULL = 0.16;
/** Centre of the phantom book (world). */
export const bookCentre = (): [number, number, number] => [
  HW + 0.55 - BOOK_D / 2 - PULL,
  (IB + 0.5) * SLOT,
  KB * LV + 0.035 + BOOK_H / 2,
];

export const FRAG_LIB = /* glsl */ `
${GLSL_CAM}
uniform float glow, dissolve, kick, fogK;
uniform vec3 keyDir;
const float HW = ${HW.toFixed(3)}, LV = ${LV.toFixed(3)}, SLOT = ${SLOT.toFixed(3)};
const float IB = ${IB.toFixed(1)}, KB = ${KB.toFixed(1)};
const float BH = ${BOOK_H.toFixed(3)}, BD = ${BOOK_D.toFixed(3)}, PULL = ${PULL.toFixed(3)};
const float BACK = HW + 0.55;

// id: 0 floor, 1 back panel, 2 boards/uprights, 3 books, 5 phantom book, 6 ceiling
vec2 map(vec3 p) {
  float side = p.x < 0.0 ? -1.0 : 1.0;
  vec3 q = vec3(abs(p.x), p.y, p.z);
  vec2 res = vec2(p.z + 0.05, 0.0);
  float ceilD = 7.4 - p.z;
  if (ceilD < res.x) res = vec2(ceilD, 6.0);
  float back = BACK - q.x;
  if (back < res.x) res = vec2(back, 1.0);
  // boards
  float k = clamp(floor(q.z / LV + 0.5), 0.0, 6.0);
  float bd = sdBox(vec2(q.x - (BACK - 0.3), q.z - k * LV), vec2(0.3, 0.035));
  // uprights every 3.2
  float uy = mod(q.y + 1.6, 3.2) - 1.6;
  float up = sdBox(vec2(q.x - (BACK - 0.31), uy), vec2(0.31, 0.05));
  up = max(up, q.z - 6.7);
  float st = min(bd, up);
  if (st < res.x) res = vec2(st, 2.0);
  // books (domain repetition per slot and level)
  float kb = clamp(floor(q.z / LV), 0.0, 5.0);
  float i = floor(q.y / SLOT);
  vec3 h = hash33(vec3(i, kb, side * 3.7 + 11.0));
  float bh = 0.5 + 0.42 * h.x;
  float db = 0.38 + 0.14 * h.y;
  float lean = 0.0;
  bool phantom = side > 0.0 && abs(i - IB) < 0.5 && abs(kb - KB) < 0.5;
  float pull = 0.0;
  if (phantom) { bh = BH; db = BD; pull = PULL; }
  vec3 c = vec3(BACK - db * 0.5 - pull, (i + 0.5) * SLOT, kb * LV + 0.035 + bh * 0.5);
  vec3 lq = q - c;
  float bw = 0.066 - 0.012 * h.z;
  float book = sdBox3(lq, vec3(db * 0.5, bw, bh * 0.5)) - 0.004;
  if (h.z < 0.05 && !phantom) book = 1e3; // a few gaps
  if (phantom && dissolve > 0.0) {
    // sliced into hairlines that drift out into the corridor, each at its own speed
    float n = 110.0;
    float sl = floor((lq.z / BH + 0.5) * n);
    float hs = hash11(sl * 1.37 + 4.0);
    float out_ = dissolve * dissolve * (0.6 + 2.6 * hs);
    vec3 lq2 = lq + vec3(out_, -out_ * 0.35 * (hs - 0.5), 0.0);
    // each slice thins to a hairline: narrower in depth and width as it flies
    float sh = 1.0 - 0.75 * smoothstep(0.0, 0.6, dissolve) * (0.5 + 0.5 * hs);
    float b2 = sdBox3(lq2, vec3(db * 0.5 * sh, bw * sh, bh * 0.5));
    float zz = (fract((lq.z / BH + 0.5) * n) - 0.5) * BH / n;
    float thick = BH / n * 0.5 * (1.0 - 0.85 * smoothstep(0.0, 0.35, dissolve)) * (1.0 - smoothstep(0.5, 1.0, dissolve * (0.7 + 0.6 * hs)));
    float slab = abs(zz) - thick;
    book = max(b2, slab) * 0.5;
  }
  // never step across a slot / level boundary inside the shelf zone (domain repetition safety)
  if (q.x > BACK - 0.8 && book > 0.0) {
    float cb = SLOT * 0.5 - abs(lq.y);
    float zb = min(q.z - kb * LV, (kb + 1.0) * LV - q.z);
    book = min(book, max(min(cb, zb), 0.0) + 0.03);
  }
  if (book < res.x) res = vec2(book, phantom ? 5.0 : 3.0);
  return res;
}
vec3 calcN(vec3 p, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 4; i++) { float h = 0.02 + 0.08 * float(i); occ += (h - map(p + n * h).x) * sca; sca *= 0.7; }
  return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

void main() {
  vec3 rd = camRay();
  vec3 ro = camPos;
  float t = 0.02; bool hit = false; vec2 m = vec2(0.0);
  for (int i = 0; i < 220; i++) {
    m = map(ro + rd * t);
    if (m.x < 0.0008 * t) { hit = true; break; }
    t += m.x * 0.8;
    if (t > 70.0) break;
  }
  vec3 P = ro + rd * t;
  vec3 BC = vec3(BACK - BD * 0.5 - PULL, (IB + 0.5) * SLOT, KB * LV + 0.035 + BH * 0.5);
  // engraving coordinates (uniform flow)
  float uZ = P.z * 30.0;     // horizontal lines: spines, back panel
  float uX = P.x * 9.0;      // lines along the corridor: floor, shelf tops (vanishing lines)
  float uY = P.y * 5.0;
  float uSpine = P.y / SLOT * 3.0;
  vec3 col = C_INK * 0.5;
  if (hit) {
    float id = m.y;
    vec3 N = calcN(P, 0.0008 * t + 0.0005);
    float ao = calcAO(P + N * 0.005, N);
    // light: overhead lamps every 6 units along the corridor + the phantom's own glow
    float ly = mod(P.y + 3.0, 6.0) - 3.0;
    vec3 Lp = vec3(0.0, P.y - ly, 6.9) - P;
    float Ld = length(Lp);
    float dif = max(dot(N, Lp / Ld), 0.0) * 9.0 / (Ld * Ld + 4.0);
    dif += max(dot(N, keyDir), 0.0) * 0.18;
    vec3 Bp = BC - P;
    float Bd = length(Bp);
    float bl = glow * (0.3 + 0.5 * kick) * max(dot(N, Bp / max(Bd, 1e-3)) * 0.8 + 0.2, 0.0) * 0.8 / (Bd * Bd * 3.0 + 0.35);
    float light = sat(dif * (0.3 + 0.7 * ao));
    vec3 an = abs(N);
    float u = an.x > max(an.y, an.z) ? uZ : (an.z > an.y ? uX : uZ);
    float fw = fwidth(u);
    float w = pow(light, 1.1) * 0.85;
    float lines = hatch(u, w);
    vec3 inkC = C_BONE * 0.72;
    if (id < 0.5) {
      lines = hatch(uX, w * 0.4) * 0.7;
    } else if (id < 1.5) {
      lines = hatch(uZ, w * 0.6) * 0.8;
    } else if (id < 2.5) {
      inkC = C_BONE * 0.6;
    } else if (id < 3.5 || id > 5.5) {
      // spine: horizontal hatching + title bands near the top and bottom; a vertical edge line
      float zl = fract(P.z / LV) * LV;
      float band = smoothstep(0.02, 0.0, abs(zl - 0.2)) + smoothstep(0.03, 0.0, abs(zl - 0.62));
      // spines: vertical burin lines (the book's own grain), cut by dark title bands
      lines = hatch(uSpine, w) * (1.0 - 0.8 * band);
      if (an.x < 0.7) lines = hatch(uZ, w * 0.8);
      if (id > 5.5) { lines = hatch(uY, 0.12) * 0.25; }
    } else {
      // the phantom: hot from inside, engraved lines in ember over signal
      float hl = hatch(uZ, 0.55 + 0.3 * glow);
      inkC = heat(0.48 + 0.12 * glow + 0.1 * kick) * (0.7 + 0.7 * glow);
      lines = mix(0.3, 1.0, hl);
    }
    fw = max(fw, fwidth(uSpine) * step(2.5, id) * step(id, 3.5));
    if (fw > 0.5) lines = mix(lines, w * 0.5, smoothstep(0.5, 1.2, fw));
    lines = mix(lines, w * 0.45, smoothstep(9.0, 22.0, t));
    col = inkC * lines;
    // orange spill from the phantom onto its neighbours
    if (id < 4.5) col += C_SIGNAL * bl * mix(0.35, 1.0, lines);
    col = mix(col, C_INK * 0.5, 1.0 - exp(-t * fogK));
  }
  // a faint halo around the phantom (the light it gives off), seen by every ray
  vec3 oc = BC - ro;
  float tb = dot(oc, rd);
  if (tb > 0.0 && tb < t + 0.3) {
    float d = length(oc - rd * tb);
    col += C_SIGNAL * glow * 0.12 * exp(-d * d * 8.0) * (1.0 - dissolve);
  }
  fragColor = vec4(col, 1.0);
}`;
