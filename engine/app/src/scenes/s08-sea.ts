// s08: the token ocean. One wave function (GLSL) drives three things so they agree: the engraved
// sea surface (a displaced mesh, hatched along its own contour lines), the glyph tokens riding the
// swell (points sampling a glyph atlas), and 私 made of ink points that come apart where the
// water reaches them.
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";
import { GLSL_COMMON_VS } from "./stack-kit";
import { SCALE } from "../engine/scale";
import { F, font } from "../engine/type";
import { hash } from "../engine/util";

/** Wave height at world xz. Uniforms: uT (time), uAmp (bass), uKick (last 4 kick times), uC (ripple centre). */
const WAVE = /* glsl */ `
uniform float uT; uniform float uAmp; uniform vec4 uKick; uniform vec2 uC;
float ripple(vec2 p) {
  float d = length(p - uC), h = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = uT - uKick[i];
    if (a < 0.0 || a > 2.5) continue;
    float r = a * 7.5;
    h += 0.5 * exp(-a * 1.5) * exp(-(d - r) * (d - r) * 0.3) * cos((d - r) * 2.3);
  }
  return h;
}
float swell(vec2 p) {
  float h = 0.0;
  h += 0.34 * sin(dot(p, vec2(0.42, 0.91)) * 0.55 + uT * 1.25);
  h += 0.21 * sin(dot(p, vec2(-0.77, 0.64)) * 0.9 - uT * 1.6);
  h += 0.10 * sin(dot(p, vec2(0.95, -0.3)) * 1.7 + uT * 2.3);
  h += 0.25 * snoise(vec3(p * 0.16, uT * 0.22));
  return h * uAmp;
}
float wave(vec2 p) { return swell(p) + ripple(p); }
`;

const SEA_VERT = /* glsl */ `precision highp float;
in vec3 position;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
${GLSL_COMMON_VS}
${WAVE}
out vec3 vP; out vec3 vN; out float vRip;
void main() {
  vec2 p = vec2(position.x, -position.y);
  float h = wave(p);
  float e = 0.15;
  float hx = wave(p + vec2(e, 0.0)), hz = wave(p + vec2(0.0, e));
  vN = normalize(vec3(h - hx, e, h - hz));
  vP = vec3(p.x, h, p.y);
  vRip = ripple(p);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vP, 1.0);
}`;

const SEA_FRAG = /* glsl */ `precision highp float;
precision highp int;
in vec3 vP; in vec3 vN; in float vRip;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 uCam; uniform float uGlow;
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.25, 0.55, -1.0)); // low light from the horizon ahead: back-lit swell
  float lit = sat(dot(n, L) * 1.35 - 0.05);
  vec3 V = normalize(uCam - vP);
  float glint = pow(sat(dot(reflect(-L, n), V)), 18.0);
  float dist = length(uCam - vP);
  // engraving: lines along the surface's own contours (constant z bent by the height), thicker where lit
  float u = vP.z * 6.5 + vP.y * 4.0;
  float ink = hatch(u, 0.04 + 0.5 * lit);
  float cross = hatch(vP.x * 5.0 - vP.z * 1.6, sat(0.45 - lit) * 0.5) * (1.0 - smoothstep(6.0, 22.0, dist));
  vec3 col = C_INK * 0.9;
  col += C_BONE * (0.34 * ink + 0.08 * cross) + C_BONE * 0.25 * glint * ink;
  // the kick's ripple rings run hot (the only orange in the water)
  float r = sat(abs(vRip) * 2.2) * uGlow;
  col = mix(col, C_SIGNAL * 1.6 * ink + C_SIGNAL * 0.07, r * 0.75);
  float fog = smoothstep(12.0, 62.0, dist);
  col = mix(col, C_INK + C_INK2 * 0.5, fog);
  fragColor = vec4(col, 1.0);
}`;

