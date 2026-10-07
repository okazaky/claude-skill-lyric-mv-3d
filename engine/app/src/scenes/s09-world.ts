// Dawn world shared by s09 (「それでも明日も 君に打ち込む」) and s10 (「AIと私」 + outro).
// One fullscreen pass that casts a ray from a real perspective camera per fragment:
//  - ground: an undulating height field (ray-marched), flat around a focus point where the type
//    stands; bone hairline grid + engraved topographic contour lines, fogged to ink at the horizon;
//  - sky: ink; dawn is only a slow bone haze along the horizon;
//  - the sun: a woodcut sphere in bone on ink: hatch lines that follow the sphere's latitude
//    (curving with it), weighted by the light, a thin signal rim and faint engraved halo rings.
// Orange in this pass is limited to the sun's hairline rim.
import * as THREE from "three";
import { FSPass, W, H } from "../engine/gl";

const FRAG = /* glsl */ `
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos, uFocus;
uniform float uSunH, uSunAz, uSunR, uDawn, uGrid, uKick, uT, uAmp, uSunA;

vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
float ampAt(vec2 q) { return smoothstep(uFocus.z, uFocus.z + 12.0, length(q - uFocus.xy)); }
float hgt(vec2 q) {
  float A = uAmp * ampAt(q);
  float w = 0.6 * sin(0.21 * q.x + 0.13 * q.y + 0.35 * uT) + 0.4 * sin(0.16 * q.y - 0.29 * q.x - 0.22 * uT)
          + 0.3 * sin(0.47 * q.x + 0.38 * q.y + 0.5 * uT);
  return A * w;
}

void main() {
  vec3 d = rayDir(vUv);
  vec3 sd = normalize(vec3(sin(uSunAz) * cos(uSunH), sin(uSunH), -cos(uSunAz) * cos(uSunH)));
  vec3 col = C_INK;
  float el = d.y;
  // ---------------------------------------------------------------- sky: ink + bone haze
  col += C_BONE * 0.035 * uDawn * exp(-abs(el) * 14.0);
  // ---------------------------------------------------------------- woodcut sun
  vec3 sx = normalize(cross(vec3(0.0, 1.0, 0.0), sd));
  vec3 sy = cross(sd, sx);
  float fwd = dot(d, sd);
  vec2 sp = vec2(dot(d, sx), dot(d, sy)) / max(fwd, 1e-3) / uSunR;
  float r = length(sp);
  if (fwd > 0.0) {
    float fr = max(fwidth(r), 1e-5);
    float inside = 1.0 - smoothstep(1.0 - fr * 1.5, 1.0, r);
    if (r < 1.0) {
      vec3 n = vec3(sp, sqrt(max(0.0, 1.0 - r * r)));
      float lam = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
      // latitude of a sphere tipped toward the viewer: lines curve with the surface
      float ca = cos(0.5), sa = sin(0.5);
      float ny = n.y * ca + n.z * sa;
      float lat = asin(clamp(ny, -1.0, 1.0));
      float u = lat * 9.5;
      float lines = hatch(u, mix(0.08, 0.75, lam));
      // shadow side: sparse meridian cross-lines in graphite
      float mer = atan(n.x, n.z * ca - n.y * sa) * 7.0;
      float cross2 = hatchD(mer, 0.25 * smoothstep(0.35, 0.05, lam), fwidth(sp.x) * 7.0 / max(n.z, 0.15));
      col += (C_BONE * 0.42 * lines + C_GRAPHITE * 0.25 * cross2) * inside * uSunA;
    }
    // thin signal rim (the only orange in the world)
    col += C_SIGNAL * (0.9 + 0.6 * uKick) * pxLine(abs(r - 1.0) / fr, 0.5, 1.4) * uSunA;
    // engraved halo rings, breathing on the kick
    float rr = (r - 1.0) * 7.0 - 0.6 * uKick;
    float ring = hatchD(rr, 0.07, fr * 7.0) * step(1.12, r) * (1.0 - smoothstep(1.3, 2.6, r));
    col += C_BONE * 0.10 * ring * uSunA;
  }
  // ---------------------------------------------------------------- ground (ray-marched height field)
  if (d.y < -1e-4) {
    float t = 0.0, tp = 0.0;
    bool hit = false;
    for (int i = 0; i < 180; i++) {
      vec3 p = uCamPos + d * t;
      float dh = p.y - hgt(p.xz);
      if (dh < 0.002) { hit = true; break; }
      tp = t;
      t += max(dh * 0.45, 0.025 + t * 0.008);
      if (t > 160.0) break;
    }
    // grazing rays can exhaust the steps while still skimming the swell: shade them at the last
    // sample instead of leaving an ink hole in the ground
    if (!hit && t <= 160.0) { hit = true; tp = t; }
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
      float fog = exp(-t * 0.04);
      // bone hairline grid, LOD-faded
      vec2 w = fwidth(g);
      vec2 gd = abs(fract(g - 0.5) - 0.5) / max(w, 1e-5);
      float gl = max(pxLine(gd.x, 0.5, 1.4), pxLine(gd.y, 0.5, 1.4));
      float lod = 1.0 - smoothstep(0.15, 0.5, max(w.x, w.y));
      vec3 ground = C_INK;
      ground += C_BONE * 0.17 * gl * lod * uGrid * (1.0 + 0.8 * uKick);
      // engraved topographic contours of the swell, weighted by the light
      float e = 0.05;
      vec3 nn = normalize(vec3(hgt(g - vec2(e, 0.0)) - hgt(g + vec2(e, 0.0)), 2.0 * e, hgt(g - vec2(0.0, e)) - hgt(g + vec2(0.0, e))));
      float lam = clamp(dot(nn, normalize(vec3(sd.x, max(sd.y, 0.15), sd.z))), 0.0, 1.0);
      float cu = hgt(g) * 7.0;
      float lodC = 1.0 - smoothstep(0.3, 0.6, fwidth(cu));
      // contours only where the ground actually swells (a flat field would sit inside one line)
      float cl = hatch(cu, mix(0.06, 0.32, lam)) * lodC * smoothstep(0.15, 0.5, ampAt(g));
      ground += C_BONE * 0.11 * cl;
      col = mix(C_INK + C_BONE * 0.035 * uDawn, ground, fog);
    } else {
      col = C_INK + C_BONE * 0.035 * uDawn * exp(d.y * 14.0);
    }
  }
  // horizon hairline, bone
  col += C_BONE * 0.12 * pxLine(abs(d.y) / max(fwidth(d.y), 1e-6), 0.5, 1.5);
  fragColor = vec4(col, 1.0);
}`;

