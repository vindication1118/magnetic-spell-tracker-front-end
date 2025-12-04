import * as THREE from 'three';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import { BooleanAdapter } from '../../data-access/cad/boolean.adapter';
import { ThreeAdapter } from '../../data-access/cad/three.adapter';
import { TextAdapter } from '../../data-access/cad/text.adapter';
import { EditorData } from '../../interfaces/editor-data';
import { TrackerModule, TextModule } from '../../interfaces/tracker-module';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

export class AssemblyService {
  constructor(
    private readonly three: ThreeAdapter,
    private readonly bools: BooleanAdapter,
    private readonly text: TextAdapter
  ) {}

  async buildBaseLayer1(editor: EditorData, modules: TrackerModule[]): Promise<Geom3> {
    const length = editor.boundingBox.maxX + 20 - editor.boundingBox.minX + 20;
    const height =
      editor.magnetHeight +
      (editor.partGapWidth + editor.minWallWidth) * 2 +
      editor.textDepth +
      1;
    const depth = editor.boundingBox.maxY + 20 - editor.boundingBox.minY + 20;

    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, height, depth),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    );
    baseMesh.position.set(length / 2, -height / 2, depth / 2);
    baseMesh.updateMatrix();
    this.three.bakeWorldMatrix(baseMesh);

    let base = this.three.geom3FromThree(baseMesh);

    for (const module of modules) {
      if (module.type === 0) {
        const track = await this.addSliderLayer1(
          Number(module.data[0]),
          Number(module.data[1]),
          Number(module.data[2]),
          Number(module.data[3]),
          module.editorData
        );
        base = this.bools.subtract(base, track);
      } else if (module.type === 1) {
        const dial = await this.addDialCircle(
          Number(module.data[0]),
          Number(module.data[1]),
          module.editorData
        );
        base = this.bools.subtract(base, dial);
      }
    }

    return base;
  }

  async buildLayer2(editor: EditorData, modules: TrackerModule[]): Promise<Geom3[]> {
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
          module.editorData
        );
        output.push(slider);
      } else if (module.type === 1) {
        if (!genericDial) {
          genericDial = await this.addDialLayer2(0, 0, module.editorData);
        }
        const translated = this.translateGeom(
          genericDial!,
          Number(module.data[0]) + r,
          0,
          Number(module.data[1]) + r
        );
        output.push(translated);
      }
    }

    return output;
  }

  async buildLayer3(editor: EditorData, modules: TrackerModule[]): Promise<Geom3> {
    const length = editor.boundingBox.maxX + 20 - editor.boundingBox.minX + 20;
    const height = editor.minWallWidth + editor.textDepth;
    const depth = editor.boundingBox.maxY + 20 - editor.boundingBox.minY + 20;

    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, height, depth),
      new THREE.MeshStandardMaterial({ color: 0x00ffff })
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
          module.editorData
        );
        acc = this.bools.subtract(acc, slider);
      } else if (module.type === 1) {
        const dialWindow = await this.addDialWindowLayer3(
          Number(module.data[0]),
          -height / 2 + 5 + 1,
          Number(module.data[1]),
          module.editorData
        );
        acc = this.bools.subtract(acc, dialWindow);

        const knobHole = await this.addDialKnobLayer3(
          Number(module.data[0]),
          -height / 2 + 5 + 1,
          Number(module.data[1]),
          module.editorData
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
          5
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
    moduleInfo: EditorData
  ): Promise<Geom3> {
    const l = length * moduleInfo.derivedVals.segmentLength + 2;
    const w =
      moduleInfo.derivedVals.sliderRadius * 2 +
      2 +
      2 * moduleInfo.partGapWidth;
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
            moduleInfo
          )
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
            moduleInfo
          )
        );
      }
    }

    const trackCubeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(tL, h, tD),
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    trackCubeMesh.position.set(newX, -h / 2 + 1, newZ);
    trackCubeMesh.updateMatrix();
    this.three.bakeWorldMatrix(trackCubeMesh);
    let trackGeom = this.three.geom3FromThree(trackCubeMesh);

    trackGeom = this.bools.union(trackGeom, ...cylArr);
    return trackGeom;
  }

  async addDialCircle(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData
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

    const dialCircle = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 32),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    dialCircle.position.set(newX, -h / 2 + 1, newZ);
    dialCircle.updateMatrix();
    this.three.bakeWorldMatrix(dialCircle);

    const magCyl = await this.addMagCyl(
      newX,
      magYTranslate,
      newZ +
        (moduleInfo.derivedVals.plateWidth / 2 -
          (1.5 + moduleInfo.magnetDiameter / 2)),
      moduleInfo
    );

    const knobR = moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const knobH = moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1;
    const knobAlignCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(knobR, knobR, knobH, 32),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    knobAlignCyl.position.set(newX, magYTranslate, newZ);
    knobAlignCyl.updateMatrix();
    this.three.bakeWorldMatrix(knobAlignCyl);

    const dialGeom = this.three.geom3FromThree(dialCircle);
    const knobGeom = this.three.geom3FromThree(knobAlignCyl);

    return this.bools.union(dialGeom, magCyl, knobGeom);
  }

  async addSliderLayer2(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
    moduleInfo: EditorData
  ): Promise<Geom3> {
    const l = moduleInfo.derivedVals.segmentLength + 2;
    const w = moduleInfo.derivedVals.sliderRadius * 2 + 2;
    const h = moduleInfo.minWallWidth + moduleInfo.textDepth + moduleInfo.magnetHeight;
    let sL: number, sD: number, newX: number, newZ: number;
    const bottomOfSliderCube = -h + 3;
    const magYTranslate =
      -1 + bottomOfSliderCube + (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;

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

    const sliderCube = new THREE.Mesh(
      new THREE.BoxGeometry(sL, h, sD),
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    sliderCube.position.set(newX, -h / 2 + 3, newZ);
    sliderCube.updateMatrix();
    this.three.bakeWorldMatrix(sliderCube);

    const magCyl = await this.addMagCyl(newX, magYTranslate, newZ, moduleInfo);

    const knobR = moduleInfo.derivedVals.knobWidth / 2;
    const knobCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(knobR, knobR, h + 5, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    knobCyl.position.set(newX, (-h + 5) / 2 + 3, newZ);
    knobCyl.updateMatrix();
    this.three.bakeWorldMatrix(knobCyl);

    let sliderGeom = this.three.geom3FromThree(sliderCube);
    const knobGeom = this.three.geom3FromThree(knobCyl);
    sliderGeom = this.bools.union(sliderGeom, knobGeom);
    sliderGeom = this.bools.subtract(sliderGeom, magCyl);
    return sliderGeom;
  }

  async addDialLayer2(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData
  ): Promise<Geom3> {
    const r = moduleInfo.derivedVals.plateWidth / 2;
    const h = moduleInfo.minWallWidth + moduleInfo.magnetHeight + moduleInfo.textDepth;
    const newX = translationX + r;
    const newZ = translationY + r;
    const bottomOfDialCircle = -h + 3;
    const magYTranslate =
      -1 + bottomOfDialCircle + (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;

    const dialCircle = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 32),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    dialCircle.position.set(newX, -h / 2 + 3, newZ);
    dialCircle.updateMatrix();
    this.three.bakeWorldMatrix(dialCircle);

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
      magCylArr.push(await this.addMagCyl(magXVal, magYTranslate, magZVal, moduleInfo));
    }

    const knobR = moduleInfo.derivedVals.knobWidth / 2;
    const knobH = moduleInfo.magnetHeight + h + 5;
    const knobAlignCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(knobR, knobR, knobH, 32),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    knobAlignCyl.position.set(newX, -h / 2 + 3 + 2.5, newZ);
    knobAlignCyl.updateMatrix();
    this.three.bakeWorldMatrix(knobAlignCyl);

    let dialGeom = this.three.geom3FromThree(dialCircle);
    for (const mag of magCylArr) {
      dialGeom = this.bools.subtract(dialGeom, mag);
    }

    const knobGeom = this.three.geom3FromThree(knobAlignCyl);
    dialGeom = this.bools.union(dialGeom, knobGeom);

    const dialText = this.addDialDigits(
      newX,
      newZ,
      bottomOfDialCircle + h,
      moduleInfo
    );
    for (const divot of dialText.divots) dialGeom = this.bools.subtract(dialGeom, divot);
    for (const digit of dialText.digits) dialGeom = this.bools.union(dialGeom, digit);
    return dialGeom;
  }

  addDialDigits(
    dialCenterX: number,
    dialCenterZ: number,
    yTranslate: number,
    moduleInfo: EditorData
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
      const divotBox = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, l),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      divotBox.position.set(newXVal, yTranslate + h / 2 - moduleInfo.textDepth, newZVal);
      divotBox.rotation.y = -(theta - Math.PI / 2);
      divotBox.updateMatrix();
      this.three.bakeWorldMatrix(divotBox);
      textObj.divots.push(this.three.geom3FromThree(divotBox));

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
        yTranslate - moduleInfo.textDepth / 2
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
    moduleInfo: EditorData
  ): Promise<Geom3> {
    const l = length * moduleInfo.derivedVals.segmentLength + 2;
    const w =
      moduleInfo.derivedVals.sliderRadius * 2 + 2 + 2 * moduleInfo.partGapWidth;
    const rectLength = moduleInfo.derivedVals.segmentLength * (length - 1);
    const r = moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const height = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    const endGeometry = new THREE.CylinderGeometry(r, r, height, 32);
    const tY = -height / 2 + 5 + 1;
    let newX: number, newZ: number, geom: Geom3;

    if (rotation === 0) {
      newX = translateX + w / 2;
      newZ = translateY + l / 2;
      const firstCylZ = newZ - rectLength / 2;
      const midMesh = new THREE.Mesh(
        new THREE.BoxGeometry(2 * r, height, rectLength),
        new THREE.MeshStandardMaterial({ color: 0xfffff0 })
      );
      midMesh.position.set(newX, tY, newZ);
      midMesh.updateMatrix();
      this.three.bakeWorldMatrix(midMesh);

      const topMesh = new THREE.Mesh(endGeometry, new THREE.MeshStandardMaterial());
      topMesh.position.set(newX, tY, firstCylZ);
      topMesh.updateMatrix();
      this.three.bakeWorldMatrix(topMesh);

      const bottomMesh = new THREE.Mesh(endGeometry, new THREE.MeshStandardMaterial());
      bottomMesh.position.set(newX, tY, firstCylZ + rectLength);
      bottomMesh.updateMatrix();
      this.three.bakeWorldMatrix(bottomMesh);

      geom = this.bools.union(
        this.three.geom3FromThree(midMesh),
        this.three.geom3FromThree(topMesh),
        this.three.geom3FromThree(bottomMesh)
      );
    } else {
      newX = translateX + l / 2;
      newZ = translateY + w / 2;
      const firstCylX = newX - rectLength / 2;
      const midMesh = new THREE.Mesh(
        new THREE.BoxGeometry(rectLength, height, 2 * r),
        new THREE.MeshStandardMaterial({ color: 0xfffff0 })
      );
      midMesh.position.set(newX, tY, newZ);
      midMesh.updateMatrix();
      this.three.bakeWorldMatrix(midMesh);

      const leftMesh = new THREE.Mesh(endGeometry, new THREE.MeshStandardMaterial());
      leftMesh.position.set(firstCylX, tY, newZ);
      leftMesh.updateMatrix();
      this.three.bakeWorldMatrix(leftMesh);

      const rightMesh = new THREE.Mesh(endGeometry, new THREE.MeshStandardMaterial());
      rightMesh.position.set(firstCylX + rectLength, tY, newZ);
      rightMesh.updateMatrix();
      this.three.bakeWorldMatrix(rightMesh);

      geom = this.bools.union(
        this.three.geom3FromThree(midMesh),
        this.three.geom3FromThree(rightMesh),
        this.three.geom3FromThree(leftMesh)
      );
    }

    return geom;
  }

  async addDialWindowLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData
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
    const divotBox = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, l),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    divotBox.position.set(newXVal, tY, newZVal);
    divotBox.updateMatrix();
    this.three.bakeWorldMatrix(divotBox);
    return this.three.geom3FromThree(divotBox);
  }

  async addDialKnobLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData
  ): Promise<Geom3> {
    const r = moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const h = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    const knobHole = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    knobHole.position.set(
      tX + moduleInfo.derivedVals.plateWidth / 2,
      tY,
      tZ + moduleInfo.derivedVals.plateWidth / 2
    );
    knobHole.updateMatrix();
    this.three.bakeWorldMatrix(knobHole);
    return this.three.geom3FromThree(knobHole);
  }

  async addText(
    rotation: number,
    translationX: number,
    translationZ: number,
    inputText: string,
    width: number,
    height: number,
    moduleInfo: EditorData,
    translationY?: number
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
    const divotBoxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(divotXWidth, divotZWidth, divotYWidth),
      new THREE.MeshStandardMaterial({ color: 0x0000ff })
    );
    divotBoxMesh.position.set(
      translationX + divotXWidth / 2,
      -h / 2 + yPos,
      translationZ - (divotYWidth * 2) / 3
    );
    divotBoxMesh.updateMatrix();
    this.three.bakeWorldMatrix(divotBoxMesh);
    const divotGeom = this.three.geom3FromThree(divotBoxMesh);
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
    translationY?: number
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
      translationZ + modifier * Math.sin(zRot)
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
    moduleInfo: EditorData
  ): Promise<Geom3> {
    const r = moduleInfo.magnetDiameter / 2 + moduleInfo.partGapWidth;
    const h = moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const cylinder = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xffff00 })
    );
    cylinder.position.set(tX, tY, tZ);
    cylinder.updateMatrix();
    this.three.bakeWorldMatrix(cylinder);
    return this.three.geom3FromThree(cylinder);
  }

  private translateGeom(g: Geom3, x: number, y: number, z: number): Geom3 {
    const mesh = this.three.meshesFromGeom3(g, { color: 0xffffff })[0];
    mesh.position.set(x, y, z);
    mesh.updateMatrix();
    this.three.bakeWorldMatrix(mesh);
    return this.three.geom3FromThree(mesh);
  }
}
