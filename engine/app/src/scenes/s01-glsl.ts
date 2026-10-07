// s01 raymarcher: a dark void with an engraved floor grid, a hanging 7-segment 03:00 clock
// (extruded, burin-hatched by its lighting) and a floating prompt bar whose face shows a canvas
// texture (the typed line + cursor) in true 3D perspective.

export const S01_FRAG = /* glsl */ `
uniform vec3 camPos, camR, camU, camF;
uniform float tanF, aspect, uT, kick, ringR, colonOn, clockGlow, barOn, gridK;
uniform vec3 clockPos; uniform float clockS;
uniform vec3 barPos; uniform vec3 barHalf;
uniform sampler2D barTex;

// ---- 7-segment digits (cell: x in [-0.5,0.5], y in [-1,1]) ----
float seg(vec3 p, vec2 c, vec2 h, float d) { return sdBox3(p - vec3(c, 0.0), vec3(h, d)) - 0.015; }
float digit(vec3 p, int n) {
  const float D = 0.16;
  vec2 hh = vec2(0.34, 0.075), hv = vec2(0.075, 0.38);
  float r = 1e5;
  bool a = n != 1 && n != 4;
  bool b = n != 5 && n != 6;
  bool c = n != 2;
  bool d = n != 1 && n != 4 && n != 7;
  bool e = n == 0 || n == 2 || n == 6 || n == 8;
  bool f = n != 1 && n != 2 && n != 3 && n != 7;
  bool g = n != 0 && n != 1 && n != 7;
  if (a) r = min(r, seg(p, vec2(0.0, 0.92), hh, D));
  if (g) r = min(r, seg(p, vec2(0.0, 0.0), hh, D));
  if (d) r = min(r, seg(p, vec2(0.0, -0.92), hh, D));
  if (b) r = min(r, seg(p, vec2(0.44, 0.46), hv, D));
  if (c) r = min(r, seg(p, vec2(0.44, -0.46), hv, D));
  if (e) r = min(r, seg(p, vec2(-0.44, -0.46), hv, D));
  if (f) r = min(r, seg(p, vec2(-0.44, 0.46), hv, D));
  return r;
}
// returns (dist, material) — material 1 = numerals, 2 = colon, 3 = bar, 4 = backplate
vec2 clockSdf(vec3 pw) {
  vec3 p = (pw - clockPos) / clockS;
  float r = 1e5;
  r = min(r, digit(p - vec3(-2.05, 0.0, 0.0), 0));
  r = min(r, digit(p - vec3(-0.85, 0.0, 0.0), 3));
  r = min(r, digit(p - vec3(0.85, 0.0, 0.0), 0));
  r = min(r, digit(p - vec3(2.05, 0.0, 0.0), 0));
  float col = min(sdBox3(p - vec3(0.0, 0.42, 0.0), vec3(0.09, 0.09, 0.16)), sdBox3(p - vec3(0.0, -0.42, 0.0), vec3(0.09, 0.09, 0.16)));
  // thin backplate (a hairline frame hanging behind the numerals)
  float plate = sdBox3(p - vec3(0.0, 0.0, -0.55), vec3(2.95, 1.45, 0.02));
  plate = max(plate, -sdBox3(p - vec3(0.0, 0.0, -0.55), vec3(2.88, 1.38, 0.1)));
  vec2 m = vec2(r * clockS, 1.0);
  if (col * clockS < m.x) m = vec2(col * clockS, 2.0);
  if (plate * clockS < m.x) m = vec2(plate * clockS, 4.0);
  return m;
}
vec2 map(vec3 p) {
  vec2 m = clockSdf(p);
  float b = sdBox3(p - barPos, barHalf) - 0.03;
  if (barOn > 0.0 && b < m.x) m = vec2(b, 3.0);
  return m;
}
vec3 nrm(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}

float gridLines(vec2 q, float scale) {
  vec2 g = q / scale;
  vec2 w = fwidth(g);
  vec2 d = abs(fract(g - 0.5) - 0.5) / max(w, 1e-4);
  return max(pxLine(d.x, 0.2, 1.2), pxLine(d.y, 0.2, 1.2));
}

vec3 floorCol(vec3 ro, vec3 rd, float tHit) {
  vec3 p = ro + rd * tHit;
  float dist = tHit;
  float minor = gridLines(p.xz, 1.0);
  float major = gridLines(p.xz, 4.0);
  float fade = exp(-dist * 0.055);
  float fadeM = exp(-dist * 0.03);
  // kick ripple: a ring running out from under the camera
  float rr = length(p.xz - camPos.xz);
  float ring = exp(-abs(rr - ringR) * 0.9) * kick;
  vec3 c = C_INK;
  c += C_GRAPHITE * minor * 0.55 * fade * gridK;
  c += C_ASH * major * 0.55 * fadeM * gridK;
  c += C_SIGNAL * (minor * 0.6 + major) * ring * 1.6 * fadeM;
  // the clock's reflection: a soft orange smear under the colon
  vec2 rp = p.xz - clockPos.xz;
  c += C_SIGNAL * 0.05 * colonOn * exp(-dot(rp * vec2(1.6, 0.25), rp * vec2(1.6, 0.25)) * 0.08);
  // engraved floor shading: sparse horizontal burin lines that thicken towards the horizon
  float h = hatch(p.z * 1.6, 0.05 + 0.25 * (1.0 - fade));
  c += C_GRAPHITE * h * 0.12 * fadeM;
  return c;
}

vec3 shadeSurf(vec3 p, vec3 rd, float mat) {
  vec3 n = nrm(p);
  vec3 L = normalize(vec3(-0.55, 0.75, 0.6));
  float diff = max(dot(n, L), 0.0);
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  vec3 q = (p - clockPos) / clockS;
  if (mat == 2.0) {
    // the colon: hot signal, blinking
    vec3 off = C_INK2 * 0.6;
    vec3 on = C_SIGNAL * (2.2 + clockGlow) ;
    return mix(off, on, colonOn);
  }
  if (mat == 4.0) {
    return C_GRAPHITE * 0.9;
  }
  if (mat == 3.0) {
    // the prompt bar: dark panel, hatched sides, textured face
    vec3 lp = (p - barPos) / barHalf;
    if (n.z > 0.8) {
      vec2 uv = vec2(lp.x * 0.5 + 0.5, lp.y * 0.5 + 0.5);
      vec4 tx = texture(barTex, uv);
      float hot = smoothstep(0.25, 0.7, tx.r - tx.g * 1.3);
      vec3 base = C_INK2 * 0.9;
      // hairline border on the face
      vec2 bd = (1.0 - abs(lp.xy)) * barHalf.xy;
      float border = pxLine(min(bd.x, bd.y) / fwidth(min(bd.x, bd.y)), 0.3, 1.3);
      base += C_ASH * border * 0.5;
      return mix(base, tx.rgb * (1.0 + 2.5 * hot), tx.a);
    }
    float u = (abs(n.y) > 0.5 ? p.x : p.y) * 46.0;
    float hh = hatch(u, 0.15 + 0.6 * diff);
    return mix(C_INK, C_ASH * 0.9, hh) + C_BONE * rim * 0.15;
  }
  // numerals: engraved. front faces horizontal burin lines, sides vertical; highlights crosshatch
  float freq = 15.0;
  float u1 = abs(n.z) > 0.6 ? q.y * freq : (abs(n.x) > 0.6 ? (q.y + q.z) * freq : (q.x + q.z) * freq);
  float lit = 0.12 + 0.88 * diff;
  float a = hatch(u1, lit * 0.95);
  float b = hatch((q.x * 0.7 - q.y * 0.7) * freq * 1.1, sat(lit * 2.0 - 1.15));
  float ink = max(a, b);
  vec3 c = mix(C_INK, C_BONE * 0.92, ink);
  c += C_BONE * rim * 0.25;
  // warm cast from the colon
  float dc = length(q.xy);
  c += C_SIGNAL * colonOn * 0.25 * exp(-dc * 1.6) * ink;
  return c;
}

vec3 render(vec2 px) {
  vec2 ndc = (px / vec2(1920.0, 1080.0)) * 2.0 - 1.0;
  vec3 rd = normalize(camF + ndc.x * aspect * tanF * camR + ndc.y * tanF * camU);
  vec3 ro = camPos;
  // march the objects
  float t = 0.0; float mat = 0.0; bool hit = false;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    vec2 m = map(p);
    if (m.x < 0.0015 * t) { hit = true; mat = m.y; break; }
    t += m.x * 0.9;
    if (t > 80.0) break;
  }
  float tFloor = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  vec3 col;
  if (hit && t < tFloor) {
    col = shadeSurf(ro + rd * t, rd, mat);
    col = mix(col, C_INK, 1.0 - exp(-t * 0.006));
  } else if (tFloor < 1e8) {
    col = floorCol(ro, rd, tFloor);
  } else {
    col = C_INK;
    // faint horizon haze
    col += C_GRAPHITE * 0.06 * exp(-abs(rd.y) * 30.0);
  }
  return col;
}

void main() {
  vec2 px = FRAG_PX;
  vec3 col = render(px);
  // vignette-ish depth: darken the top of the void
  fragColor = vec4(col, 1.0);
}`;
