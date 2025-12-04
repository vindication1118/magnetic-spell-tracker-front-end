// data-access/cad/text.adapter.ts
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import { ThreeAdapter } from './three.adapter';

// Optional helper type used elsewhere in your code
export interface CharShape {
  shape: THREE.Vec2[];
  holes: THREE.Vec2[][];
  char: string;
  index: number;
}

export type ExtrudeOptions = {
  /** Depth of the text extrusion (default: 1) */
  depth?: number;
  /** Segments used by ExtrudeGeometry (default: 2) */
  steps?: number;
  /** z-rotation in degrees (default: 0) */
  rotateZDeg?: number;
  /** Translate final meshes on Y (default: 0). Positive = up */
  yTranslate?: number;
  /** Apply +90° around X so text is readable from above (default: true) */
  faceUp?: boolean;
  /** Use vertex-color debug material before converting (default: false) */
  debug?: boolean;
};

/**
 * Text/SVG helper: parses <path d="..."> content, extrudes to THREE meshes,
 * bakes transforms, then converts to Geom3 via ThreeAdapter.
 */
export class TextAdapter {
  constructor(private readonly three: ThreeAdapter) {}

  /** Parse a single SVG path string into THREE.Shape[] (one per contour). */
  shapesFromSvgPath(svgPath: string): THREE.Shape[] {
    const data = new SVGLoader().parse(svgPath);
    const shapes: THREE.Shape[] = [];
    for (const p of data.paths) {
      shapes.push(...p.toShapes(true));
    }
    return shapes;
  }

  /**
   * Extrude shapes into meshes. Use this for preview if you want Three meshes directly.
   * (We still bake world matrices so geometry is in object space.)
   */
  meshesFromSvgPath(svgPath: string, opts: ExtrudeOptions = {}): THREE.Mesh[] {
    const shapes = this.shapesFromSvgPath(svgPath);
    return this.meshesFromShapes(shapes, opts);
  }

  /** Convert SVG path → Geom3[] by extruding then converting via STL route. */
  geom3FromSvgPath(svgPath: string, opts: ExtrudeOptions = {}): Geom3[] {
    const meshes = this.meshesFromSvgPath(svgPath, opts);
    // Convert each mesh independently so characters can be booleaned individually later
    return meshes.map((m) => this.three.geom3FromThree(m));
  }

  /** Convenience: pass pre-parsed shapes (saves re-parsing if you reuse shapes). */
  meshesFromShapes(shapes: THREE.Shape[], opts: ExtrudeOptions = {}): THREE.Mesh[] {
    const {
      depth = 1,
      steps = 2,
      rotateZDeg = 0,
      yTranslate = 0,
      faceUp = true,
      debug = false,
    } = opts;

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps,
      depth,
      bevelEnabled: false,
      bevelThickness: 0,
      bevelSize: 0,
      bevelOffset: 0,
      bevelSegments: 0,
    };

    const material = debug
      ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.65 })
      : new THREE.MeshStandardMaterial({ color: 0x00ff00 });

    const meshes: THREE.Mesh[] = [];

    for (const shape of shapes) {
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, material);

      // Match your previous orientation: readable from +Z (top view)
      if (faceUp) mesh.rotation.x = Math.PI / 2;
      if (rotateZDeg) mesh.rotation.z = (rotateZDeg * Math.PI) / 180;
      if (yTranslate) mesh.position.y = yTranslate;

      // Bake transforms so the geometry is “final”
      mesh.updateMatrix();
      this.three.bakeWorldMatrix(mesh);

      meshes.push(mesh);
    }
    return meshes;
  }

  /**
   * Extract CharShape[] (your data format) from an SVG path.
   * Useful for Voronoi pipeline / GPU ops that need flat 2D coordinates.
   */
  charShapesFromSvgPath(svgPath: string, char: string, index: number): CharShape[] {
    const shapes = this.shapesFromSvgPath(svgPath);
    return shapes.map((shape) => {
      const pts = shape.extractPoints(5); // keep step consistent with your current code
      return {
        shape: pts.shape,
        holes: pts.holes,
        char,
        index,
      };
    });
  }

  // Optional small utilities if you still use them elsewhere:

  /** Flatten shape + holes to [x,y] array (for D3, etc.). */
  flattenShapeCoords(shape: { shape: THREE.Vec2[]; holes: THREE.Vec2[][] }): [number, number][] {
    const out: [number, number][] = [];
    for (const pt of shape.shape) out.push([pt.x, pt.y]);
    for (const hole of shape.holes) for (const pt of hole) out.push([pt.x, pt.y]);
    return out;
  }

  /**
   * Build a divot box Geom3 aligned to an extruded text mesh’s baked bounding box.
   * Use this to generate the cut volume for engraving.
   */
  divotBoxFromBakedMesh(mesh: THREE.Mesh, extraDepth = 0): Geom3 {
    // Expect mesh already baked via three.bakeWorldMatrix()
    const bbox = (mesh.geometry as THREE.BufferGeometry).boundingBox ?? (() => {
      (mesh.geometry as THREE.BufferGeometry).computeBoundingBox();
      return (mesh.geometry as THREE.BufferGeometry).boundingBox!;
    })();

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);

    // Make Y the "depth" dimension for the divot (same as your previous BoxGeometry placement)
    const lx = size.x;
    const ly = size.z + extraDepth; // swap because text was rotated face-up (X => X, Z => Y thickness)
    const lz = size.y;

    const divot = new THREE.Mesh(
      new THREE.BoxGeometry(lx, ly, lz),
      new THREE.MeshBasicMaterial({ color: 0x0000ff })
    );
    // put its center where the baked text’s center lies, then push slightly “down” (negative Y) if needed
    divot.position.set(center.x, center.y - extraDepth / 2, center.z);
    divot.updateMatrix();
    this.three.bakeWorldMatrix(divot);

    return this.three.geom3FromThree(divot);
  }
}
