// data-access/cad/three.adapter.ts
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as deserialize from '@jscad/stl-deserializer';
import * as serialize from '@jscad/stl-serializer';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import { Manifold } from 'manifold-3d';
import { ArrayBufferHelper } from '../../utils/Array-Buffer-Helper';

/** Optional manifold glue if you want Three <-> Manifold here too. */
export interface ManifoldBridge {
  manifoldToThree(m: Manifold, material: THREE.Material): THREE.Mesh; // Manifold → THREE.Mesh
  threeToManifold(mesh: THREE.Mesh): Manifold; // THREE.Mesh → Manifold
}

export type MeshFromGeomOptions = {
  color?: number;
  debug?: boolean; // random vertex face colors
  wireframe?: boolean;
  material?: THREE.Material; // overrides color/debug/wireframe
};

export class ThreeAdapter {
  private exporter: STLExporter;
  private loader: STLLoader;
  private manifold?: ManifoldBridge;

  constructor(opts?: {
    exporter?: STLExporter;
    loader?: STLLoader;
    manifold?: ManifoldBridge;
  }) {
    this.exporter = opts?.exporter ?? new STLExporter();
    this.loader = opts?.loader ?? new STLLoader();
    this.manifold = opts?.manifold;
  }

  /** Apply world matrix into geometry and reset transform. */
  bakeWorldMatrix(mesh: THREE.Mesh): void {
    mesh.updateMatrixWorld(true);
    const m = mesh.matrixWorld.clone();
    const g = mesh.geometry as THREE.BufferGeometry;
    g.applyMatrix4(m);
    mesh.matrix.identity();
    mesh.matrixWorld.identity();
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    g.computeVertexNormals();
  }

  /** THREE.Mesh -> Geom3 (via STL binary export). */
  geom3FromThree(mesh: THREE.Mesh): Geom3 {
    const out = this.exporter.parse(mesh, { binary: true });
    const u8 = normalizeToUint8Array(out);
    return deserialize.deserialize({ output: 'geometry' }, u8) as Geom3;
  }

  /** Geom3 or Geom3[] -> THREE.Mesh[] (via STL binary). */
  meshesFromGeom3(
    geom: Geom3 | Geom3[],
    options: MeshFromGeomOptions = {},
  ): THREE.Mesh[] {
    const geoms = Array.isArray(geom) ? geom : [geom];
    const meshes: THREE.Mesh[] = [];

    for (const g of geoms) {
      const u8 = serialize.serialize({ binary: true }, g) as unknown; // bytes-like
      const bytes = normalizeToUint8Array(u8);
      // STLLoader.parse requires an ArrayBuffer whose byte range is exact:
      const ab: ArrayBuffer = ArrayBufferHelper.toArrayBuffer(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const tGeo = this.loader.parse(ab);

      const mat =
        options.material ??
        (options.debug
          ? debugFaceColorMaterial(tGeo)
          : new THREE.MeshStandardMaterial({
              color: options.color ?? 0xffffff,
              wireframe: !!options.wireframe,
              transparent: !!options.debug || !!options.wireframe,
              opacity: options.debug || options.wireframe ? 0.65 : 1,
              vertexColors: (options.debug = true),
            }));

      meshes.push(new THREE.Mesh(tGeo, mat));
    }
    return meshes;
  }

  /** Manifold -> THREE.Mesh (needs a bridge; optional). */
  meshFromManifold(m: Manifold, material?: THREE.Material): THREE.Mesh {
    if (!this.manifold)
      throw new Error('ThreeAdapter: no ManifoldBridge provided.');
    return this.manifold.manifoldToThree(
      m,
      material ?? new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
  }

  /** THREE.Mesh -> Manifold (needs a bridge; optional). */
  manifoldFromThree(mesh: THREE.Mesh): Manifold {
    if (!this.manifold)
      throw new Error('ThreeAdapter: no ManifoldBridge provided.');
    return this.manifold.threeToManifold(mesh);
  }
}

/** Ensure we end up with a Uint8Array backed by a plain ArrayBuffer (not SAB). */
function normalizeToUint8Array(out: unknown): Uint8Array {
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (ArrayBuffer.isView(out)) {
    const view = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    return new Uint8Array(view); // copy → ArrayBuffer-backed
  }
  if (typeof out === 'string') return new TextEncoder().encode(out);
  throw new Error('Unexpected STL payload type');
}

/** Builds a per-face random-color material (mutates geometry to add color attribute). */
function debugFaceColorMaterial(geom: THREE.BufferGeometry): THREE.Material {
  const pos = geom.getAttribute('position');
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    color.set(Math.random() * (0xeeeeee - 0xaaaaaa) + 0xaaaaaa);
    for (let v = 0; v < 3; v++) colors.push(color.r, color.g, color.b);
  }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
  });
}
