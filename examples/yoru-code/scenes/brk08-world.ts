// brk08: open-air dawn world. Same look as m08-world (ray-marched engraved terrain, woodcut sun,
// engraved warm horizon band) with two changes for the high open-air shots:
//  - vast sky: faint engraved strata (cloud bands as horizontal burin lines, modulated by noise) and
//    sparse elevation hatching, so the big sky reads as engraved space rather than empty black;
//  - far ground: rays that run out of march distance take the horizon colour (no dark ledge seen
//    from altitude).
import * as THREE from "three";
import { FSPass, W, H } from "../engine/gl";

const FRAG = /* glsl */ `
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos;
uniform float uSunH, uSunAz, uSunR, uDawn, uGrid, uT, uAmp, uWarm, uVis, uSky;

vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
float hgt(vec2 q) {
  float w = 0.6 * sin(0.21 * q.x + 0.13 * q.y + 0.35 * uT) + 0.4 * sin(0.16 * q.y - 0.29 * q.x - 0.22 * uT)
          + 0.3 * sin(0.47 * q.x + 0.38 * q.y + 0.5 * uT);
  return uAmp * w;
}
vec3 skyBand(float el, float az) {
  if (el < 0.0) return vec3(0.0);
  float k = exp(-el * 9.0);
  float lines = hatch(el * 260.0, clamp(uWarm * (0.15 + 0.75 * k), 0.0, 0.95));
  float warmK = uWarm * k * (0.75 + 0.25 * cos(az * 1.4));
  vec3 c = mix(C_BLOOD * 0.6, C_SIGNAL * 1.05, smoothstep(0.25, 0.9, k));
  return c * lines * warmK + C_BLOOD * 0.05 * uWarm * k;
}
// engraved strata high in the sky (bone, faint)
vec3 strata(float el, float az) {
  if (el < 0.03) return vec3(0.0);
  float n = fbm(vec2(az * 2.2, el * 9.0) + vec2(3.1, 0.7), 4);
  float mask = smoothstep(0.15, 0.42, n) * smoothstep(0.03, 0.12, el) * (1.0 - smoothstep(0.55, 1.0, el));
  float u = el * 150.0 + 1.5 * snoise(vec2(az * 3.0, el * 6.0));
  float lines = hatch(u, 0.12 + 0.4 * mask);
  float fine = hatch(el * 70.0, 0.05) * (1.0 - smoothstep(0.1, 0.7, el));
  return C_BONE * (0.1 * lines * mask + 0.025 * fine) * uSky;
}

void main() {
  vec3 d = rayDir(vUv);
  vec3 sd = normalize(vec3(sin(uSunAz) * cos(uSunH), sin(uSunH), -cos(uSunAz) * cos(uSunH)));
  vec3 col = C_INK;
  float el = d.y;
  float az = atan(d.x, -d.z);
  col += C_BONE * 0.035 * uDawn * exp(-abs(el) * 14.0);
  col += skyBand(el, az);
  col += strata(el, az);
  vec3 sx = normalize(cross(vec3(0.0, 1.0, 0.0), sd));
  vec3 sy = cross(sd, sx);
  float fwd = dot(d, sd);
  vec2 sp = vec2(dot(d, sx), dot(d, sy)) / max(fwd, 1e-3) / uSunR;
  float r = length(sp);
  if (fwd > 0.0 && el > -0.002) {
    float fr = max(fwidth(r), 1e-5);
    float inside = 1.0 - smoothstep(1.0 - fr * 1.5, 1.0, r);
    if (r < 1.0) {
      vec3 n = vec3(sp, sqrt(max(0.0, 1.0 - r * r)));
      float lam = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
      float ca = cos(0.5), sa = sin(0.5);
      float ny = n.y * ca + n.z * sa;
      float lat = asin(clamp(ny, -1.0, 1.0));
      float lines = hatch(lat * 11.0, mix(0.08, 0.78, lam));
      float mer = atan(n.x, n.z * ca - n.y * sa) * 7.0;
      float cross2 = hatchD(mer, 0.25 * smoothstep(0.35, 0.05, lam), fwidth(sp.x) * 7.0 / max(n.z, 0.15));
      vec3 lc = mix(C_BONE * 0.46, mix(C_BONE * 0.46, C_EMBER * 0.6, 0.55), uWarm * smoothstep(0.2, -0.8, n.y));
      col = mix(col, C_INK, inside * 0.85);
      col += (lc * lines + C_GRAPHITE * 0.25 * cross2) * inside;
    }
    col += C_SIGNAL * 1.1 * pxLine(abs(r - 1.0) / fr, 0.5, 1.4);
    float rr = (r - 1.0) * 7.0;
    float ring = hatchD(rr, 0.07, fr * 7.0) * step(1.12, r) * (1.0 - smoothstep(1.3, 2.6, r));
    col += C_BONE * 0.10 * ring;
  }
  if (d.y < -1e-4) {
    vec3 horizonCol = C_INK + C_BONE * 0.035 * uDawn + C_BLOOD * 0.06 * uWarm;
    float t = 0.0, tp = 0.0;
    bool hit = false;
    float tMax = 160.0 + 12.0 * max(uCamPos.y, 0.0);
    for (int i = 0; i < 180; i++) {
      vec3 p = uCamPos + d * t;
      float dh = p.y - hgt(p.xz);
      if (dh < 0.002) { hit = true; break; }
      tp = t;
      t += max(dh * 0.45, 0.025 + t * 0.01);
      if (t > tMax) break;
    }
    if (hit) {
      float a = tp, b = t;
      for (int i = 0; i < 6; i++) {
        float m = 0.5 * (a + b);
        vec3 p = uCamPos + d * m;
        if (p.y - hgt(p.xz) < 0.0) b = m; else a = m;
      }
      t = b;
      vec3 p = uCamPos + d * t;
      vec2 g = p.xz;
      float fog = exp(-t * 0.035);
      vec2 w = fwidth(g);
      vec2 gd = abs(fract(g - 0.5) - 0.5) / max(w, 1e-5);
      float gl = max(pxLine(gd.x, 0.5, 1.4), pxLine(gd.y, 0.5, 1.4));
      float lod = 1.0 - smoothstep(0.15, 0.5, max(w.x, w.y));
      // coarse 8-unit grid survives at altitude (scale of the land seen from high up)
      vec2 g8 = g / 8.0;
      vec2 w8 = fwidth(g8);
      vec2 gd8 = abs(fract(g8 - 0.5) - 0.5) / max(w8, 1e-5);
      float gl8 = max(pxLine(gd8.x, 0.5, 1.4), pxLine(gd8.y, 0.5, 1.4)) * (1.0 - smoothstep(0.15, 0.5, max(w8.x, w8.y)));
      vec3 ground = C_INK;
      ground += C_BONE * (0.17 * gl * lod + 0.12 * gl8 * (1.0 - lod)) * uGrid;
      float e = 0.05;
      vec3 nn = normalize(vec3(hgt(g - vec2(e, 0.0)) - hgt(g + vec2(e, 0.0)), 2.0 * e, hgt(g - vec2(0.0, e)) - hgt(g + vec2(0.0, e))));
      float lam = clamp(dot(nn, normalize(vec3(sd.x, max(sd.y, 0.15), sd.z))), 0.0, 1.0);
      float cu = hgt(g) * 7.0;
      float lodC = 1.0 - smoothstep(0.3, 0.6, fwidth(cu));
      float cl = hatch(cu, mix(0.06, 0.32, lam)) * lodC * smoothstep(3.0, 9.0, t) * smoothstep(0.01, 0.04, fwidth(cu) * PX_SCALE);
      ground += mix(C_BONE * 0.11, C_EMBER * 0.16, uWarm * lam * 0.6) * cl;
      col = mix(horizonCol, ground, fog);
    } else {
      col = horizonCol;
    }
  }
  col += mix(C_BONE * 0.12, C_SIGNAL * 0.5, uWarm) * pxLine(abs(d.y) / max(fwidth(d.y), 1e-6), 0.5, 1.5);
  fragColor = vec4(mix(C_INK, col, uVis), 1.0);
}`;

