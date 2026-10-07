// Extruded engraved Japanese display type for m01/m06 (コード, クロの, 踊る, まだ).
// Each glyph is its own mesh (ExtrudeGeometry from the font outline), pivoted at the bottom centre
// of its ink box so it can stand up from the floor like a hinged plate. Units: 1 em = `em` world.
import * as THREE from 'three';
import { layout, textPathCommands } from '../engine/type';
import { engraveMaterial, MODE, type EngraveOpts } from './m01-engrave';

export interface Glyph3D {
  ch: string;
  mesh: THREE.Mesh;
  /** Pivot (bottom centre of ink) in the word's local frame. */
  x: number;
  /** Ink width in world units. */
  w: number;
  h: number;
  mat: THREE.RawShaderMaterial;
}

function glyphShapes(ch: string, family: string): { shapes: THREE.Shape[]; x0: number; x1: number; y0: number; y1: number } {
  const cmds = textPathCommands(ch, family, 1, 0, 0);
  const sp = new THREE.ShapePath();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const P = (x: number, y: number) => {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, -y); y1 = Math.max(y1, -y);
  };
  for (const c of cmds) {
    if (c.type === 'M') { sp.moveTo(c.x, -c.y); P(c.x, c.y); }
    else if (c.type === 'L') { sp.lineTo(c.x, -c.y); P(c.x, c.y); }
    else if (c.type === 'Q') { sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y); P(c.x, c.y); }
    else if (c.type === 'C') { sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y); P(c.x, c.y); }
  }
  // toShapes() sorts solids/holes by winding (CFF outlines: solids CCW once y points up again)
  return { shapes: sp.toShapes(), x0, x1, y0, y1 };
}

export class Word3D {
  group = new THREE.Group();
  glyphs: Glyph3D[] = [];
  width = 0;
  constructor(text: string, family: string, em: number, depth: number, mat: EngraveOpts = { mode: MODE.EXTRUDE }) {
    const lay = layout(text, family, 1);
    this.width = lay.width * em;
    const ox = -this.width / 2;
    lay.glyphs.forEach((g) => {
      const { shapes, x0, x1, y0, y1 } = glyphShapes(g.ch, family);
      const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: depth / em,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.008,
        bevelSegments: 2,
        curveSegments: 8,
      });
      const cx = (x0 + x1) / 2;
      // pivot: bottom centre of the ink, depth centred
      geo.translate(-cx, -y0, -depth / em / 2);
      geo.scale(em, em, em);
      geo.computeVertexNormals();
      const m = engraveMaterial({ ...mat, freq: (mat.freq ?? 26) / em });
      const mesh = new THREE.Mesh(geo, m);
      const gx = ox + (g.x + cx) * em;
      mesh.position.set(gx, 0, 0);
      this.group.add(mesh);
      this.glyphs.push({ ch: g.ch, mesh, x: gx, w: (x1 - x0) * em, h: (y1 - y0) * em, mat: m });
    });
  }

  /**
   * Stand-up animation of glyph i: k = 0 lying flat face-up on the floor (hinged at its base,
   * falling back), 1 upright. `hot` 0..1 tints the burin lines signal (fresh glyph).
   */
  stand(i: number, k: number, hot = 0) {
    const g = this.glyphs[i]!;
    g.mesh.visible = k > 0.001;
    g.mesh.position.set(g.x, 0, 0);
    g.mesh.rotation.set(-(1 - k) * Math.PI * 0.5, 0, 0);
    g.mat.uniforms.hot!.value = hot;
  }

  /**
   * Fly-in of glyph i: k = 0 far behind (`depth` world units back, raised and turned away),
   * 1 in place. Pass an eased k (0.15–0.3 s ease-out reads as a slam).
   */
  fly(i: number, k: number, hot = 0, depth = 8, side = 1) {
    const g = this.glyphs[i]!;
    const r = 1 - k;
    g.mesh.visible = k > 0.001;
    g.mesh.position.set(g.x + side * r * 1.2, r * 1.6, -r * depth);
    g.mesh.rotation.set(-r * 0.5, side * r * 1.4, 0);
    g.mat.uniforms.hot!.value = hot;
  }
}
