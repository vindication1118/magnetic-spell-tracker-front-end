// data-access/cad/boolean.adapter.ts
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import * as jscadBool from '@jscad/modeling/src/operations/booleans';
import * as THREE from 'three';
import { ThreeAdapter, ManifoldBridge } from './three.adapter';

export type BooleanEngine = 'jscad' | 'manifold';

/** Minimal bridge the adapter needs if you want Manifold-backed booleans. */
export interface ManifoldOps extends ManifoldBridge {
  union(a: any, b: any): any;
  subtract(a: any, b: any): any;
  intersect(a: any, b: any): any;
  /** Optional: called on results to clean topology (e.g., m.genus()) */
  finalize?(m: any): any;
}

export class BooleanAdapter {
  private engine: BooleanEngine;
  private manifold?: ManifoldOps;
  private three: ThreeAdapter;

  constructor(opts: { engine?: BooleanEngine; manifold?: ManifoldOps; three: ThreeAdapter }) {
    this.engine = opts.engine ?? (opts.manifold ? 'manifold' : 'jscad');
    this.manifold = opts.manifold;
    this.three = opts.three;
  }

  union(...parts: Geom3[]): Geom3 {
    if (this.engine === 'manifold' && this.manifold) {
      return this.unionManifold(parts);
    }
    return jscadBool.union(parts as any) as unknown as Geom3;
  }

  subtract(a: Geom3, b: Geom3): Geom3 {
    if (this.engine === 'manifold' && this.manifold) {
      return this.subtractManifold(a, b);
    }
    return jscadBool.subtract(a as any, b as any) as unknown as Geom3;
  }

  intersect(...parts: Geom3[]): Geom3 {
    if (this.engine === 'manifold' && this.manifold) {
      return this.intersectManifold(parts);
    }
    return jscadBool.intersect(parts as any) as unknown as Geom3;
  }

  // ---------- Manifold-backed path ----------
  private unionManifold(parts: Geom3[]): Geom3 {
    const manifolds = parts.map((g) => this.geom3ToManifold(g));
    let acc = manifolds[0];
    for (let i = 1; i < manifolds.length; i++) {
      acc = this.manifold!.union(acc, manifolds[i]);
      acc = this.manifold!.finalize ? this.manifold!.finalize(acc) : acc;
    }
    return this.manifoldToGeom3(acc);
  }

  private subtractManifold(a: Geom3, b: Geom3): Geom3 {
    let mA = this.geom3ToManifold(a);
    const mB = this.geom3ToManifold(b);
    mA = this.manifold!.subtract(mA, mB);
    mA = this.manifold!.finalize ? this.manifold!.finalize(mA) : mA;
    return this.manifoldToGeom3(mA);
  }

  private intersectManifold(parts: Geom3[]): Geom3 {
    const manifolds = parts.map((g) => this.geom3ToManifold(g));
    let acc = manifolds[0];
    for (let i = 1; i < manifolds.length; i++) {
      acc = this.manifold!.intersect(acc, manifolds[i]);
      acc = this.manifold!.finalize ? this.manifold!.finalize(acc) : acc;
    }
    return this.manifoldToGeom3(acc);
  }

  // Convert through Three: Geom3 -> THREE -> Manifold -> (ops) -> THREE -> Geom3
  private geom3ToManifold(g: Geom3): any {
    const meshes = this.three.meshesFromGeom3(g, { color: 0xffffff });
    if (meshes.length !== 1) throw new Error('Expected geom3 -> single mesh for manifold conversion');
    return this.manifold!.threeToManifold(meshes[0]);
  }

  private manifoldToGeom3(m: any): Geom3 {
    const mesh = this.manifold!.manifoldToThree(m, new THREE.MeshStandardMaterial({ color: 0xffffff }));
    return this.three.geom3FromThree(mesh);
  }
}
