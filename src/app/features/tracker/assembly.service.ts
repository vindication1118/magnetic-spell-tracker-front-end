import * as THREE from 'three';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import { BooleanAdapter } from '../../data-access/cad/boolean.adapter';
import { ThreeAdapter } from '../../data-access/cad/three.adapter';
import { TextAdapter } from '../../data-access/cad/text.adapter';
import { EditorData } from '../../interfaces/editor-data';
import { TrackerModule, TextModule } from '../../interfaces/tracker-module';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import {
  boxGeom3,
  cylinderGeom3,
  roundedSlotGeom3,
} from '../../data-access/cad/generators.mesh';

export class AssemblyService {
  constructor(
    private readonly three: ThreeAdapter,
    private readonly bools: BooleanAdapter,
    private readonly text: TextAdapter,
  ) {}

  async buildBaseLayer1(
    editor: EditorData,
    modules: TrackerModule[],
  ): Promise<Geom3> {
    const length = editor.boundingBox.maxX + 20 - editor.boundingBox.minX + 20;
    const height =
      editor.magnetHeight +
      (editor.partGapWidth + editor.minWallWidth) * 2 +
      editor.textDepth +
      1;
    const depth = editor.boundingBox.maxY + 20 - editor.boundingBox.minY + 20;

    let base = boxGeom3(
      [length, height, depth],
      [length / 2, -height / 2, depth / 2],
    );

    for (const module of modules) {
      if (module.type === 0) {
        const track = await this.addSliderLayer1(
          Number(module.data[0]),
          Number(module.data[1]),
          Number(module.data[2]),
          Number(module.data[3]),
          module.editorData,
        );
        base = this.bools.subtract(base, track);
      } else if (module.type === 1) {
        const dial = await this.addDialCircle(
          Number(module.data[0]),
          Number(module.data[1]),
          module.editorData,
        );
        base = this.bools.subtract(base, dial);
      }
    }

    return base;
  }

  async buildLayer2(
    editor: EditorData,
    modules: TrackerModule[],
  ): Promise<Geom3[]> {
    const output: Geom3[] = [];
    let genericDial: Geom3 | undefined;
    const r = editor.derivedVals.plateWidth / 2;

    for (const module of modules) {
      if (module.type === 0) {
        const slider = await this.addSliderLayer2(
          Number(module.data[0]),
          Number(module.data[1]),
          Number(module.data[2]),
          Number(module.data[3]),
          module.editorData,
        );
        output.push(slider);
      } else if (module.type === 1) {
        if (!genericDial) {
          genericDial = await this.addDialLayer2(0, 0, module.editorData);
        }
        const translated = await this.translateGeom(
          genericDial!,
          Number(module.data[0]) + r,
          0,
          Number(module.data[1]) + r,
        );
        output.push(translated);
      }
    }

    return output;
  }

