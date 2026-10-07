// s05 shaders: a raymarched temperature dial (knurled knob on an engraved plate) over a floor of
// isotherm contours, all shaded as engraving; then a heat-haze pass that composites the type layers.
import { GLSL_CAM } from "./s05-cam";

// sweep of the dial scale: T = 0 at A0, T = 2 at A0 - SWEEP (clockwise seen from above)
export const A0 = Math.PI * 1.25;
export const SWEEP = Math.PI * 1.5;
export const KNOB_R = 2.6;
export const KNOB_H = 1.3;
export const PLATE_R = 6.2;

export const FRAG_DIAL = /* glsl */ `
${GLSL_CAM}
uniform float knobT, knobA, heatK, kick, lieK;
uniform vec3 keyDir;
const float KR = ${KNOB_R.toFixed(3)}, KH = ${KNOB_H.toFixed(3)}, PR = ${PLATE_R.toFixed(3)};
const float A0 = ${A0.toFixed(5)}, SW = ${SWEEP.toFixed(5)};

float sdCylZ(vec3 p, float r, float z0, float z1) {
  vec2 d = vec2(length(p.xy) - r, max(z0 - p.z, p.z - z1));
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
// id: 0 floor, 1 plate, 2 knob side, 3 knob top, 4 pointer
vec2 map(vec3 p) {
  float fl = p.z + 0.35;
  vec2 res = vec2(fl, 0.0);
  float pl = sdCylZ(p, PR, -0.35, 0.0) - 0.02;
  if (pl < res.x) res = vec2(pl, 1.0);
  float r = length(p.xy);
  float ang = atan(p.y, p.x);
  float knurl = 0.045 * abs(sin(ang * 36.0));
  float kn = sdCylZ(p, KR - knurl * smoothstep(KH - 0.12, KH - 0.25, p.z), 0.0, KH) - 0.05;
  // chamfer on the top edge
  kn = max(kn, (p.z - KH) + (r - KR + 0.25) * 0.9);
  if (kn < res.x) res = vec2(kn, p.z > KH - 0.09 && r < KR - 0.2 ? 3.0 : 2.0);
  // pointer ridge on top
  vec2 dir = vec2(cos(knobA), sin(knobA));
  vec2 q = vec2(dot(p.xy, dir), dot(p.xy, vec2(-dir.y, dir.x)));
  float ptr = sdBox3(vec3(q.x - 1.25, q.y, p.z - KH - 0.02), vec3(1.0, 0.07, 0.09)) - 0.02;
  if (ptr < res.x) res = vec2(ptr, 4.0);
  return res;
}
vec3 calcN(vec3 p, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 3; i++) { float h = 0.05 + 0.24 * float(i); occ += (h - map(p + n * h).x) * sca; sca *= 0.7; }
  return clamp(1.0 - 1.4 * occ, 0.0, 1.0);
}
float shadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.05;
  for (int i = 0; i < 10; i++) { float h = map(ro + rd * t).x; res = min(res, 7.0 * h / t); t += clamp(h, 0.15, 1.2); if (res < 0.02 || t > 12.0) break; }
  return sat(res);
}
/** isotherm field on the floor: rings around the dial, boiled by turbulence that grows with T */
float isoField(vec2 xy) {
  float turb = fbm(xy * 0.12 + vec2(0.0, -time * (0.25 + 0.9 * heatK)), 4) * (1.0 + 5.0 * heatK);
  return length(xy) * 0.55 + turb;
}

void main() {
  vec3 rd = camRay();
  vec3 ro = camPos;
  float t = 0.05; bool hit = false; vec2 m = vec2(0.0);
  for (int i = 0; i < 84; i++) {
    m = map(ro + rd * t);
    if (m.x < 0.0006 * t) { hit = true; break; }
    t += m.x * 0.95;
    if (t > 90.0) break;
  }
  vec3 col = C_INK * 0.6;
  // all engraving coordinates computed in uniform flow (fwidth needs neighbours)
  vec3 P = ro + rd * t;
  float r = length(P.xy);
  float ang = atan(P.y, P.x);
  float angB = ang + (ang < 0.0 ? TAU : 0.0);
  float uFloor = isoField(P.xy) * 3.2;
  float uRing = r * 9.0;
  float uKnurl = ang * 72.0 / TAU, uKnurlB = angB * 72.0 / TAU;
  float uTop = r * 16.0;
  float uVert = P.z * 22.0;
  float dKnurl = min(fwidth(uKnurl), fwidth(uKnurlB));
  if (hit) {
    vec3 N = calcN(P, 0.0015 * t);
    float ao = calcAO(P + N * 0.01, N);
    float dif = max(dot(N, keyDir), 0.0);
    float sh = (dif > 0.01 && t < 30.0) ? shadow(P + N * 0.02, keyDir) : 1.0;
    float light = sat(dif * sh * (0.35 + 0.65 * ao) + 0.06 * ao);
    float id = m.y;
    float w = pow(light, 1.15) * 0.95;
    float lines;
    vec3 inkC = C_BONE * 0.78;
    if (id < 0.5) {
      // floor: bone isotherm hairlines on ink at every T. Heat shows as turbulence (isoField) and
      // line wobble; only the crests of the hottest contours take a thin heat() tint (small area).
      float wf = mix(0.07, 0.15, light);
      lines = hatch(uFloor, wf) * (0.28 + 0.45 * light);
      inkC = C_BONE * 0.46;
      lines *= exp(-max(t - 14.0, 0.0) * 0.05);
      float crest = smoothstep(0.58, 0.72, fbm(P.xy * 0.18 + vec2(0.0, -time * 0.6), 2) * 0.5 + 0.5) * heatK;
      col += heat(0.5) * 0.55 * lines * crest;
    } else if (id < 1.5) {
      // plate: machined rings, with the dial scale (ticks) engraved where the knob pointer sweeps
      lines = hatch(uRing, w * 0.5);
      float rel = mod(A0 - angB + TAU * 4.0, TAU); // 0..TAU clockwise from T=0
      float tv = rel / SW * 2.0;                  // T value under this pixel
      float onScale = step(rel, SW + 0.01) * smoothstep(4.25, 4.35, r) * smoothstep(5.75, 5.6, r);
      float tick = 1.0 - smoothstep(0.0, 0.012 + fwidth(tv) * 1.2, abs(fract(tv * 10.0 + 0.5) - 0.5) / 10.0);
      float major = 1.0 - smoothstep(0.0, 0.02 + fwidth(tv) * 1.2, abs(fract(tv * 2.0 + 0.5) - 0.5) / 2.0);
      float minorLen = smoothstep(5.0, 5.05, r);
      lines = max(lines, onScale * max(tick * minorLen, major) * 0.95);
      // the arc of the scale already passed by the pointer glows hot
      float passed = step(tv, knobT) * onScale * smoothstep(4.3, 4.4, r) * smoothstep(4.5, 4.4, r);
      col = C_INK * 0.6 + C_SIGNAL * passed * (1.0 + 1.2 * kick);
      inkC = C_BONE * 0.6;
    } else if (id < 2.5) {
      // knurled side: vertical lines that follow the knurl, swelling in the light
      lines = hatchD(uKnurl, w * 0.8, dKnurl);
      lines = max(lines, hatch(uVert, sat(light * 1.6 - 1.0)) * 0.6);
      inkC = C_BONE * 0.64;
    } else if (id < 3.5) {
      lines = hatch(uTop, w * 0.6);
      inkC = C_BONE * 0.6;
    } else {
      lines = 1.0;
      inkC = C_SIGNAL * (1.0 + 0.8 * kick);
    }
    // rim: back-lit hot edge
    float fres = pow(sat(1.0 - dot(N, -rd)), 4.0);
    col += inkC * lines;
    col += C_SIGNAL * fres * (0.08 + 0.22 * heatK) * ao * step(0.5, id) * step(id, 3.5);
    // depth fog to ink
    col = mix(col, C_INK * 0.6, sat((t - 22.0) / 70.0));
  }
  fragColor = vec4(col, 1.0);
}`;

