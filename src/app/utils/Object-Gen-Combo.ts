import { ManifoldWasmService } from './../services/manifold-wasm.service';
import { TrackerModule } from '../interfaces/tracker-module';
import { TextModule } from '../interfaces/tracker-module';

import * as THREE from 'three';
import { EditorData } from '../interfaces/editor-data';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

//import fontData from 'three/examples/fonts/droid/droid_sans_regular.typeface.json';
import { ElementRef } from '@angular/core';
import * as deserialize from '@jscad/stl-deserializer';
import * as serialize from '@jscad/stl-serializer';
import { booleans } from '@jscad/modeling/src/index';
import { Geom3 } from '@jscad/modeling/src/geometries/types';

class SpellTracker {
  public editorData!: EditorData;
  public layer1Height!: number;
  public modulesList!: TrackerModule[];
  private objectLoader = new THREE.ObjectLoader();
  private threeExporter = new STLExporter();
  private threeLoader = new STLLoader();
  private manifold!: ManifoldWasmService;

  constructor(
    editorData: EditorData,
    modulesList: TrackerModule[],
    canvasRef?: ElementRef,
  ) {
    if (canvasRef !== null || canvasRef !== undefined) {
      console.log('we have a canvasRef, do the webgl thing');
    }
    this.editorData = editorData;
    this.modulesList = modulesList;
    this.layer1Height =
      this.editorData.magnetHeight +
      (this.editorData.partGapWidth + this.editorData.minWallWidth) * 2 +
      this.editorData.textDepth +
      1;
  }

  public updateModulesList(newList: TrackerModule[]) {
    this.modulesList = newList;
  }

  public async convertThreeToJSCAD(model: THREE.Mesh): Promise<Geom3> {
    const stlString = this.threeExporter.parse(model, { binary: true });
    const blob = new Blob([stlString], { type: 'application/octet-stream' });
    const arrayBuffer = await blob.arrayBuffer();
    const jscGeom = deserialize.deserialize(
      { output: 'geometry' },
      new Uint8Array(arrayBuffer),
    );
    return jscGeom as Geom3;
  }

  public async convertJSCADToThree(
    model: Geom3,
    modelColor: number,
    debug: boolean = false,
    wireframeOut: boolean = false,
  ): Promise<THREE.Mesh[]> {
    const stlData = serialize.serialize({ binary: true }, model);
    //console.log(stlArray);
    //const stlBuffer = stlArray[2];
    const blob = new Blob(stlData);
    const arrayBuffer = await blob.arrayBuffer();
    const geometry = this.threeLoader.parse(arrayBuffer);
    if (debug) {
      // Loop through the faces and assign a random color
      const color = new THREE.Color();
      const positionAttribute = geometry.getAttribute('position');
      const colors = [];

      for (let i = 0; i < positionAttribute.count; i += 3) {
        // Generate a random color
        const min = 0xaaaaaa;
        const max = 0xeeeeee;
        const randomColor = Math.random() * (max - min) + min;
        color.set(randomColor);

        // Assign the color to the three vertices of the face
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }

      // Add the color attribute to the geometry
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3),
      );
      let isTransparent = false;
      if (wireframeOut) {
        isTransparent = true;
      }
      // Create a material that supports vertex colors
      const wireFrameMaterial = new THREE.MeshBasicMaterial({
        wireframe: wireframeOut,
        transparent: isTransparent,
        opacity: 0.65,
        color: 0xffffff,
      });

      const faceMaterial = new THREE.MeshStandardMaterial({
        transparent: isTransparent,
        opacity: 0.65,
        vertexColors: true,
      });

      // Create the mesh
      const meshArr: THREE.Mesh[] = [];
      meshArr.push(new THREE.Mesh(geometry, faceMaterial));
      if (wireframeOut) {
        meshArr.push(new THREE.Mesh(geometry, wireFrameMaterial));
      }