  async buildLayer3(
    editor: EditorData,
    modules: TrackerModule[],
  ): Promise<Geom3> {
    const length = editor.boundingBox.maxX + 20 - editor.boundingBox.minX + 20;
    const height = editor.minWallWidth + editor.textDepth;
    const depth = editor.boundingBox.maxY + 20 - editor.boundingBox.minY + 20;

    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, height, depth),
      new THREE.MeshStandardMaterial({ color: 0x00ffff }),
    );
    baseMesh.position.set(length / 2, -height / 2 + 5, depth / 2);
    baseMesh.updateMatrix();
    this.three.bakeWorldMatrix(baseMesh);

    let acc = this.three.geom3FromThree(baseMesh);

    for (const module of modules) {
      if (module.type === 0) {
        const slider = await this.addSliderLayer3(
          Number(module.data[0]),
          Number(module.data[1]),
          Number(module.data[2]),
          Number(module.data[3]),
          module.editorData,
        );
        acc = this.bools.subtract(acc, slider);
      } else if (module.type === 1) {
        const dialWindow = await this.addDialWindowLayer3(
          Number(module.data[0]),
          -height / 2 + 5 + 1,
          Number(module.data[1]),
          module.editorData,
        );
        acc = this.bools.subtract(acc, dialWindow);

        const knobHole = await this.addDialKnobLayer3(
          Number(module.data[0]),
          -height / 2 + 5 + 1,
          Number(module.data[1]),
          module.editorData,
        );
        acc = this.bools.subtract(acc, knobHole);
      } else if (module.type === 2) {
        const textResult = await this.addText(
          Number(module.data[0]),
          Number(module.data[1]),
          Number(module.data[2]),
          module.data[3] + '',
          Number(module.data[4]),
          Number(module.data[5]),
          module.editorData,
          5,
        );
        acc = this.bools.subtract(acc, textResult.divot);
        acc = this.bools.union(acc, textResult.text);
      } else if (module.type === 3) {
        const textModule = module as TextModule;
        const textGeom = await this.addTextLayer3(textModule.meshJSON);
        acc = this.bools.union(acc, textGeom);
      }
    }

    return acc;
  }

  // -- Slider / Dial helpers (migrated) --

  async addSliderLayer1(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const l = length * moduleInfo.derivedVals.segmentLength + 2;
    const w =
      moduleInfo.derivedVals.sliderRadius * 2 + 2 + 2 * moduleInfo.partGapWidth;
    const h =
      moduleInfo.partGapWidth +
      moduleInfo.minWallWidth +
      moduleInfo.textDepth +
      moduleInfo.magnetHeight +
      1;
    let tL: number, tD: number, newX: number, newZ: number;
    const cylArr: Geom3[] = [];
    const bottomOfTrackCube = -h + 1;
    const magYTranslate =
      1 +
      bottomOfTrackCube -
      (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;

    if (rotation === 0) {
      tL = w;
      tD = l;
      const firstCylZ = translateY + moduleInfo.derivedVals.sliderRadius + 1;
      newX = translateX + moduleInfo.derivedVals.sliderRadius + 1;
      newZ = translateY + l / 2;
      for (let i = 0; i < length; i++) {
        cylArr.push(
          await this.addMagCyl(
            newX,
            magYTranslate,
            firstCylZ + i * moduleInfo.derivedVals.segmentLength,
            moduleInfo,
          ),
        );
      }
    } else {
      tL = l;
      tD = w;
      const firstCylX = translateX + moduleInfo.derivedVals.sliderRadius + 1;
      newX = translateX + l / 2;
      newZ = translateY + moduleInfo.derivedVals.sliderRadius + 1;
      for (let i = 0; i < length; i++) {
        cylArr.push(
          await this.addMagCyl(
            firstCylX + i * moduleInfo.derivedVals.segmentLength,
            magYTranslate,
            newZ,
            moduleInfo,
          ),
        );
      }
    }

    const trackGeom = boxGeom3([tL, h, tD], [newX, -h / 2 + 1, newZ]);
    return this.bools.union(trackGeom, ...cylArr);
  }

  async addDialCircle(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const r = moduleInfo.derivedVals.plateWidth / 2 + moduleInfo.partGapWidth;
    const h =
      moduleInfo.partGapWidth +
      moduleInfo.minWallWidth +
      moduleInfo.textDepth +
      moduleInfo.magnetHeight +
      1;
    const newX = translationX + r;
    const newZ = translationY + r;
    const bottomOfDialCircle = -h + 1;
    const magYTranslate =
      1 +
      bottomOfDialCircle -
      (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;

    const dialCircle = cylinderGeom3(r, h, [newX, -h / 2 + 1, newZ]);

    const magCyl = await this.addMagCyl(
      newX,
      magYTranslate,
      newZ +
        (moduleInfo.derivedVals.plateWidth / 2 -
          (1.5 + moduleInfo.magnetDiameter / 2)),
      moduleInfo,
    );

    const knobR =
      moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const knobH = moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1;
    const knobGeom = cylinderGeom3(knobR, knobH, [newX, magYTranslate, newZ]);

    return this.bools.union(dialCircle, magCyl, knobGeom);
  }

  async addSliderLayer2(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const l = moduleInfo.derivedVals.segmentLength + 2;
    const w = moduleInfo.derivedVals.sliderRadius * 2 + 2;
    const h =
      moduleInfo.minWallWidth + moduleInfo.textDepth + moduleInfo.magnetHeight;
    let sL: number, sD: number, newX: number, newZ: number;
    const bottomOfSliderCube = -h + 3;
    const magYTranslate =
      -1 +
      bottomOfSliderCube +
      (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;

    if (rotation === 0) {
      sL = w;
      sD = l;
      newX = translateX + w / 2 + moduleInfo.partGapWidth / 2;
      newZ = translateY + l / 2;
    } else {
      sL = l;
      sD = w;
      newX = translateX + l / 2;
      newZ = translateY + w / 2 + moduleInfo.partGapWidth / 2;
    }

    const sliderGeom = boxGeom3([sL, h, sD], [newX, -h / 2 + 3, newZ]);
    const magCyl = await this.addMagCyl(newX, magYTranslate, newZ, moduleInfo);

    const knobR = moduleInfo.derivedVals.knobWidth / 2;
    const knobGeom = cylinderGeom3(knobR, h + 5, [
      newX,
      (-h + 5) / 2 + 3,
      newZ,
    ]);

    const unioned = this.bools.union(sliderGeom, knobGeom);
    return this.bools.subtract(unioned, magCyl);
  }

  async addDialLayer2(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const r = moduleInfo.derivedVals.plateWidth / 2;
    const h =
      moduleInfo.minWallWidth + moduleInfo.magnetHeight + moduleInfo.textDepth;
    const newX = translationX + r;
    const newZ = translationY + r;
    const bottomOfDialCircle = -h + 3;
    const magYTranslate =
      -1 +
      bottomOfDialCircle +
      (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;

    let dialGeom = cylinderGeom3(r, h, [newX, -h / 2 + 3, newZ]);

    const magCylArr: Geom3[] = [];
    const angleDiffRads = (2 * Math.PI) / 10;
    for (let i = 0; i <= 9; i++) {
      const theta = angleDiffRads * i + Math.PI / 2 + angleDiffRads;
      const magXVal =
        newX +
        (moduleInfo.derivedVals.plateWidth / 2 -
          (1.5 + moduleInfo.magnetDiameter / 2)) *
          Math.cos(theta);
      const magZVal =
        newZ +
        (moduleInfo.derivedVals.plateWidth / 2 -
          (1.5 + moduleInfo.magnetDiameter / 2)) *
          Math.sin(theta);
      magCylArr.push(
        await this.addMagCyl(magXVal, magYTranslate, magZVal, moduleInfo),
      );
    }

    const knobR = moduleInfo.derivedVals.knobWidth / 2;
    const knobH = moduleInfo.magnetHeight + h + 5;
    const knobGeom = cylinderGeom3(knobR, knobH, [
      newX,
      -h / 2 + 3 + 2.5,
      newZ,
    ]);

    for (const mag of magCylArr) {
      dialGeom = this.bools.subtract(dialGeom, mag);
    }

    dialGeom = this.bools.union(dialGeom, knobGeom);

    const dialText = this.addDialDigits(
      newX,
      newZ,
      bottomOfDialCircle + h,
      moduleInfo,
    );
    for (const divot of dialText.divots)
      dialGeom = this.bools.subtract(dialGeom, divot);
    for (const digit of dialText.digits)
      dialGeom = this.bools.union(dialGeom, digit);
    return dialGeom;
  }

  addDialDigits(
    dialCenterX: number,
    dialCenterZ: number,
    yTranslate: number,
    moduleInfo: EditorData,
  ): { divots: Geom3[]; digits: Geom3[] } {
    const l = moduleInfo.derivedVals.knobWidth + 3;
    const w = moduleInfo.derivedVals.knobWidth + 1;
    const h = moduleInfo.textDepth + 1;
    const newR = moduleInfo.derivedVals.knobWidth + l / 2;
    const angleDiffRads = (2 * Math.PI) / 10;
    const textRadius =
      moduleInfo.derivedVals.plateWidth / 2 -
      (3 * moduleInfo.derivedVals.knobWidth) / 4;
    const angleDiffDeg = 360 / 10;
    const textObj = { divots: new Array<Geom3>(), digits: new Array<Geom3>() };

    for (let i = 0; i < 10; i++) {
      const theta = angleDiffRads * (i + 1) + Math.PI / 2;
      const thetaDeg = angleDiffDeg * (i + 1);
      const newXVal = dialCenterX + newR * Math.cos(theta);
      const newZVal = dialCenterZ + newR * Math.sin(theta);
      const divotBox = boxGeom3(
        [w, h, l],
        [newXVal, yTranslate + h / 2 - moduleInfo.textDepth, newZVal],
        [0, -(theta - Math.PI / 2), 0],
      );
      textObj.divots.push(divotBox);

      const textXVal = dialCenterX + textRadius * Math.cos(theta);
      const textZVal = dialCenterZ + textRadius * Math.sin(theta);
      const text = `${i}`;
      const newWidth = i === 1 ? w / 4 : w / 2;
      const textMesh = this.addTextXCentered(
        thetaDeg,
        textXVal,
        textZVal,
        text,
        newWidth,
        l / 2,
        moduleInfo,
        yTranslate - moduleInfo.textDepth / 2,
      );
      this.three.bakeWorldMatrix(textMesh);
      textObj.digits.push(this.three.geom3FromThree(textMesh));
    }

    return textObj;
  }

  async addSliderLayer3(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const l = length * moduleInfo.derivedVals.segmentLength + 2;
    const w =
      moduleInfo.derivedVals.sliderRadius * 2 + 2 + 2 * moduleInfo.partGapWidth;
    const r = moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const height = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    const tY = -height / 2 + 5 + 1;
    if (rotation === 0) {
      const newX = translateX + w / 2;
      const newZ = translateY + l / 2;
      return roundedSlotGeom3(l, r, height, [newX, tY, newZ], 'Z');
    }

    const newX = translateX + l / 2;
    const newZ = translateY + w / 2;
    return roundedSlotGeom3(l, r, height, [newX, tY, newZ], 'X');
  }

  async addDialWindowLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const l = moduleInfo.derivedVals.knobWidth + 3;
    const w = moduleInfo.derivedVals.knobWidth + 1;
    const h = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    const newR = moduleInfo.derivedVals.knobWidth + l / 2;

    const theta = Math.PI / 2;
    const newXVal =
      tX + moduleInfo.derivedVals.plateWidth / 2 + newR * Math.cos(theta);
    const newZVal =
      tZ + moduleInfo.derivedVals.plateWidth / 2 + newR * Math.sin(theta);
    return boxGeom3([w, h, l], [newXVal, tY, newZVal]);
  }

  async addDialKnobLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const r = moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const h = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    return cylinderGeom3(r, h, [
      tX + moduleInfo.derivedVals.plateWidth / 2,
      tY,
      tZ + moduleInfo.derivedVals.plateWidth / 2,
    ]);
  }

  async addText(
    rotation: number,
    translationX: number,
    translationZ: number,
    inputText: string,
    width: number,
    height: number,
    moduleInfo: EditorData,
    translationY?: number,
  ): Promise<{ text: Geom3; divot: Geom3 }> {
    const h = moduleInfo.textDepth;
    const loader = new FontLoader();
    const fontURL =
      '../../../node_modules/three/examples/fonts/droid/droid_sans_regular.typeface.json';
    const loadedFont = loader.load(fontURL);
    const parsedFont = loader.parse(loadedFont);
    const geometry = new TextGeometry(inputText, {
      font: parsedFont,
      size: 8,
      height: h,
      curveSegments: 12,
      bevelEnabled: false,
    });
    const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const myText = new THREE.Mesh(geometry, material);
    myText.geometry.computeBoundingBox();
    const bbox = myText.geometry.boundingBox;
    const xWidth = bbox ? bbox.max.x - bbox.min.x : 1;
    const yWidth = bbox ? bbox.max.y - bbox.min.y : 1;

    const xScale = width / xWidth;
    const yScale = height / yWidth;
    myText.scale.set(xScale, yScale, 1);
    myText.rotation.x = -(90 * Math.PI) / 180;
    myText.rotation.z = -(rotation * Math.PI) / 180;
    const yPos = typeof translationY === 'undefined' ? 1 : translationY;
    myText.position.set(translationX, -h / 2 + yPos, translationZ);
    myText.updateMatrix();
    this.three.bakeWorldMatrix(myText);
    const textGeom = this.three.geom3FromThree(myText);

    myText.geometry.computeBoundingBox();
    const divotGeo = myText.geometry.boundingBox;
    const divotXWidth = divotGeo!.max.x - divotGeo!.min.x;
    const divotYWidth = divotGeo!.max.y - divotGeo!.min.y;
    const divotZWidth = divotGeo!.max.z - divotGeo!.min.z;
    const divotGeom = boxGeom3(
      [divotXWidth, divotZWidth, divotYWidth],
      [
        translationX + divotXWidth / 2,
        -h / 2 + yPos,
        translationZ - (divotYWidth * 2) / 3,
      ],
    );
    return { text: textGeom, divot: divotGeom };
  }

  addTextXCentered(
    rotation: number,
    translationX: number,
    translationZ: number,
    inputText: string,
    width: number,
    height: number,
    moduleInfo: EditorData,
    translationY?: number,
  ): THREE.Mesh {
    const h = moduleInfo.textDepth;
    const loader = new FontLoader();
    const fontURL =
      '../../../node_modules/three/examples/fonts/droid/droid_sans_regular.typeface.json';
    const loadedFont = loader.load(fontURL);
    const parsedFont = loader.parse(loadedFont);
    const geometry = new TextGeometry(inputText, {
      font: parsedFont,
      size: 8,
      height: h,
      curveSegments: 12,
      bevelEnabled: false,
    });
    const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const myText = new THREE.Mesh(geometry, material);
    myText.geometry.computeBoundingBox();
    const bbox = myText.geometry.boundingBox;
    let xWidth = bbox ? bbox.max.x - bbox.min.x : 1;
    let yWidth = bbox ? bbox.max.y - bbox.min.y : 1;

    const xScale = width / xWidth;
    const yScale = height / yWidth;
    const zRot = -(rotation * Math.PI) / 180;
    myText.scale.set(xScale, yScale, 1);
    myText.rotation.x = -(90 * Math.PI) / 180;
    myText.rotation.z = zRot;
    const yPos = typeof translationY === 'undefined' ? 1 : translationY;
    myText.updateMatrix();
    myText.geometry.computeBoundingBox();
    const tBBox = myText.geometry.boundingBox;
    xWidth = tBBox ? tBBox.max.x - tBBox.min.x : 1;
    yWidth = tBBox ? tBBox.max.y - tBBox.min.y : 1;
    const modifier = inputText === '1' ? (xWidth * 3) / 4 : xWidth / 2;
    myText.position.set(
      translationX - modifier * Math.cos(zRot),
      -h / 2 + yPos,
      translationZ + modifier * Math.sin(zRot),
    );
    myText.updateMatrix();
    return myText;
  }

  async addTextLayer3(meshJSON: object): Promise<Geom3> {
    const mesh = new THREE.ObjectLoader().parse(meshJSON) as THREE.Mesh;
    this.three.bakeWorldMatrix(mesh);
    return this.three.geom3FromThree(mesh);
  }

  // -- Stubs for remaining planned methods --
  async buildSliderTrackLayer1(): Promise<Geom3> {
    throw new Error('Not implemented');
  }
  async buildSliderWindowLayer3(): Promise<Geom3> {
    throw new Error('Not implemented');
  }
  async buildDialBaseLayer1(): Promise<Geom3> {
    throw new Error('Not implemented');
  }
  async buildDialLayer2(): Promise<Geom3> {
    throw new Error('Not implemented');
  }
  async buildDialKnobHoleLayer3(): Promise<Geom3> {
    throw new Error('Not implemented');
  }
  async buildTextAndDivots(): Promise<{ text: Geom3[]; divots: Geom3[] }> {
    throw new Error('Not implemented');
  }

  private async addMagCyl(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const r = moduleInfo.magnetDiameter / 2 + moduleInfo.partGapWidth;
    const h = moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1;
    return cylinderGeom3(r, h, [tX, tY, tZ]);
  }

  private async translateGeom(
    g: Geom3,
    x: number,
    y: number,
    z: number,
  ): Promise<Geom3> {
    const mesh = (await this.three.meshesFromGeom3(g, {
      color: 0xffffff,
    })[0]) as unknown as THREE.Mesh;
    mesh.position.set(x, y, z);
    mesh.updateMatrix();
    this.three.bakeWorldMatrix(mesh);
    return this.three.geom3FromThree(mesh);
  }
}
