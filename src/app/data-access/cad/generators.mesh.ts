import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import { ThreeAdapter } from './three.adapter';

const three = new ThreeAdapter();

export function boxGeom3(
  size: [number, number, number],
  center: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
): Geom3 {
  const [x, y, z] = size;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(x, y, z),
    new THREE.MeshStandardMaterial(),
  );
  mesh.position.set(...center);
  mesh.rotation.set(...rotation);
  mesh.updateMatrix();
  three.bakeWorldMatrix(mesh);
  return three.geom3FromThree(mesh);
}

export function cylinderGeom3(
  r: number,
  h: number,
  center: [number, number, number] = [0, 0, 0],
  radialSegments = 32,
  rotation: [number, number, number] = [0, 0, 0],
): Geom3 {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, radialSegments),
    new THREE.MeshStandardMaterial(),
  );
  mesh.position.set(...center);
  mesh.rotation.set(...rotation);
  mesh.updateMatrix();
  three.bakeWorldMatrix(mesh);
  return three.geom3FromThree(mesh);
}

export function roundedSlotGeom3(
  length: number,
  radius: number,
  height: number,
  center: [number, number, number] = [0, 0, 0],
  axis: 'X' | 'Z' = 'Z',
): Geom3 {
  const endCap = new THREE.CylinderGeometry(radius, radius, height, 32);
  const mid =
    axis === 'Z'
      ? new THREE.BoxGeometry(2 * radius, height, length - 2 * radius)
      : new THREE.BoxGeometry(length - 2 * radius, height, 2 * radius);
  const material = new THREE.MeshStandardMaterial();

  const midMesh = new THREE.Mesh(mid, material);
  const cap1 = new THREE.Mesh(endCap, material);
  const cap2 = new THREE.Mesh(endCap, material);

  if (axis === 'Z') {
    cap1.position.set(0, 0, -length / 2 + radius);
    cap2.position.set(0, 0, length / 2 - radius);
  } else {
    cap1.rotation.z = Math.PI / 2;
    cap2.rotation.z = Math.PI / 2;
    cap1.position.set(-length / 2 + radius, 0, 0);
    cap2.position.set(length / 2 - radius, 0, 0);
  }

  midMesh.position.set(...center);
  cap1.position.add(new THREE.Vector3(...center));
  cap2.position.add(new THREE.Vector3(...center));

  midMesh.updateMatrix();
  cap1.updateMatrix();
  cap2.updateMatrix();

  const mergedGeom = BufferGeometryUtils.mergeGeometries(
    [
      midMesh.geometry.clone().applyMatrix4(midMesh.matrix),
      cap1.geometry.clone().applyMatrix4(cap1.matrix),
      cap2.geometry.clone().applyMatrix4(cap2.matrix),
    ],
    false,
  );

  const merged = new THREE.Mesh(mergedGeom, material);
  merged.updateMatrix();
  three.bakeWorldMatrix(merged);
  return three.geom3FromThree(merged);
}
