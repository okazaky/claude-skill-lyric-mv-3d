// m06 turntable: a big engraved vinyl disc (grooves with a world-fixed sheen, label with an orange
// ring and a bone index mark that turns with the record) on a thin engraved plinth ring.
import * as THREE from 'three';
import { discMaterial } from './m01-engrave';

export class Vinyl {
  group = new THREE.Group();
  disc: THREE.Mesh;
  mat: THREE.RawShaderMaterial;
  constructor(public R = 3, public thick = 0.12) {
    this.mat = discMaterial(R, R * 0.3);
    const geo = new THREE.CylinderGeometry(R, R, thick, 192, 1);
    geo.translate(0, thick / 2, 0);
    this.disc = new THREE.Mesh(geo, this.mat);
    this.group.add(this.disc);
  }
  /** Top surface height. */
  get top() { return this.thick; }
  set(spin: number, cam: THREE.Camera) {
    this.disc.rotation.y = spin;
    (this.mat.uniforms.camPos!.value as THREE.Vector3).copy(cam.position);
    (this.mat.uniforms.centre!.value as THREE.Vector3).copy(this.group.position);
  }
}
