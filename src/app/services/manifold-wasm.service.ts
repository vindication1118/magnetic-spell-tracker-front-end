/* eslint-disable @typescript-eslint/no-explicit-any */
// wasm-loader.service.ts
import { Injectable } from '@angular/core';
import Module, { Manifold, ManifoldToplevel, Mesh } from 'manifold-3d';
import * as THREE from 'three';
@Injectable({
  providedIn: 'root',
})
export class ManifoldWasmService {
  private wasmInstance: WebAssembly.Instance | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private manifold: any | null = null;
  private mesh: any | null = null;
  private wasmLoaded = false;
  public wasm!: ManifoldToplevel;
  // Define our set of materials
  private materials = [
    new THREE.MeshNormalMaterial(),
    //new THREE.MeshLambertMaterial({ color: 'red' }),
    //new THREE.MeshLambertMaterial({ color: 'blue' }),
    new THREE.MeshNormalMaterial(),
    new THREE.MeshNormalMaterial(),
  ];

  // Set up Manifold IDs corresponding to materials
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private firstID!: any;
  // ids vector is parallel to materials vector - same indexing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ids!: any[];
  // Build a mapping to get back from ID to material index
  private id2matIndex = new Map();

  constructor() {
    this.loadWasm();
  }

  async init(): Promise<void> {
    if (!this.wasmLoaded) {
      await this.loadWasm();
    }
  }

  // Function to load the WASM module
  async loadWasmModule(url: string): Promise<WebAssembly.Instance> {
    if (this.wasmInstance) {
      return this.wasmInstance;
    }

    try {
      // Fetch the WASM file
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();

      // Compile and instantiate the WASM module
      const wasmModule = await WebAssembly.compile(buffer);
      const wasmInstance = await WebAssembly.instantiate(wasmModule, {});

      this.wasmInstance = wasmInstance;
      return this.wasmInstance;
    } catch (error) {
      console.error('Error loading WASM module:', error);
      throw error;
    }
  }

  // Example function to call a WASM function
  callWasmFunction(functionName: string, ...args: unknown[]) {
    if (!this.wasmInstance) {
      throw new Error('WASM module not loaded');
    }

    const wasmFunction = this.wasmInstance.exports[functionName];
    if (typeof wasmFunction !== 'function') {
      throw new Error(`Function ${functionName} not found in WASM module`);
    }

    return wasmFunction(...args);
  }

  private async loadWasm(): Promise<boolean> {
    try {
      // Explicitly set the path to the WASM file
      console.log('Retrieving Wasm');
      this.wasm = await Module({
        locateFile: () => {
          return `/assets/wasm/manifold.wasm`; // Ensure this matches the location where your wasm is served
        },
      });
      console.log('Setting up manifold.wasm');
      this.wasm.setup();
      console.log('Setting this.manifold');
      const myTestVal = this.wasm.Manifold;
      console.log(typeof myTestVal);
      this.manifold = myTestVal;
      console.log('Setting this.mesh');
      this.mesh = this.wasm.Mesh;
      this.wasmLoaded = true;
      console.log('Loaded manifold wasm');
      this.firstID = await this.manifold.reserveIDs(this.materials.length);
      this.ids = [...Array<number>(this.materials.length)].map(
        (_, idx) => this.firstID + idx,
      );
      this.ids.forEach((id, idx) => this.id2matIndex.set(id, idx));
      return true;
    } catch (error) {
      console.error('Failed to load manifold-3d:', error);
      return false;
    }
  }

  // Method to check if the WASM is loaded
  public isWasmLoaded(): boolean {
    return this.wasmLoaded;
  }

  // Example method to access Manifold functionalities
  public getManifoldInstance() {
    console.log('Getting Manifold Instance');
    if (!this.wasmLoaded || !this.manifold) {
      throw new Error('Manifold-3D WASM module is not loaded yet.');
    }
    console.log('returning new manifold instance');
    return this.manifold;
  }

  public getMeshInstance() {
    if (!this.wasmLoaded || !this.mesh) {
      throw new Error('Manifold-3D WASM module is not loaded yet.');
    }
    return this.mesh;
  }

  // Convert Three.js BufferGeometry to Manifold Mesh
  public geometry2mesh(geometry: THREE.BufferGeometry): Mesh {
    // Only using position in this sample for simplicity. Can interleave any other
    // desired attributes here such as UV, normal, etc.
    const vertProperties = geometry.attributes['position']
      .array as Float32Array;
    // Manifold only uses indexed geometry, so generate an index if necessary.
    const triVerts =
      geometry.index != null
        ? (geometry.index.array as Uint32Array)
        : new Uint32Array(vertProperties.length / 3).map((_, idx) => idx);
    // Create a triangle run for each group (material) - akin to a draw call.
    const starts = [...Array(geometry.groups.length)].map(
      (_, idx) => geometry.groups[idx].start,
    );
    // Map the materials to ID.
    const originalIDs = [...Array(geometry.groups.length)].map(
      (_, idx) => this.ids[geometry.groups[idx].materialIndex!],
    );
    // List the runs in sequence.
    const indices = Array.from(starts.keys());
    indices.sort((a, b) => starts[a] - starts[b]);
    const runIndex = new Uint32Array(indices.map((i) => starts[i]));
    const runOriginalID = new Uint32Array(indices.map((i) => originalIDs[i]));
    // Create the MeshGL for I/O with Manifold library.
    const mesh = new this.wasm.Mesh({
      numProp: 3,
      vertProperties,
      triVerts,
      runIndex,
      runOriginalID,
    });
    // Automatically merge vertices with nearly identical positions to create a
    // Manifold. This only fills in the mergeFromVert and mergeToVert vectors -
    // these are automatically filled in for any mesh returned by Manifold. These
    // are necessary because GL drivers require duplicate verts when any
    // properties change, e.g. a UV boundary or sharp corner.
    mesh.merge();

    return mesh;
  }