export interface WorldParams {
  sunH: number;
  sunAz?: number;
  sunR?: number;
  dawn: number;
  grid: number;
  kick: number;
  t: number;
  /** Swell amplitude (world units) and the flat focus disc (x, z, radius) where the type stands. */
  amp?: number;
  focus?: [number, number, number];
  /** Sun visibility 0..1. */
  sunA?: number;
}

export class DawnWorld {
  cam = new THREE.PerspectiveCamera(38, W / H, 0.05, 500);
  pass = new FSPass(FRAG, {
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uFocus: { value: new THREE.Vector3(0, -10, 6) },
    uSunH: { value: 0 },
    uSunAz: { value: 0 },
    uSunR: { value: 0.1 },
    uDawn: { value: 0 },
    uGrid: { value: 1 },
    uKick: { value: 0 },
    uT: { value: 0 },
    uAmp: { value: 0.6 },
    uSunA: { value: 1 },
  });

  /** Place the camera (eye, target, roll in radians) and update its matrices. */
  look(px: number, py: number, pz: number, tx: number, ty: number, tz: number, roll = 0, fov = 38) {
    const c = this.cam;
    c.fov = fov;
    c.position.set(px, py, pz);
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    c.lookAt(tx, ty, tz);
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, p: WorldParams) {
    const u = this.pass.u;
    (u.uInvProj!.value as THREE.Matrix4).copy(this.cam.projectionMatrixInverse);
    (u.uCamWorld!.value as THREE.Matrix4).copy(this.cam.matrixWorld);
    (u.uCamPos!.value as THREE.Vector3).copy(this.cam.position);
    const fo = p.focus ?? [0, -10, 6];
    (u.uFocus!.value as THREE.Vector3).set(fo[0], fo[1], fo[2]);
    u.uSunH!.value = p.sunH;
    u.uSunAz!.value = p.sunAz ?? 0;
    u.uSunR!.value = p.sunR ?? 0.1;
    u.uDawn!.value = p.dawn;
    u.uGrid!.value = p.grid;
    u.uKick!.value = p.kick;
    u.uT!.value = p.t;
    u.uAmp!.value = p.amp ?? 0.6;
    u.uSunA!.value = p.sunA ?? 1;
    this.pass.render(renderer, out);
  }

  /** World point -> logical screen px (x right, y down) and view depth; null when behind the camera. */
  project(x: number, y: number, z: number, v = new THREE.Vector3()) {
    v.set(x, y, z).applyMatrix4(this.cam.matrixWorldInverse);
    const depth = -v.z;
    if (depth <= 0.01) return null;
    v.applyMatrix4(this.cam.projectionMatrix);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, depth };
  }
}
