// m09 helper: the open dawn world for a fast forward flight (OPEN SKY PASS).
// One fullscreen pass that casts a ray from a real perspective camera per fragment:
//  - ground: a static engraved terrain — a long flat valley along x = 0 (the flight path) between rolling
//    ridges; bone hairline grid + topographic contour hatching, fogged into the horizon haze;
//  - sky: a vast ink sky that brightens to a bone haze at the horizon, a thin warm band and a low dawn glow
//    straight ahead (-z), so the open shots read as "release / vast sky" while orange stays small.
import * as THREE from "three";
import { FSPass, W, H } from "../engine/gl";

const FRAG = /* glsl */ `
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos;
uniform float uDawn, uGrid, uWarm, uSun;

vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
float hgt(vec2 q) {
  float valley = smoothstep(5.0, 22.0, abs(q.x));
  float w = 0.55 * sin(0.061 * q.x + 0.043 * q.y) + 0.35 * sin(0.113 * q.y - 0.071 * q.x + 1.7)
          + 0.22 * sin(0.21 * q.x + 0.17 * q.y + 0.6) + 0.12 * sin(0.37 * q.y - 0.31 * q.x);
  return valley * (4.5 + 4.0 * w) + 0.25 * max(0.0, abs(q.x) - 18.0)
       + 0.18 * sin(0.09 * q.y + 0.4 * sin(0.05 * q.x));
}
void main() {
  vec3 d = rayDir(vUv);
  float el = d.y;
  // dawn sky: ink above, bone haze toward the horizon, thin warm band, low glow straight ahead
  float ang = acos(clamp(dot(d, normalize(vec3(0.0, 0.015, -1.0))), -1.0, 1.0));
  vec3 haze = C_INK + C_BONE * (0.006 + 0.075 * uDawn * exp(-abs(el) * 11.0));
  vec3 sky = haze + C_SIGNAL * 0.14 * uWarm * exp(-max(el, 0.0) * 32.0)
           + (C_SIGNAL * 0.22 * exp(-ang * 9.0) + C_BONE * 0.35 * exp(-ang * 70.0)) * uSun * step(-0.004, el);
  vec3 col = sky;
  if (d.y < 0.02) {
    float t = 0.05, tp = 0.05;
    bool hit = false;
    for (int i = 0; i < 200; i++) {
      vec3 p = uCamPos + d * t;
      float dh = p.y - hgt(p.xz);
      if (dh < 0.002) { hit = true; break; }
      tp = t;
      t += max(dh * 0.5, 0.04 + t * 0.014);
      if (t > 240.0) break;
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
      float fog = exp(-t * 0.02);
      vec2 gg = g / 3.0;
      vec2 w = fwidth(gg);
      vec2 gd = abs(fract(gg - 0.5) - 0.5) / max(w, 1e-5);
      float gl = max(pxLine(gd.x, 0.5, 1.4), pxLine(gd.y, 0.5, 1.4));
      float lod = 1.0 - smoothstep(0.15, 0.5, max(w.x, w.y));
      vec3 ground = C_INK + C_BONE * 0.15 * gl * lod * uGrid;
      float e = 0.08;
      vec3 nn = normalize(vec3(hgt(g - vec2(e, 0.0)) - hgt(g + vec2(e, 0.0)), 2.0 * e, hgt(g - vec2(0.0, e)) - hgt(g + vec2(0.0, e))));
      float lam = clamp(dot(nn, normalize(vec3(0.0, 0.35, -1.0))), 0.0, 1.0);
      // contours as constant-pixel-width engraved lines (no solid fills on flat ground)
      float cu = hgt(g) * 1.6;
      float fc = fwidth(cu);
      float lodC = 1.0 - smoothstep(0.3, 0.6, fc);
      float cl = pxLine(abs(fract(cu - 0.5) - 0.5) / max(fc, 1e-5), mix(0.3, 1.0, lam), mix(0.3, 1.0, lam) + 0.9) * lodC;
      ground += C_BONE * (0.16 * cl + 0.05 * lam);
      col = mix(haze, ground, fog);
    }
  }
  col += C_BONE * 0.08 * pxLine(abs(d.y) / max(fwidth(d.y), 1e-6), 0.5, 1.5);
  fragColor = vec4(col, 1.0);
}`;

export class DawnGround {
  cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 600);
  pass = new FSPass(FRAG, {
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uDawn: { value: 0 },
    uGrid: { value: 1 },
    uWarm: { value: 0 },
    uSun: { value: 0 },
  });

  /** place the camera by position + heading (yaw: + turns toward +x, pitch: + looks up, roll in rad) */
  aim(px: number, py: number, pz: number, yaw: number, pitch: number, roll = 0, fov = 70) {
    const c = this.cam;
    c.fov = fov;
    c.position.set(px, py, pz);
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    const cp = Math.cos(pitch);
    c.lookAt(px + Math.sin(yaw) * cp * 30, py + Math.sin(pitch) * 30, pz - Math.cos(yaw) * cp * 30);
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
  }

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, p: { dawn: number; grid: number; warm: number; sun: number }) {
    const u = this.pass.u;
    (u.uInvProj!.value as THREE.Matrix4).copy(this.cam.projectionMatrixInverse);
    (u.uCamWorld!.value as THREE.Matrix4).copy(this.cam.matrixWorld);
    (u.uCamPos!.value as THREE.Vector3).copy(this.cam.position);
    u.uDawn!.value = p.dawn;
    u.uGrid!.value = p.grid;
    u.uWarm!.value = p.warm;
    u.uSun!.value = p.sun;
    this.pass.render(renderer, out);
  }
}