      return meshArr;
    }
    return Array(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: modelColor, wireframe: false }),
      ),
    );
  }

  public async addBaseLayer1(): Promise<THREE.Object3D> {
    const length =
      this.editorData.boundingBox.maxX +
      20 -
      this.editorData.boundingBox.minX +
      20;
    const layerColor = 0x00ff00;
    const height =
      this.editorData.magnetHeight +
      (this.editorData.partGapWidth + this.editorData.minWallWidth) * 2 +
      this.editorData.textDepth +
      1;
    this.layer1Height = height;
    const depth =
      this.editorData.boundingBox.maxY +
      20 -
      this.editorData.boundingBox.minY +
      20;
    const geometry = new THREE.BoxGeometry(length, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: layerColor });
    const layer1Base = new THREE.Mesh(geometry, material);
    layer1Base.position.set(length / 2, -height / 2, depth / 2);
    layer1Base.updateMatrix();
    this.applyTransformationMatrix(layer1Base);

    let l1BJSC = await this.convertThreeToJSCAD(layer1Base);

    const promises = this.modulesList.map(async (module) => {
      if (module['type'] === 0) {
        const track = await this.addSliderLayer1(
          Number(module['data'][0]),
          Number(module['data'][1]),
          Number(module['data'][2]),
          Number(module['data'][3]),
          module.editorData,
        );
        const trackCubeJSC = await this.convertThreeToJSCAD(track[0]);
        l1BJSC = booleans.subtract(l1BJSC, trackCubeJSC);
      } else if (module['type'] === 1) {
        const dialCircle = await this.addDialCircle(
          Number(module['data'][0]),
          Number(module['data'][1]),
          module.editorData,
        );
        const dialJSC = await this.convertThreeToJSCAD(dialCircle[0]);
        l1BJSC = booleans.subtract(l1BJSC, dialJSC);
      }
    });

    await Promise.all(promises);

    const layer1 = await this.convertJSCADToThree(l1BJSC, layerColor);
    layer1[0].name = 'layer1';
    return layer1[0];
  }

  private applyTransformationMatrix(object: THREE.Mesh): void {
    // Ensure the matrix is up to date
    object.updateMatrix();
    object.updateMatrixWorld(true);

    // Get the object's transformation matrix
    const matrix = object.matrixWorld.clone();

    // Apply the matrix to the geometry
    const geometry = object.geometry;
    geometry.applyMatrix4(matrix);

    // Optionally, clear the transformation of the object
    object.matrix.identity();
    object.matrixWorld.identity();
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);

    // Recompute vertex normals if necessary
    geometry.computeVertexNormals();
  }

  public async addSliderLayer1(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
    moduleInfo: EditorData,
  ) {
    const l = length * moduleInfo.derivedVals.segmentLength + 2; //extra 1 on each end
    const w =
      moduleInfo.derivedVals.sliderRadius * 2 + 2 + 2 * moduleInfo.partGapWidth; //extra 1 on each end
    const h =
      moduleInfo.partGapWidth +
      moduleInfo.minWallWidth +
      moduleInfo.textDepth +
      moduleInfo.magnetHeight +
      1; // want this sticking out of surface of base cube by 1
    let tL, tD, newX, newZ;
    const cylArr = [],
      //bottom of track cube minus half of height plus 1
      bottomOfTrackCube = -h + 1,
      magYTranslate =
        1 +
        bottomOfTrackCube -
        (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;
    if (rotation === 0) {
      //vertical
      tL = w;
      tD = l;
      newX = translateX + w / 2;
      newZ = translateY + l / 2;
      const firstCylZ =
        1 + translateY + moduleInfo.derivedVals.segmentLength / 2;
      for (let i = 0; i < length; i++) {
        cylArr.push(
          this.addMagCyl(
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
      const firstCylX =
        1 + translateX + moduleInfo.derivedVals.segmentLength / 2;
      newX = translateX + l / 2;
      newZ = translateY + w / 2;
      for (let i = 0; i < length; i++) {
        cylArr.push(
          this.addMagCyl(
            firstCylX + i * moduleInfo.derivedVals.segmentLength,
            magYTranslate,
            newZ,
            moduleInfo,
          ),
        );
      }
    }
    const geometry = new THREE.BoxGeometry(tL, h, tD);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const trackCube = new THREE.Mesh(geometry, material);
    trackCube.position.set(newX, -h / 2 + 1, newZ);
    trackCube.updateMatrix();
    this.applyTransformationMatrix(trackCube);
    const geomArr = [];
    let trackJSC = await this.convertThreeToJSCAD(trackCube);
    geomArr.push(trackJSC);
    for (const cyl of cylArr) {
      const cylJSC = await this.convertThreeToJSCAD(cyl);
      geomArr.push(cylJSC);
    }
    trackJSC = booleans.union(geomArr);
    const trackMesh = this.convertJSCADToThree(trackJSC, 0xffff00);
    return trackMesh;
  }

  public addMagCyl(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ): THREE.Mesh {
    const r = moduleInfo.magnetDiameter / 2 + moduleInfo.partGapWidth;
    const h = moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1;
    const radialSegments = 32; //maybe overkill
    const geometry = new THREE.CylinderGeometry(r, r, h, radialSegments);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.position.set(tX, tY, tZ);
    cylinder.updateMatrix();
    this.applyTransformationMatrix(cylinder);
    return cylinder;
  }

  public async addDialCircle(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData,
  ): Promise<THREE.Mesh[]> {
    const r = moduleInfo.derivedVals.plateWidth / 2 + moduleInfo.partGapWidth;
    const h =
      moduleInfo.partGapWidth +
      moduleInfo.minWallWidth +
      moduleInfo.textDepth +
      moduleInfo.magnetHeight +
      1;
    const newX = translationX + r;
    const newZ = translationY + r;
    const bottomOfDialCircle = -h + 1,
      magYTranslate =
        1 +
        bottomOfDialCircle -
        (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const dialCircle = new THREE.Mesh(geometry, material);
    dialCircle.position.set(newX, -h / 2 + 1, newZ);
    dialCircle.updateMatrix();
    this.applyTransformationMatrix(dialCircle);
    const magCyl = this.addMagCyl(
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
    const knobAlignCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(knobR, knobR, knobH, 32),
      material,
    );
    knobAlignCyl.position.set(newX, magYTranslate, newZ);
    knobAlignCyl.updateMatrix();
    this.applyTransformationMatrix(knobAlignCyl);
    const unionArr = [];

    unionArr.push(await this.convertThreeToJSCAD(dialCircle));

    unionArr.push(await this.convertThreeToJSCAD(magCyl));

    unionArr.push(await this.convertThreeToJSCAD(knobAlignCyl));
    const completeDialCircleJSC = booleans.union(unionArr);
    const completeDialCircle = this.convertJSCADToThree(
      completeDialCircleJSC,
      0xff0000,
    );
    return completeDialCircle;
  }

  public async createLayer2(): Promise<THREE.Mesh[]> {
    const meshArr: THREE.Mesh[] = [];
    const r = this.editorData.derivedVals.plateWidth / 2;
    let genericDialLayer2: THREE.Mesh[] | undefined;
    for (const module of this.modulesList) {
      if (module['type'] === 0) {
        const slider = await this.addSliderLayer2(
          Number(module['data'][0]),
          Number(module['data'][1]),
          Number(module['data'][2]),
          Number(module['data'][3]),
          module.editorData,
        );
        meshArr.push(slider[0]);
      } else if (module['type'] === 1) {
        if (typeof genericDialLayer2 === 'undefined') {
          genericDialLayer2 = await this.addGenericDialLayer2(
            module.editorData,
          );
        }
        const dialCircle = genericDialLayer2![0].clone();
        dialCircle.position.setComponent(0, Number(module['data'][0]) + r);
        dialCircle.position.setComponent(2, Number(module['data'][1]) + r);
        dialCircle.updateMatrix();
        meshArr.push(dialCircle);
      } else if (module['type'] === 2) {
        continue;
      }
    }
    return meshArr;
  }

  //cylinder and rectangle for each slider, ezpz
  public async addSliderLayer2(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
    moduleInfo: EditorData,
  ): Promise<THREE.Mesh[]> {
    const l = moduleInfo.derivedVals.segmentLength + 2; //extra 1 on each end
    const w = moduleInfo.derivedVals.sliderRadius * 2 + 2; //same as layer 1 but no part gap
    const h =
      moduleInfo.minWallWidth + moduleInfo.textDepth + moduleInfo.magnetHeight; // same as layer 1 but no part gap
    let sL, sD, newX, newZ;
    //bottom of track cube minus height plus 3
    const bottomOfSliderCube = -h + 3,
      magYTranslate =
        -1 +
        bottomOfSliderCube +
        (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2; //stick out bottom
    if (rotation === 0) {
      //vertical
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
    const knobR = moduleInfo.derivedVals.knobWidth / 2;
    const geometry = new THREE.BoxGeometry(sL, h, sD);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    //material.setValues({ opacity: 0.5, transparent: true });
    const sliderCube = new THREE.Mesh(geometry, material);
    sliderCube.position.set(newX, -h / 2 + 3, newZ);
    sliderCube.updateMatrix();
    const magCyl = this.addMagCyl(newX, magYTranslate, newZ, moduleInfo);
    const sliderJSC = await this.convertThreeToJSCAD(sliderCube);
    const magCylJSC = await this.convertThreeToJSCAD(magCyl);
    const knobCylGeo = new THREE.CylinderGeometry(knobR, knobR, h + 5, 32, 32);
    const knobCylMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const knobCyl = new THREE.Mesh(knobCylGeo, knobCylMaterial);
    knobCyl.position.set(newX, (-h + 5) / 2 + 3, newZ);
    knobCyl.updateMatrix();
    const knobCylJSC = await this.convertThreeToJSCAD(knobCyl);
    let sliderCSG = booleans.union([knobCylJSC, sliderJSC]);
    sliderCSG = booleans.subtract(sliderCSG, magCylJSC);
    const completeSlider = await this.convertJSCADToThree(
      sliderCSG,
      0xffffff,
      true,
      true,
    );
    return completeSlider;
  }

  public async addGenericDialLayer2(
    moduleInfo: EditorData,
  ): Promise<THREE.Mesh[]> {
    const myGenericDialLayer2 = this.addDialLayer2(0, 0, moduleInfo);
    return myGenericDialLayer2;
  }

  public async addDialLayer2(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData,
  ): Promise<THREE.Mesh[]> {
    //small tall cylinder, large flat cylinder, boolean difference magnet cylinders, engrave text
    const r = moduleInfo.derivedVals.plateWidth / 2; //same as before but no part gap
    const h =
      moduleInfo.minWallWidth + moduleInfo.magnetHeight + moduleInfo.textDepth; //same as before but no part gap and no extra + 1 to stick out of surface
    const newX = translationX + r;
    const newZ = translationY + r;
    const bottomOfDialCircle = -h + 3,
      magYTranslate =
        -1 +
        bottomOfDialCircle +
        (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    //material.setValues({ opacity: 0.5, transparent: true });
    const dialCircle = new THREE.Mesh(geometry, material);
    dialCircle.position.set(newX, -h / 2 + 3, newZ);
    dialCircle.updateMatrix();
    const angleDiffRads = (2 * Math.PI) / 10;
    const magCylArr = [];
    for (let i = 0; i <= 9; i++) {
      const theta = angleDiffRads * i + Math.PI / 2 + angleDiffRads;
      const magXVal =
        newX +
        (moduleInfo.derivedVals.plateWidth / 2 -
          (1.5 + moduleInfo.magnetDiameter / 2)) *
          Math.cos(theta); //x and y are circle center, want to set mag edge minWallWidth inside dial edge
      const magZVal =
        newZ +
        (moduleInfo.derivedVals.plateWidth / 2 -
          (1.5 + moduleInfo.magnetDiameter / 2)) *
          Math.sin(theta); //x and y are circle center
      magCylArr.push(
        this.addMagCyl(magXVal, magYTranslate, magZVal, moduleInfo),
      );
    }

    //this.scene.add(magCyl);
    const knobR = moduleInfo.derivedVals.knobWidth / 2;
    const knobH = moduleInfo.magnetHeight + h + 5;
    const knobAlignCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(knobR, knobR, knobH, 32),
      material,
    );
    knobAlignCyl.position.set(newX, -h / 2 + 3 + 2.5, newZ);
    knobAlignCyl.updateMatrix();
    let dialJSC = await this.convertThreeToJSCAD(dialCircle);
    for (const magCylMesh of magCylArr) {
      const magCylJSC = await this.convertThreeToJSCAD(magCylMesh);
      dialJSC = booleans.subtract(dialJSC, magCylJSC);
    }

    const knobAlignJSC = await this.convertThreeToJSCAD(knobAlignCyl);
    dialJSC = booleans.union([dialJSC, knobAlignJSC]);

    //TODO: Add in text to number dial once I've had time to deal with it
    const dialText = this.addDialDigits(
      newX,
      newZ,
      bottomOfDialCircle + h,
      moduleInfo,
    );
    for (const divot of dialText.divots) {
      const divotJSC = await this.convertThreeToJSCAD(divot);
      dialJSC = booleans.subtract(dialJSC, divotJSC);
    }
    for (const digit of dialText.digits) {
      const digitJSC = await this.convertThreeToJSCAD(digit);
      dialJSC = booleans.union([dialJSC, digitJSC]);
    }
    const completeDialCircle = this.convertJSCADToThree(dialJSC, 0xff0000);
    return completeDialCircle;
  }

  public addDialDigits(
    dialCenterX: number,
    dialCenterZ: number,
    yTranslate: number,
    moduleInfo: EditorData,
  ) {
    const l = moduleInfo.derivedVals.knobWidth + 3,
      w = moduleInfo.derivedVals.knobWidth + 1,
      h = moduleInfo.textDepth + 1,
      newR = moduleInfo.derivedVals.knobWidth + l / 2,
      angleDiffRads = (2 * Math.PI) / 10,
      textRadius =
        moduleInfo.derivedVals.plateWidth / 2 -
        (3 * moduleInfo.derivedVals.knobWidth) / 4,
      angleDiffDeg = 360 / 10;
    const textObj = {
      divots: new Array<THREE.Mesh>(),
      digits: new Array<THREE.Mesh>(),
    };
    for (let i = 0; i < 10; i++) {
      const theta = angleDiffRads * (i + 1) + Math.PI / 2;
      const thetaDeg = angleDiffDeg * (i + 1);
      const newXVal = dialCenterX + newR * Math.cos(theta);
      const newZVal = dialCenterZ + newR * Math.sin(theta);
      const geometry = new THREE.BoxGeometry(w, h, l);
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const divotBox = new THREE.Mesh(geometry, material);
      divotBox.position.set(
        newXVal,
        yTranslate + h / 2 - moduleInfo.textDepth,
        newZVal,
      );
      divotBox.rotation.y = -(theta - Math.PI / 2);
      divotBox.updateMatrix();
      textObj.divots.push(divotBox);
      const textXVal = dialCenterX + textRadius * Math.cos(theta);
      const textZVal = dialCenterZ + textRadius * Math.sin(theta);
      const text = '' + i + '';
      let newWidth;
      if (i === 1) {
        newWidth = w / 4;
      } else {
        newWidth = w / 2;
      }
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
      textObj.digits.push(textMesh);
    }

    return textObj;
  }

  //use after adding bounding cube and boolean diff with layer elsewhere
  //X and Z translation Values mark bottom LEFT corner IE bottom of first character in string
  //Calculate Divot in here based on text bounding box, return an object of form:
  // {textCSG: textCSG, divotCSG: divotCSG}
  public async addText(
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
    //const box = new THREE.Box3();
    const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const myText = new THREE.Mesh(geometry, material);
    myText.geometry.computeBoundingBox();
    const bbox = myText.geometry.boundingBox;
    //console.log(bbox);
    let xWidth, yWidth;
    if (bbox) {
      xWidth = bbox?.max.x - bbox?.min.x;
      yWidth = bbox?.max.y - bbox?.min.y;
      //zWidth = bbox?.max.z - bbox?.min.z;
    } else {
      xWidth = 1;
      yWidth = 1;
      //zWidth = 1;
    }
    //console.log(xWidth + ', ' + yWidth + ', ' + zWidth);

    //this.scene.add(bboxBox);
    const xScale = width / xWidth;
    const yScale = height / yWidth;
    myText.scale.set(xScale, yScale, 1);
    //top of text is in the +y direction to start, readable from +z axis. Baseline left, rear most point is the origin.(matches an svg text or tspan element)
    myText.rotation.x = -(90 * Math.PI) / 180; // make text readable from above
    myText.rotation.z = -(rotation * Math.PI) / 180; //match text rotation from svg
    if (typeof translationY === 'undefined') {
      translationY = 1;
    }
    myText.position.set(translationX, -h / 2 + translationY, translationZ);
    myText.updateMatrix();
    myText.geometry.computeBoundingBox();
    const textJSC = await this.convertThreeToJSCAD(myText);
    const divotGeo = myText.geometry.boundingBox;
    const divotXWidth = divotGeo!.max.x - divotGeo!.min.x;
    const divotYWidth = divotGeo!.max.y - divotGeo!.min.y; //should be equal to h
    const divotZWidth = divotGeo!.max.z - divotGeo!.min.z;
    const boxGeo = new THREE.BoxGeometry(divotXWidth, divotZWidth, divotYWidth);
    const boxmaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    const divotBoxMesh = new THREE.Mesh(boxGeo, boxmaterial);
    divotBoxMesh.position.set(
      translationX + divotXWidth / 2,
      -h / 2 + translationY,
      translationZ - (divotYWidth * 2) / 3,
    );
    divotBoxMesh.updateMatrix();
    const divotJSC = await this.convertThreeToJSCAD(divotBoxMesh);
    //this.scene.add(myText);
    //this.scene.add(divotBoxMesh);
    return { text: textJSC, divot: divotJSC };
  }

  public addTextXCentered(
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
    //const box = new THREE.Box3();
    const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const myText = new THREE.Mesh(geometry, material);
    myText.geometry.computeBoundingBox();
    const bbox = myText.geometry.boundingBox;
    //console.log(bbox);
    let xWidth, yWidth;
    if (bbox) {
      xWidth = bbox?.max.x - bbox?.min.x;
      yWidth = bbox?.max.y - bbox?.min.y;
      //zWidth = bbox?.max.z - bbox?.min.z;
    } else {
      xWidth = 1;
      yWidth = 1;
      //zWidth = 1;
    }
    //console.log(xWidth + ', ' + yWidth + ', ' + zWidth);
    //const boxGeo = new THREE.BoxGeometry(xWidth, yWidth, zWidth);
    //const boxmaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    //const bboxBox = new THREE.Mesh(boxGeo, boxmaterial);
    //this.scene.add(bboxBox);
    const xScale = width / xWidth;
    const yScale = height / yWidth;
    const zRot = -(rotation * Math.PI) / 180;
    myText.scale.set(xScale, yScale, 1);
    //top of text is in the +y direction to start, readable from +z axis. Baseline left, rear most point is the origin.(matches an svg text or tspan element)
    myText.rotation.x = -(90 * Math.PI) / 180; // make text readable from above
    myText.rotation.z = zRot; //match text rotation from svg
    if (typeof translationY === 'undefined') {
      translationY = 1;
    }
    myText.updateMatrix();
    myText.geometry.computeBoundingBox();
    const tBBox = myText.geometry.boundingBox;
    if (tBBox) {
      xWidth = tBBox?.max.x - tBBox?.min.x;
      yWidth = tBBox?.max.y - tBBox?.min.y;
      //zWidth = tBBox?.max.z - tBBox?.min.z;
    } else {
      xWidth = 1;
      yWidth = 1;
      //zWidth = 1;
    }
    let modifier;
    if (inputText === '1') {
      modifier = (xWidth * 3) / 4; //1 doesn't play well with widths. Have modifier here to make it look good
    } else {
      modifier = xWidth / 2;
    }
    myText.position.set(
      translationX - modifier * Math.cos(zRot),
      -h / 2 + translationY,
      translationZ + modifier * Math.sin(zRot),
    );
    myText.updateMatrix();
    return myText;
    //this.scene.add(myText);
  }

  public async createLayer3(): Promise<THREE.Mesh[]> {
    //create top layer, thick enough for min wall plus text thickness, then add slider tracks and holes for dial knob and number window
    const length =
      this.editorData.boundingBox.maxX +
      20 -
      this.editorData.boundingBox.minX +
      20;
    //base should consist of bottom layer, holes for magnets, and path for track/dials
    //dial thickness will be magnetHeight + (gapWidth + minWall) * 2 for slider base track
    //but also add textDepth
    //plus 1 for wiggle room
    const height = this.editorData.minWallWidth + this.editorData.textDepth;
    //this.layer1Height = height;
    const depth =
      this.editorData.boundingBox.maxY +
      20 -
      this.editorData.boundingBox.minY +
      20;
    const geometry = new THREE.BoxGeometry(length, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
    });
    //material.setValues({ opacity: 0.5, transparent: true });
    const layer3Base = new THREE.Mesh(geometry, material);
    layer3Base.position.set(length / 2, -height / 2 + 5, depth / 2); //top should be at 0
    layer3Base.updateMatrix();
    //this.scene.add(layer3Base);
    let layer3JSC = await this.convertThreeToJSCAD(layer3Base);
    for (const module of this.modulesList) {
      if (module['type'] === 0) {
        const slider = await this.addSliderLayer3(
          Number(module['data'][0]),
          Number(module['data'][1]),
          Number(module['data'][2]),
          Number(module['data'][3]),
          module.editorData,
        );
        const sliderJSC = await this.convertThreeToJSCAD(slider[0]);
        layer3JSC = booleans.subtract(layer3JSC, sliderJSC);
      } else if (module['type'] === 1) {
        const dialWindowJSC = await this.addDialWindowLayer3(
          Number(module['data'][0]),
          -height / 2 + 5 + 1,
          Number(module['data'][1]),
          module.editorData,
        );

        layer3JSC = booleans.subtract(layer3JSC, dialWindowJSC);
        const knobHoleJSC = await this.addDialKnobLayer3(
          Number(module['data'][0]),
          -height / 2 + 5 + 1,
          Number(module['data'][1]),
          module.editorData,
        );
        layer3JSC = booleans.subtract(layer3JSC, knobHoleJSC);
        //this.scene.add(dialCircle);
      } else if (module['type'] === 2) {
        const csgObj = await this.addText(
          Number(module['data'][0]),
          Number(module['data'][1]),
          Number(module['data'][2]),
          module['data'][3] + '',
          Number(module['data'][4]),
          Number(module['data'][5]),
          module.editorData,
          5,
        );
        layer3JSC = booleans.subtract(layer3JSC, csgObj.divot);
        layer3JSC = booleans.union([layer3JSC, csgObj.text]);
      } else if (module['type'] === 3) {
        const textModule = module as TextModule;
        const csgObj = await this.addTextLayer3(textModule['meshJSON']);
        layer3JSC = booleans.union([layer3JSC, csgObj]);
      }
    }
    const layer3 = await this.convertJSCADToThree(layer3JSC, 0x00ff00);
    //this.scene.add(layer3);
    return layer3;
  }

  public async createLayer3TextForIntersect(): Promise<THREE.Mesh[]> {
    //create top layer, thick enough for min wall plus text thickness, then add slider tracks and holes for dial knob and number window
    const length =
      this.editorData.boundingBox.maxX +
      20 -
      this.editorData.boundingBox.minX +
      20;
    //base should consist of bottom layer, holes for magnets, and path for track/dials
    //dial thickness will be magnetHeight + (gapWidth + minWall) * 2 for slider base track
    //but also add textDepth
    //plus 1 for wiggle room
    const height = this.editorData.minWallWidth + this.editorData.textDepth;
    //this.layer1Height = height;
    const depth =
      this.editorData.boundingBox.maxY +
      20 -
      this.editorData.boundingBox.minY +
      20;
    const geometry = new THREE.BoxGeometry(length, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
    });
    //material.setValues({ opacity: 0.5, transparent: true });
    const layer3Base = new THREE.Mesh(geometry, material);
    layer3Base.position.set(length / 2, -height / 2 + 5, depth / 2); //top should be at 0
    layer3Base.updateMatrix();
    //this.scene.add(layer3Base);
    let layer3JSC = await this.convertThreeToJSCAD(layer3Base);
    for (const module of this.modulesList) {
      if (module['type'] === 3) {
        const textModule = module as TextModule;
        const csgObj = await this.addTextLayer3(textModule['meshJSON']);
        layer3JSC = booleans.union([layer3JSC, csgObj]);
      }
    }
    const layer3 = await this.convertJSCADToThree(layer3JSC, 0x0000ff);
    //this.scene.add(layer3);
    return layer3;
  }

  //Need to maintain a new slider Length and width but translate based on Layer 1's numbers
  public async addSliderLayer3(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
    moduleInfo: EditorData,
  ): Promise<THREE.Mesh[]> {
    const l = length * moduleInfo.derivedVals.segmentLength + 2; //extra 1 on each end
    const w =
      moduleInfo.derivedVals.sliderRadius * 2 + 2 + 2 * moduleInfo.partGapWidth; //extra 1 on each end
    //window with rounded end caps - union cube and cylinders at either end
    const rectLength = moduleInfo.derivedVals.segmentLength * (length - 1);
    const r = moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const height = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    const endGeometry = new THREE.CylinderGeometry(r, r, height, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xfffff0 });
    const tY = -height / 2 + 5 + 1;
    let newX, newZ, mJSC;
    if (rotation === 0) {
      //vertical
      newX = translateX + w / 2;
      newZ = translateY + l / 2;
      //newX = translateX + r + 1 + moduleInfo.partGapWidth;
      //newZ = translateY + rectLength / 2 + 1 + moduleInfo.partGapWidth;
      const firstCylZ = newZ - rectLength / 2;
      const midGeometry = new THREE.BoxGeometry(2 * r, height, rectLength);
      const midMesh = new THREE.Mesh(midGeometry, material);
      midMesh.position.set(newX, tY, newZ);
      midMesh.updateMatrix();
      const topMesh = new THREE.Mesh(endGeometry, material);
      topMesh.position.set(newX, tY, firstCylZ);
      topMesh.updateMatrix();
      const bottomMesh = new THREE.Mesh(endGeometry, material);
      bottomMesh.position.set(newX, tY, firstCylZ + rectLength);
      bottomMesh.updateMatrix();
      mJSC = await this.convertThreeToJSCAD(midMesh);
      const tJSC = await this.convertThreeToJSCAD(topMesh);
      const bJSC = await this.convertThreeToJSCAD(bottomMesh);
      mJSC = booleans.union([mJSC, tJSC, bJSC]);
    } else {
      newX = translateX + l / 2;
      newZ = translateY + w / 2;
      const firstCylX = newX - rectLength / 2;
      const midGeometry = new THREE.BoxGeometry(rectLength, height, 2 * r);
      const midMesh = new THREE.Mesh(midGeometry, material);
      midMesh.position.set(newX, tY, newZ);
      midMesh.updateMatrix();
      const leftMesh = new THREE.Mesh(endGeometry, material);
      leftMesh.position.set(firstCylX, tY, newZ);
      leftMesh.updateMatrix();
      const rightMesh = new THREE.Mesh(endGeometry, material);
      rightMesh.position.set(firstCylX + rectLength, tY, newZ);
      rightMesh.updateMatrix();
      mJSC = await this.convertThreeToJSCAD(midMesh);
      const rJSC = await this.convertThreeToJSCAD(rightMesh);
      const lJSC = await this.convertThreeToJSCAD(leftMesh);
      mJSC = booleans.union([mJSC, rJSC, lJSC]);
      //sliderLayer3 = CSG.toMesh(mCSG, midMesh.matrix, material);
    }
    const completedSlider = await this.convertJSCADToThree(mJSC, 0xffffff);
    return completedSlider;
  }

  public async addDialWindowLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const l = moduleInfo.derivedVals.knobWidth + 3,
      w = moduleInfo.derivedVals.knobWidth + 1,
      h = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    //hole for dial knob, window for dial numerals
    const newR = moduleInfo.derivedVals.knobWidth + l / 2;

    const theta = Math.PI / 2;
    const newXVal =
      tX + moduleInfo.derivedVals.plateWidth / 2 + newR * Math.cos(theta);
    const newZVal =
      tZ + moduleInfo.derivedVals.plateWidth / 2 + newR * Math.sin(theta);
    const geometry = new THREE.BoxGeometry(w, h, l);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const divotBox = new THREE.Mesh(geometry, material);
    divotBox.position.set(newXVal, tY, newZVal);
    divotBox.updateMatrix();
    const divotBoxJSC = await this.convertThreeToJSCAD(divotBox);
    return divotBoxJSC;
  }

  public async addDialKnobLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ): Promise<Geom3> {
    const r = moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth,
      h = moduleInfo.minWallWidth + moduleInfo.textDepth + 2;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const knobHole = new THREE.Mesh(geometry, material);
    knobHole.position.set(
      tX + moduleInfo.derivedVals.plateWidth / 2,
      tY,
      tZ + moduleInfo.derivedVals.plateWidth / 2,
    );
    knobHole.updateMatrix();
    const knobHoleJSC = await this.convertThreeToJSCAD(knobHole);
    return knobHoleJSC;
  }

  public async addTextLayer3(meshJSON: object): Promise<Geom3> {
    const mesh = this.objectLoader.parse(meshJSON) as THREE.Mesh;
    const textJSC = await this.convertThreeToJSCAD(mesh);
    return textJSC;
  }
}

export { SpellTracker };