// Heat haze + type composite. sceneTex = the dial; aTex = steady lyric/HUD layer; bTex = the 嘘 layer
// (drawn white; coloured hot here and dripped downward as it melts).
export const FRAG_HAZE = /* glsl */ `
uniform sampler2D sceneTex, aTex, bTex;
uniform float time, heatK, melt, lieK, kick;
vec2 hazeOff(vec2 uv, float amp) {
  vec2 q = uv * vec2(6.0, 3.4);
  float a = fbm(q + vec2(0.0, -time * 1.6), 3);
  float b = fbm(q * 1.7 + vec2(4.1, -time * 2.3), 3);
  // heat rises: stronger shimmer near the bottom
  return vec2(a, b) * amp * (0.5 + 0.8 * (1.0 - uv.y));
}
void main() {
  vec2 uv = vUv;
  float amp = (0.0015 + 0.010 * heatK * heatK) * (1.0 + 0.8 * kick);
  vec3 col = texture(sceneTex, uv + hazeOff(uv, amp)).rgb;
  // steady layer: slight shimmer only
  vec4 A = texture(aTex, uv + hazeOff(uv, amp * 0.35));
  col = mix(col, A.rgb, A.a);
  // the lie (嘘をついた, drawn white in bTex). Dark ink bed under the glyphs so they read on any
  // background (bed stroked in aTex); the face is cut as bone burin lines; signal drips run down out of it as it melts.
  vec2 wob = hazeOff(uv, amp * 0.3 + 0.002 * melt);
  float dn = fbm(vec2(uv.x * 26.0, 1.3), 3) * 0.5 + 0.5;
  float drip = pow(sat(dn * 1.3 - 0.15), 3.0);
  float len = melt * 0.30 * drip;
  float aD = 0.0, tipD = 0.0;
  for (int i = 1; i < 7; i++) {
    float k = float(i) / 6.0;
    float s = texture(bTex, uv + wob + vec2(0.0, len * k)).a;
    aD = max(aD, s * (1.0 - 0.6 * k));
    tipD = max(tipD, s * k);
  }
  float core = texture(bTex, uv + wob).a;
  // the ink bed around the glyphs is stroked into aTex (cheap); here only under glyph + drips
  float bed = max(core, aD);
  col = mix(col, C_INK * 0.25, bed * 0.88);
  // drips: signal cooling to blood at the tips
  float dripOnly = aD * (1.0 - core);
  col = mix(col, heat(0.52 - 0.22 * tipD) * 1.1, dripOnly * melt * 1.2);
  // face: horizontal burin lines, heavier toward the bottom of each glyph (engraved shading)
  float y = FRAG_PX.y + 5.0 * fbm(vec2(FRAG_PX.x * 0.004, time * 0.5), 2) * melt;
  float shade = sat(0.35 + 0.5 * uv.y);
  float burin = 1.0 - hatch(y / 6.0, 0.62 - 0.32 * shade);
  float faceL = mix(burin, 1.0, pow(sat(lieK), 4.0) * 0.45);
  vec3 faceC = mix(C_BONE * 1.15, C_SIGNAL * 1.4, sat(melt * 0.9 + 0.25 * tipD));
  col = mix(col, faceC * (1.0 + 0.4 * lieK), core * faceL);
  fragColor = vec4(col, 1.0);
}`;