export class Sea {
  mesh: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  constructor(uniforms: Record<string, THREE.IUniform>) {
    const geo = new THREE.PlaneGeometry(130, 110, 420, 360);
    geo.translate(0, 30, 0); // z from -85 to +25 (plane y maps to -z)
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      uniforms: { ...uniforms, uCam: { value: new THREE.Vector3() }, uGlow: { value: 1 } },
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
}

// ------------------------------------------------------------ glyph tokens on the swell
const TOK_CHARS = "トークンの海に溶けていく私君AI01はをがでるあ忘新話記憶チャッ#{}<>".split("");
const AC = 8; // atlas columns

const TOK_VERT = /* glsl */ `precision highp float;
in vec3 position; in float aGlyph; in float aSeed;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
${GLSL_COMMON_VS}
${WAVE}
uniform float uPx; uniform float uSize; uniform float uTick; uniform vec3 uCam;
out float vGlyph; out float vA; out float vHot;
void main() {
  vec2 p = position.xz;
  float h = wave(p);
  vec4 mv = modelViewMatrix * vec4(p.x, h + 0.08, p.y, 1.0);
  float d = -mv.z;
  float sz = uSize / max(d, 0.5);
  gl_PointSize = min(sz, 40.0) * uPx;
  vGlyph = aGlyph;
  // a token flickers on for a moment now and then (frame-constant tick), crests catch more
  float on = step(0.72, hash12(vec2(aSeed, uTick)));
  vA = (0.4 + 0.6 * on) * smoothstep(1.6, 3.5, sz) * (1.0 - smoothstep(30.0, 60.0, d)) * (0.55 + 0.6 * sat(h));
  vHot = sat(abs(ripple(p)) * 2.0);
  gl_Position = projectionMatrix * mv;
}`;

const TOK_FRAG = /* glsl */ `precision highp float;
in float vGlyph; in float vA; in float vHot;
out vec4 fragColor;
uniform sampler2D uAtlas; uniform vec3 uBone; uniform vec3 uSig;
void main() {
  vec2 pc = vec2(gl_PointCoord.x, gl_PointCoord.y);
  float gx = mod(vGlyph, ${AC}.0), gy = floor(vGlyph / ${AC}.0);
  vec2 uv = (vec2(gx, gy) + pc) / vec2(${AC}.0, ${Math.ceil(TOK_CHARS.length / AC)}.0);
  float a = texture(uAtlas, uv).r * vA;
  if (a < 0.01) discard;
  vec3 c = mix(uBone * 0.75, uSig * 2.2, vHot);
  fragColor = vec4(c * a, a);
}`;

function tokenAtlas(): THREE.CanvasTexture {
  const T = 64 * SCALE,
    rows = Math.ceil(TOK_CHARS.length / AC);
  const cv = document.createElement("canvas");
  cv.width = T * AC;
  cv.height = T * rows;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#000";
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  TOK_CHARS.forEach((ch, i) => {
    const latin = /[A-Za-z0-9#{}<>]/.test(ch);
    c.font = font(latin ? F.mono(500) : F.jp(700), T * 0.72);
    c.fillText(ch, ((i % AC) + 0.5) * T, (Math.floor(i / AC) + 0.54) * T);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false; // gl_PointCoord.y runs top -> bottom, like the canvas
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export class Tokens {
  points: THREE.Points;
  mat: THREE.RawShaderMaterial;
  constructor(uniforms: Record<string, THREE.IUniform>, bone: number[], sig: number[]) {
    const NX = 170,
      NZ = 140;
    const pos = new Float32Array(NX * NZ * 3),
      gly = new Float32Array(NX * NZ),
      seed = new Float32Array(NX * NZ);
    let k = 0;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        const x = -34 + (68 * (i + hash(i, j, 1))) / NX;
        const z = 6 - (76 * (j + hash(i, j, 2))) / NZ;
        pos[k * 3] = x;
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = z;
        gly[k] = Math.floor(hash(i, j, 3) * TOK_CHARS.length);
        seed[k] = Math.floor(hash(i, j, 4) * 997);
        k++;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aGlyph", new THREE.BufferAttribute(gly, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: TOK_VERT,
      fragmentShader: TOK_FRAG,
      uniforms: {
        ...uniforms,
        uAtlas: { value: tokenAtlas() },
        uPx: { value: SCALE },
        uSize: { value: 140 },
        uTick: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBone: { value: new THREE.Vector3(...bone) },
        uSig: { value: new THREE.Vector3(...sig) },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
}

// ------------------------------------------------------------ 私 as ink points, coming apart in the water
const ME_VERT = /* glsl */ `precision highp float;
in vec3 position; in float aSeed;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
${GLSL_COMMON_VS}
${WAVE}
uniform vec3 uO; uniform float uS; uniform float uSink; uniform float uPx; uniform float uDot; uniform float uOnlyWet; uniform float uFade;
out float vA; out float vWet;
void main() {
  vec3 w = uO + vec3(position.x * uS, position.y * uS + uSink, 0.0);
  float h = wave(w.xz);
  float under = h - w.y; // > 0: the water has reached this point
  float d = sat(under * 0.55);
  // dissolved points spread out over the surface and drift with the swell, then fade into it
  vec2 dir = normalize(vec2(hash12(vec2(aSeed, 1.7)) - 0.5, hash12(vec2(aSeed, 9.1)) - 0.5) + 1e-3);
  float spread = d * (1.5 + 4.5 * hash12(vec2(aSeed, 3.3)));
  w.xz += dir * spread;
  w.y = mix(w.y, wave(w.xz) + 0.05, smoothstep(0.0, 0.6, d));
  vWet = smoothstep(-0.25, 0.15, under);
  vA = (1.0 - smoothstep(0.55, 1.0, d)) * mix(1.0, smoothstep(-0.05, 0.12, under), uOnlyWet) * uFade;
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_PointSize = uDot * uPx * (14.0 / max(-mv.z, 1.0));
  gl_Position = projectionMatrix * mv;
}`;

const ME_FRAG = /* glsl */ `precision highp float;
in float vA; in float vWet;
out vec4 fragColor;
uniform vec3 uBone; uniform vec3 uSig;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  float a = (1.0 - smoothstep(0.3, 0.5, r)) * vA;
  if (a < 0.01) discard;
  vec3 c = mix(uBone * 0.92, uSig * 2.4, vWet);
  fragColor = vec4(c * a, a);
}`;

export class Me {
  points: THREE.Points;
  mat: THREE.RawShaderMaterial;
  /** `pts`: glyph ink points in world units, origin at the glyph's bottom centre, y up. */
  constructor(
    uniforms: Record<string, THREE.IUniform>,
    pts: { x: number; y: number }[],
    bone: number[],
    sig: number[],
  ) {
    const pos = new Float32Array(pts.length * 3),
      seed = new Float32Array(pts.length);
    pts.forEach((p, i) => {
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      seed[i] = i * 0.731;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: ME_VERT,
      fragmentShader: ME_FRAG,
      uniforms: {
        ...uniforms,
        uO: { value: new THREE.Vector3() },
        uS: { value: 1 },
        uSink: { value: 0 },
        uPx: { value: SCALE },
        uDot: { value: 3.2 },
        uOnlyWet: { value: 0 },
        uFade: { value: 1 },
        uBone: { value: new THREE.Vector3(...bone) },
        uSig: { value: new THREE.Vector3(...sig) },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
}
