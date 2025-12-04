import { AssemblyService } from '../../features/tracker/assembly.service';
import { ThreeAdapter } from '../../data-access/cad/three.adapter';
import { BooleanAdapter } from '../../data-access/cad/boolean.adapter';
import { TextAdapter } from '../../data-access/cad/text.adapter';

/// <reference lib="webworker" />

const three = new ThreeAdapter();
const bools = new BooleanAdapter({ three });
const text = new TextAdapter(three);
const assembly = new AssemblyService(three, bools, text);

addEventListener('message', ({ data }) => {
  const editorData = data['eD'];
  const modulesList = data['mL'];

  assembly.buildBaseLayer1(editorData, modulesList).then((geom) => {
    const meshes = three.meshesFromGeom3(geom, { color: 0x00ff00 });
    if (meshes[0]) postMessage(meshes[0].toJSON());
  });

  assembly.buildLayer2(editorData, modulesList).then((geoms) => {
    for (const geom of geoms) {
      const mesh = three.meshesFromGeom3(geom, { color: 0xffff00 })[0];
      if (mesh) postMessage(mesh.toJSON());
    }
  });

  assembly.buildLayer3(editorData, modulesList).then((geom) => {
    const mesh = three.meshesFromGeom3(geom, { color: 0x00ffff })[0];
    if (mesh) postMessage(mesh.toJSON());
  });
});
