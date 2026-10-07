// m09 helper: the MOON as a real 3D sphere mesh, shaded as a woodcut — bone hatch lines that follow the
// sphere's latitude (curving with the surface) weighted by the light, sparse graphite meridian cross-lines
// on the shadow side, and a thin signal rim (fresnel hairline). Same family as the AIと私 sun sphere.
import * as THREE from "three";
import { GLSL_COMMON } from "../engine/glsl/common";

const VERT = /* glsl */ `precision highp float;
in vec3 position; in vec3 normal;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
out vec3 vO; out vec3 vN; out vec3 vW;
void main() {
  vO = normal;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `precision highp float;
${GLSL_COMMON}
in vec3 vO; in vec3 vN; in vec3 vW; out vec4 fragColor;
uniform vec3 uCam; uniform float uOpacity, uRim, uFreq;
void main() {
  vec3 n = normalize(vN);
  vec3 o = normalize(vO);
  float lam = sat(dot(n, normalize(vec3(-0.45, 0.5, 0.75))));
  float lat = asin(clamp(o.y, -1.0, 1.0));
  float lines = hatch(lat * uFreq, mix(0.06, 0.78, lam));
  float mer = atan(o.x, o.z) * 7.0;
  float cross2 = hatchD(mer, 0.25 * smoothstep(0.35, 0.05, lam), fwidth(o.x) * 7.0 / max(abs(o.z), 0.2));
  vec3 V = normalize(uCam - vW);
  float fres = 1.0 - abs(dot(n, V));
  float rim = smoothstep(0.82, 0.97, fres);
  vec3 col = C_INK * 0.6 + C_BONE * 0.55 * lines + C_GRAPHITE * 0.25 * cross2 + C_SIGNAL * uRim * rim;
  fragColor = vec4(col, 1.0) * uOpacity;
}`;

export class Moon {
  mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uOpacity: { value: 1 },
      uRim: { value: 1 },
      uFreq: { value: 11 },
    },
    transparent: true,
    depthTest: true,
    depthWrite: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.mat);
  constructor() {
    this.mesh.frustumCulled = false;
  }
  update(cam: THREE.Camera, x: number, y: number, z: number, r: number, spin: number, tilt = 0.5, opacity = 1) {
    this.mesh.position.set(x, y, z);
    this.mesh.scale.setScalar(r);
    this.mesh.rotation.set(tilt, spin, 0);
    (this.mat.uniforms.uCam!.value as THREE.Vector3).copy((cam as THREE.PerspectiveCamera).position);
    this.mat.uniforms.uOpacity!.value = opacity;
  }
}
