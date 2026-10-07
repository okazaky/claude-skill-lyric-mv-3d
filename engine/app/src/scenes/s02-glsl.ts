// s02 raymarcher: the assistant-smile mask as a 3D bulged coin with its eyes and smile carved in,
// burin-engraved by its lighting; behind it a wall of small smiling masks (an audience, nodding on
// the beat) and an engraved sunburst of rays radiating from the big mask.
import { GLSL_MASK } from "./_motifs";

export const S02_FRAG = /* glsl */ `
uniform vec3 camPos, camR, camU, camF;
uniform float tanF, aspect, uT, kick, beatPh, rayRot, glow, crowdK;
uniform vec3 mC; uniform float mR; uniform mat3 mRot; // big mask: centre, radius, world->local rotation
${GLSL_MASK}

// mask in local units (radius 1, front faces +z, y up). Carved features.
float maskLocal(vec3 p, bool carved) {
  float dc = length(p.xy) - 1.0;
  float back = -p.z - 0.16;
  float front = length(p - vec3(0.0, 0.0, -1.6)) - 1.85;
  float d = max(max(dc, back), front);
  float m = sdMaskInk(vec2(p.x, -p.y));
  if (!carved) return d;
  float carve = max(m, 0.06 - p.z);
  return max(d, -carve);
}

const float CROWD_Z = -17.0;
const float CS = 2.15;
const float CR = 0.66;
/** Local (unit-radius) coordinates of the nearest crowd mask. */
vec3 crowdLP(vec3 p) {
  vec3 q = p - vec3(0.0, 0.0, CROWD_Z);
  vec2 id = clamp(floor(q.xy / CS + 0.5), vec2(-8.0, -4.0), vec2(8.0, 4.0));
  float h = hash12(id + 3.1);
  float bob = 0.35 * crowdK * pow(1.0 - beatPh, 3.0) * (0.5 + h);
  vec3 lq = q - vec3(id * CS, bob);
  lq.xz = rot2((h - 0.5) * 0.5) * lq.xz;
  return lq / CR;
}
float crowd(vec3 p) { return maskLocal(crowdLP(p), false) * CR; }

vec2 map(vec3 p) {
  vec3 lp = mRot * (p - mC) / mR;
  float big = maskLocal(lp, true) * mR;
  float cr = crowdK > 0.5 ? crowd(p) : 1e3;
  return big < cr ? vec2(big, 1.0) : vec2(cr, 2.0);
}
vec3 nrm(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}

// hatch that settles to its mean ink when lines get denser than ~3 px or the surface turns
// edge-on to the eye (kills rim moire): g = grazing fade 0..1
float hatchS(float u, float dark, float du, float g) {
  float k = max(smoothstep(0.22, 0.55, du), g);
  return mix(hatchD(u, dark, du), sat(dark), k);
}
vec3 engraveMask(vec3 lp, vec3 nl, vec3 nW, vec3 rd, float freq, float dim, bool carved) {
  vec3 L = normalize(vec3(-0.75, 0.6, 0.45));
  float diff = max(dot(nW, L), 0.0);
  float ndv = abs(dot(nW, -rd));
  float rim = pow(1.0 - ndv, 3.0);
  float g = 1.0 - smoothstep(0.1, 0.38, ndv);
  float m = sdMaskInk(vec2(lp.x, -lp.y));
  // big mask: features are carved grooves; crowd: features are painted on the uncarved face
  bool inFeature = m < 0.0 && (lp.z < 0.075 || !carved);
  if (nl.z > 0.25 && !inFeature) {
    // face: horizontal burin lines bent by the bulge, crosshatch in the highlight
    float u = (lp.y + 0.35 * lp.z) * freq;
    float lit = 0.1 + 0.72 * diff;
    float a = hatchS(u, lit, fwidth(u), g);
    float ub = (lp.x * 0.8 + lp.y * 0.6) * freq * 0.9;
    float b = hatchS(ub, sat(lit * 2.0 - 1.25), fwidth(ub), g);
    float ink = max(a, b);
    // the engraved edge ring around each feature (burin outline)
    float edge = 1.0 - smoothstep(0.0, 0.035, abs(m));
    vec3 c = mix(C_INK, C_BONE, ink * 0.95);
    c = mix(c, C_INK, edge * 0.85);
    return c * dim + C_BONE * rim * 0.15 * dim;
  }
  if (inFeature) {
    // carved eyes and smile: deep ink, a faint fine crosshatch at the groove walls
    float u = (lp.x - lp.y) * freq * 1.6;
    float wall = sat(1.0 - abs(nl.z));
    float h = hatch(u, 0.1 + 0.4 * wall * diff);
    return mix(C_INK * 0.6, C_GRAPHITE, h * 0.6) * dim;
  }
  // rim / back: vertical hatching, graphite
  float ang = atan(lp.y, lp.x);
  float ur = ang * 36.0 / TAU;
  float hh = hatchS(ur, 0.15 + 0.6 * diff, 36.0 / TAU * length(fwidth(lp.xy)) / max(length(lp.xy), 0.2), g);
  return mix(C_INK, C_ASH, hh) * dim;
}

vec3 background(vec3 ro, vec3 rd) {
  // rays on a plane behind the crowd, centred on the big mask's axis
  float tz = (CROWD_Z - 2.0 - ro.z) / rd.z;
  vec3 q = ro + rd * tz;
  vec2 d = q.xy - mC.xy;
  float r = length(d);
  float N = 64.0;
  float a = atan(d.y, d.x) / TAU * N + rayRot;
  float du = N / TAU * length(fwidth(q.xy)) / max(r, 0.05);
  float longRay = step(0.5, fract(floor(a) * 0.5));
  float w = mix(0.05, 0.16, longRay);
  float h = hatchD(a, w, du);
  float fall = exp(-r * mix(0.09, 0.05, longRay));
  // engraved bone hairlines at low alpha: no colour, orange stays on the type/meter/sparks
  return mix(C_INK, C_BONE, h * 0.16 * fall);
}

void main() {
  vec2 px = FRAG_PX;
  vec2 ndc = (px / vec2(1920.0, 1080.0)) * 2.0 - 1.0;
  vec3 rd = normalize(camF + ndc.x * aspect * tanF * camR + ndc.y * tanF * camU);
  vec3 ro = camPos;
  float t = 0.0; float mat = 0.0; bool hit = false;
  for (int i = 0; i < 120; i++) {
    vec3 p = ro + rd * t;
    vec2 m = map(p);
    if (m.x < 0.0012 * t) { hit = true; mat = m.y; break; }
    t += m.x * 0.85;
    if (t > 60.0) break;
  }
  vec3 col;
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = nrm(p);
    if (mat == 1.0) {
      vec3 lp = mRot * (p - mC) / mR;
      vec3 nl = mRot * n;
      col = engraveMask(lp, nl, n, rd, 34.0, 1.0, true);
    } else {
      vec3 lp = crowdLP(p);
      col = engraveMask(lp, n, n, rd, 12.0, 0.2, false);
    }
    col = mix(col, C_INK, 1.0 - exp(-t * 0.02));
  } else {
    col = background(ro, rd);
  }
  fragColor = vec4(col, 1.0);
}`;