  public mesh2Manifold(mesh: Mesh): Manifold {
    const mani = new this.wasm.Manifold(mesh);
    //console.log('Is it a Manifold?');
    //console.log(mani instanceof Manifold);
    return mani;
  }

  public manifold2Mesh(manifold: Manifold): Mesh {
    return manifold.getMesh();
  }

  public csgUnion(manifold1: Manifold, manifold2: Manifold): Manifold {
    const result = this.wasm.Manifold['union'](manifold1, manifold2);
    return result;
  }

  public csgSubtraction(manifold1: Manifold, manifold2: Manifold): Manifold {
    const result = this.wasm.Manifold['difference'](manifold1, manifold2);
    return result;
  }

  public csgIntersection(manifold1: Manifold, manifold2: Manifold): Manifold {
    const result = this.wasm.Manifold['intersection'](manifold1, manifold2);
    return result;
  }

  public threeMesh2manifold(tMesh: THREE.Mesh): Manifold {
    const tGeo = tMesh.geometry;
    const mMesh = this.geometry2mesh(tGeo);
    const mManifold = this.mesh2Manifold(mMesh);
    return mManifold;
  }

  public manifold2ThreeMesh(
    mManifold: Manifold,
    material: THREE.Material,
  ): THREE.Mesh {
    const mMesh = this.manifold2Mesh(mManifold);
    mMesh.merge();
    const tGeo = this.mesh2geometry(mMesh);
    const result = new THREE.Mesh(tGeo, material);
    return result;
  }

  // m indicates manifold-3d type, t indicates threejs type
  public threeUnion(
    threeMesh1: THREE.Mesh,
    threeMesh2: THREE.Mesh,
  ): THREE.Mesh {
    const mManifold1 = this.threeMesh2manifold(threeMesh1);
    const mManifold2 = this.threeMesh2manifold(threeMesh2);
    const unionManifold = this.csgUnion(mManifold1, mManifold2);
    const unionThreeMesh = this.manifold2ThreeMesh(
      unionManifold,
      new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true }),
    );
    return unionThreeMesh;
  }

  // m indicates manifold-3d type, t indicates threejs type
  public threeSubtraction(
    threeMesh1: THREE.Mesh,
    threeMesh2: THREE.Mesh,
  ): THREE.Mesh {
    const mManifold1 = this.threeMesh2manifold(threeMesh1);
    const mManifold2 = this.threeMesh2manifold(threeMesh2);
    const unionManifold = this.csgSubtraction(mManifold1, mManifold2);
    const unionThreeMesh = this.manifold2ThreeMesh(
      unionManifold,
      new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true }),
    );
    return unionThreeMesh;
  }

  // m indicates manifold-3d type, t indicates threejs type
  public threeIntersection(
    threeMesh1: THREE.Mesh,
    threeMesh2: THREE.Mesh,
  ): THREE.Mesh {
    const mManifold1 = this.threeMesh2manifold(threeMesh1);
    const mManifold2 = this.threeMesh2manifold(threeMesh2);
    const unionManifold = this.csgIntersection(mManifold1, mManifold2);
    const unionThreeMesh = this.manifold2ThreeMesh(
      unionManifold,
      new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true }),
    );
    return unionThreeMesh;
  }
  // Convert Manifold Mesh to Three.js BufferGeometry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public mesh2geometry(mesh: Mesh): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    // Assign buffers
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(mesh.vertProperties, 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
    // Create a group (material) for each ID. Note that there may be multiple
    // triangle runs returned with the same ID, though these will always be
    // sequential since they are sorted by ID. In this example there are two runs
    // for the MeshNormalMaterial, one corresponding to each input mesh that had
    // this ID. This allows runTransform to return the total transformation matrix
    // applied to each triangle run from its input mesh - even after many
    // consecutive operations.
    let id = mesh.runOriginalID[0];
    let start = mesh.runIndex[0];
    for (let run = 0; run < mesh.numRun; ++run) {
      const nextID = mesh.runOriginalID[run + 1];
      if (nextID !== id) {
        const end = mesh.runIndex[run + 1];
        geometry.addGroup(start, end - start, this.id2matIndex.get(id));
        id = nextID;
        start = end;
      }
    }
    return geometry;
  }
}