export interface OpenWorldParams {
  sunH: number;
  sunAz: number;
  sunR: number;
  dawn: number;
  grid: number;
  amp: number;
  warm: number;
  vis: number;
  sky: number;
  t: number;
}

export class OpenWorld {
  cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 80);
  pass = new FSPass(FRAG, {
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunH: { value: 0 },
    uSunAz: { value: 0 },
    uSunR: { value: 0.1 },
    uDawn: { value: 0 },
    uGrid: { value: 1 },
    uT: { value: 0 },
    uAmp: { value: 0.5 },
    uWarm: { value: 1 },
    uVis: { value: 1 },
    uSky: { value: 1 },
  });

  look(px: number, py: number, pz: number, tx: number, ty: number, tz: number, roll: number, fov: number) {
    const c = this.cam;
    c.fov = fov;
    c.position.set(px, py, pz);
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    c.lookAt(tx, ty, tz);
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, p: OpenWorldParams) {
    const u = this.pass.u;
    (u.uInvProj!.value as THREE.Matrix4).copy(this.cam.projectionMatrixInverse);
    (u.uCamWorld!.value as THREE.Matrix4).copy(this.cam.matrixWorld);
    (u.uCamPos!.value as THREE.Vector3).copy(this.cam.position);
    u.uSunH!.value = p.sunH;
    u.uSunAz!.value = p.sunAz;
    u.uSunR!.value = p.sunR;
    u.uDawn!.value = p.dawn;
    u.uGrid!.value = p.grid;
    u.uT!.value = p.t;
    u.uAmp!.value = p.amp;
    u.uWarm!.value = p.warm;
    u.uVis!.value = p.vis;
    u.uSky!.value = p.sky;
    this.pass.render(renderer, out);
  }
}
