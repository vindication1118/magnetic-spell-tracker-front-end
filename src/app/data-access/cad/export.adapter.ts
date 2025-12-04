import JSZip from 'jszip';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export async function zipSceneMeshes(scene: THREE.Scene): Promise<Blob> {
  const exporter = new STLExporter();
  const zip = new JSZip();
  const counts: Record<string, number> = {};

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const name = obj.name || 'mesh';
    counts[name] = (counts[name] ?? 0) + 1;
    const stl = exporter.parse(obj); // string OK for JSZip
    zip.file(`${name}.stl`, stl);
  });

  const readme = Object.entries(counts)
    .map(([name, n]) => `${name}.stl: print ${n} time(s)`)
    .join('\n');
  zip.file('README.md', readme + '\n');

  return zip.generateAsync({ type: 'blob' });
}
