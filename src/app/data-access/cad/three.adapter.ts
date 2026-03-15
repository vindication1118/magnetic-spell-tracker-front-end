// data-access/cad/three.adapter.ts
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as deserialize from '@jscad/stl-deserializer';
import * as serialize from '@jscad/stl-serializer';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

import { Manifold } from 'manifold-3d';
import { geometries } from '@jscad/modeling';

export interface Geom3ToMeshesOptions {
  material?: THREE.Material;
  color?: number;
  debug?: boolean;
}

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
  borkedMeshesFromGeom3(
    geom: Geom3 | Geom3[],
    options: MeshFromGeomOptions = {},
  ): THREE.Mesh[] {
    const geoms = Array.isArray(geom) ? geom : [geom];
    const meshes: THREE.Mesh[] = [];
    console.log(geoms);

    for (const g of geoms) {
      console.log(g);
      const u8 = serialize.serialize({ binary: true }, g) as unknown; // bytes-like
      const bytes = normalizeToUint8Array(u8);
      // STLLoader.parse requires an ArrayBuffer whose byte range is exact:
      const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
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
              vertexColors: !!options.debug,
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

  /**
   * Convert one JSCAD Geom3 to a Three.js mesh by round-tripping through STL.
   */
  async geom3ToThreeMeshViaStl(
    solid: Geom3,
    options: MeshFromGeomOptions,
  ): Promise<THREE.Mesh> {
    const loader = new STLLoader();

    // JSCAD STL serializer returns "blobable" parts.
    // Binary STL is usually the better choice here.
    const stlParts = serialize({ binary: true }, solid) as BlobPart[];

    const stlBlob = new Blob(stlParts, { type: 'model/stl' });
    const stlArrayBuffer = await stlBlob.arrayBuffer();

    const geometry = loader.parse(stlArrayBuffer);

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mat =
      options.material ??
      (options.debug
        ? debugFaceColorMaterial(geometry)
        : new THREE.MeshStandardMaterial({
            color: options.color ?? 0xffffff,
            wireframe: !!options.wireframe,
            transparent: !!options.debug || !!options.wireframe,
            opacity: options.debug || options.wireframe ? 0.65 : 1,
            vertexColors: !!options.debug,
          }));

    const mesh = new THREE.Mesh(geometry, mat);

    return mesh;
  }

  /**
   * Convert an array of JSCAD Geom3 solids into an array of Three.js meshes.
   *
   * Notes:
   * - Uses geom3.toPolygons() so any lazy JSCAD transforms are applied.
   * - Triangulates each polygon with a triangle fan.
   * - Assumes polygons are valid JSCAD geom3 faces.
   */
  public meshesFromGeom3(
    solids: Geom3[] | Geom3,
    options: Geom3ToMeshesOptions = {},
  ): THREE.Mesh[] {
    const solidsArray = Array.isArray(solids) ? solids : [solids];
    const { material, color = 0xffffff, debug = true } = options;

    return solidsArray.map((solid) =>
      this.geom3ToThreeMesh(solid, { material, color, debug }),
    );
  }

  /**
   * Convert a single JSCAD Geom3 into a Three.js mesh.
   */
  public geom3ToThreeMesh(
    solid: Geom3,
    options: Geom3ToMeshesOptions = {},
  ): THREE.Mesh {
    const { material, color = 0xffffff, debug = true } = options;
    if (debug) {
      console.log('debug set to true, deal with it later');
    }

    // JSCAD applies transforms lazily, so toPolygons() is the right readout path.
    const polygons = geometries.geom3.toPolygons(solid);

    const positions: number[] = [];

    for (const polygon of polygons) {
      const verts = polygon.vertices;
      if (!verts || verts.length < 3) continue;

      // Triangle fan:
      // [0,1,2], [0,2,3], [0,3,4], ...
      const v0 = verts[0];

      for (let i = 1; i < verts.length - 1; i++) {
        const v1 = verts[i];
        const v2 = verts[i + 1];

        positions.push(
          v0[0],
          v0[1],
          v0[2],
          v1[0],
          v1[1],
          v1[2],
          v2[0],
          v2[1],
          v2[2],
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    let meshMaterial: THREE.Material;

    if (material) {
      meshMaterial = material.clone();
    } else {
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999,
        side: THREE.DoubleSide,
      });

      if (color && Array.isArray(solid.color) && solid.color.length >= 3) {
        const [r, g, b, a = 1] = solid.color as [
          number,
          number,
          number,
          number?,
        ];
        baseMaterial.color = new THREE.Color(r, g, b);
        baseMaterial.transparent = a < 1;
        baseMaterial.opacity = a;
      }

      meshMaterial = baseMaterial;
    }

    return new THREE.Mesh(geometry, meshMaterial);
  }
}

function mergeArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  // Compute total length
  const totalLength = buffers.reduce(
    (sum, buffer) => sum + buffer.byteLength,
    0,
  );

  // Allocate destination buffer
  const mergedBuffer = new ArrayBuffer(totalLength);
  const mergedView = new Uint8Array(mergedBuffer);

  // Copy each buffer into the result
  let offset = 0;
  for (const buffer of buffers) {
    const view = new Uint8Array(buffer);
    mergedView.set(view, offset);
    offset += view.length;
  }

  return mergedBuffer;
}

/** Ensure we end up with a Uint8Array backed by a plain ArrayBuffer (not SAB). */
function normalizeToUint8Array(out: unknown): Uint8Array {
  if (out instanceof ArrayBuffer) {
    console.log('Instance of ArrayBuffer');
    console.log(out);
    return new Uint8Array(out);
  }
  if (out instanceof Array) {
    console.log('Its an array');
    console.log(out);
    const mergedOut = mergeArrayBuffers(
      out,
    ) as unknown as Uint8Array<ArrayBufferLike>;
    return mergedOut;
  }
  if (ArrayBuffer.isView(out)) {
    console.log('Arraybuffer is an instance of a view i guess?');
    console.log(out);
    const view = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    return new Uint8Array(view); // copy → ArrayBuffer-backed
  }
  if (typeof out === 'string') {
    console.log('arraybuffer is a string');
    console.log(out);
    return new TextEncoder().encode(out);
  }
  console.log('throwing an error');
  console.log(out);
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
