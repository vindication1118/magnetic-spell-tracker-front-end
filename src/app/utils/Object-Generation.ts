import { TrackerModule } from '../interfaces/tracker-module';
import { CSG } from './CSGMesh';
import * as THREE from 'three';
import { EditorData } from '../interfaces/editor-data';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
//import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import fontData from 'three/examples/fonts/droid/droid_sans_regular.typeface.json';
import { ThreePath } from './Three-Path';

class SpellTracker {
  public editorData!: EditorData;
  public layer1Height!: number;
  public modulesList!: TrackerModule[];

  constructor(editorData: EditorData, modulesList: TrackerModule[]) {
    this.editorData = editorData;
    this.modulesList = modulesList;
    this.layer1Height =
      this.editorData.magnetHeight +
      (this.editorData.partGapWidth + this.editorData.minWallWidth) * 2 +
      this.editorData.textDepth +
      1;
  }

  public updateEditorData(newData: EditorData) {
    this.editorData = newData;
  }

  public updateModulesList(newList: TrackerModule[]) {
    this.modulesList = newList;
  }

  public addBaseLayer1(): Promise<THREE.Object3D> {
    return new Promise((resolve) => {
      const length =
        this.editorData.boundingBox.maxX +
        20 -
        this.editorData.boundingBox.minX +
        20;
      //base should consist of bottom layer, holes for magnets, and path for track/dials
      //dial thickness will be magnetHeight + (gapWidth + minWall) * 2 for slider base track
      //but also add textDepth
      //plus 1 for wiggle room
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
      const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
      });
      //material.setValues({ opacity: 0.5, transparent: true });
      const layer1Base = new THREE.Mesh(geometry, material);
      layer1Base.position.set(length / 2, -height / 2, depth / 2); //top should be at 0
      layer1Base.updateMatrix();
      let l1BCSG = CSG.fromMesh(layer1Base, 0);
      let moduleIndex = 1;
      for (const module of this.modulesList) {
        if (module['type'] === 0) {
          const track = this.addSliderLayer1(
            Number(module['data'][0]),
            Number(module['data'][1]),
            Number(module['data'][2]),
            Number(module['data'][3]),
          );
          const trackCubeCSG = CSG.fromMesh(track, moduleIndex);
          l1BCSG = l1BCSG.subtract(trackCubeCSG);
        } else if (module['type'] === 1) {
          const dialCircle = this.addDialCircle(
            Number(module['data'][0]),
            Number(module['data'][1]),
          );
          const dialCSG = CSG.fromMesh(dialCircle, moduleIndex);
          l1BCSG = l1BCSG.subtract(dialCSG);
        } else if (module['type'] === 2) {
          continue;
        }
        moduleIndex++;
      }
      const layer1 = CSG.toMesh(l1BCSG, layer1Base.matrix, layer1Base.material);
      layer1.name = 'layer1';
      resolve(layer1);
    });
  }

  public addSliderLayer1(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
  ) {
    const l = length * this.editorData.derivedVals.segmentLength + 2; //extra 1 on each end
    const w =
      this.editorData.derivedVals.sliderRadius * 2 +
      2 +
      2 * this.editorData.partGapWidth; //extra 1 on each end
    const h =
      this.editorData.partGapWidth +
      this.editorData.minWallWidth +
      this.editorData.textDepth +
      this.editorData.magnetHeight +
      1; // want this sticking out of surface of base cube by 1
    let tL, tD, newX, newZ;
    const cylArr = [],
      //bottom of track cube minus half of height plus 1
      bottomOfTrackCube = -h + 1,
      magYTranslate =
        1 +
        bottomOfTrackCube -
        (this.editorData.magnetHeight + this.editorData.partGapWidth + 1) / 2;
    if (rotation === 0) {
      //vertical
      tL = w;
      tD = l;
      newX = translateX + w / 2;
      newZ = translateY + l / 2;
      const firstCylZ =
        1 + translateY + this.editorData.derivedVals.segmentLength / 2;
      for (let i = 0; i < length; i++) {
        cylArr.push(
          this.addMagCyl(
            newX,
            magYTranslate,
            firstCylZ + i * this.editorData.derivedVals.segmentLength,
          ),
        );
      }
    } else {
      tL = l;
      tD = w;
      const firstCylX =
        1 + translateX + this.editorData.derivedVals.segmentLength / 2;
      newX = translateX + l / 2;
      newZ = translateY + w / 2;
      for (let i = 0; i < length; i++) {
        cylArr.push(
          this.addMagCyl(
            firstCylX + i * this.editorData.derivedVals.segmentLength,
            magYTranslate,
            newZ,
          ),
        );
      }
    }
    const geometry = new THREE.BoxGeometry(tL, h, tD);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    //material.setValues({ opacity: 0.5, transparent: true });
    const trackCube = new THREE.Mesh(geometry, material);
    trackCube.position.set(newX, -h / 2 + 1, newZ);
    trackCube.updateMatrix();
    let trackCSG = CSG.fromMesh(trackCube, 0);
    let cylIndex = 1;
    for (const cyl of cylArr) {
      const cylCSG = CSG.fromMesh(cyl, cylIndex);
      trackCSG = trackCSG.union(cylCSG);
      cylIndex++;
    }
    const trackMesh = CSG.toMesh(
      trackCSG,
      trackCube.matrix,
      trackCube.material,
    );
    return trackMesh;
  }

  public addMagCyl(tX: number, tY: number, tZ: number) {
    const r = this.editorData.magnetDiameter / 2 + this.editorData.partGapWidth;
    const h = this.editorData.magnetHeight + this.editorData.partGapWidth + 1;
    const radialSegments = 32; //maybe overkill
    const geometry = new THREE.CylinderGeometry(r, r, h, radialSegments);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.position.set(tX, tY, tZ);
    cylinder.updateMatrix();
    //this.scene.add(cylinder);
    return cylinder;
  }

  public addDialCircle(translationX: number, translationY: number) {
    const r =
      this.editorData.derivedVals.plateWidth / 2 + this.editorData.partGapWidth;
    const h =
      this.editorData.partGapWidth +
      this.editorData.minWallWidth +
      this.editorData.textDepth +
      this.editorData.magnetHeight +
      1;
    const newX = translationX + r;
    const newZ = translationY + r;
    const bottomOfDialCircle = -h + 1,
      magYTranslate =
        1 +
        bottomOfDialCircle -
        (this.editorData.magnetHeight + this.editorData.partGapWidth + 1) / 2;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    //material.setValues({ opacity: 0.5, transparent: true });
    const dialCircle = new THREE.Mesh(geometry, material);
    dialCircle.position.set(newX, -h / 2 + 1, newZ);
    dialCircle.updateMatrix();
    const magCyl = this.addMagCyl(
      newX,
      magYTranslate,
      newZ +
        (this.editorData.derivedVals.plateWidth / 2 -
          (1.5 + this.editorData.magnetDiameter / 2)),
    );
    const knobR =
      this.editorData.derivedVals.knobWidth / 2 + this.editorData.partGapWidth;
    const knobH =
      this.editorData.magnetHeight + this.editorData.partGapWidth + 1;
    const knobAlignCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(knobR, knobR, knobH, 32),
      material,
    );
    knobAlignCyl.position.set(newX, magYTranslate, newZ);
    knobAlignCyl.updateMatrix();
    let dialCSG = CSG.fromMesh(dialCircle);
    const magCylCSG = CSG.fromMesh(magCyl);
    const knobAlignCSG = CSG.fromMesh(knobAlignCyl);
    dialCSG = dialCSG.union(magCylCSG);
    dialCSG = dialCSG.union(knobAlignCSG);
    const completeDialCircle = CSG.toMesh(dialCSG, dialCircle.matrix, material);
    return completeDialCircle;
  }

  //use after adding bounding cube and boolean diff with layer elsewhere
  //X and Z translation Values mark bottom LEFT corner IE bottom of first character in string
  //Calculate Divot in here based on text bounding box, return an object of form:
  // {textCSG: textCSG, divotCSG: divotCSG}
  public addText(
    rotation: number,
    translationX: number,
    translationZ: number,
    inputText: string,
    width: number,
    height: number,
    translationY?: number,
  ): { text: CSG; divot: CSG } {
    const h = this.editorData.textDepth;
    const loader = new FontLoader();
    const loadedFont = loader.parse(fontData);
    const geometry = new TextGeometry(inputText, {
      font: loadedFont,
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
    const textCSG = CSG.fromMesh(myText);
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
    const divotCSG = CSG.fromMesh(divotBoxMesh);
    //this.scene.add(myText);
    //this.scene.add(divotBoxMesh);
    return { text: textCSG, divot: divotCSG };
  }
  /*  */
  public addTextXCentered(
    rotation: number,
    translationX: number,
    translationZ: number,
    inputText: string,
    width: number,
    height: number,
    translationY?: number,
  ): THREE.Mesh {
    const h = this.editorData.textDepth;
    const loader = new FontLoader();
    const loadedFont = loader.parse(fontData);
    const geometry = new TextGeometry(inputText, {
      font: loadedFont,
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

  //reusable params: magnet extrusion heights and y positions per layer
  /*
    {
      all: {
        magExtHeight: magnetHeight + 1
      }
      l1: {
        layerBottomY: 0,
        magExtY: someValue
      },
      l2: {
        layerBottomY: layer1Thickness + 2,
        magExtY: someValue related to magThick plus extra height

      },
      l3: {
        layerBottomY: layer1Thickness + 2 + layer2Thickness + 2,
        textbottomY: layerTop - text thickness?
      }
    }
  */

  //No text

  public createLayer2(): Promise<THREE.Mesh[]> {
    return new Promise((resolve) => {
      const meshArr: THREE.Mesh[] = [];
      const r = this.editorData.derivedVals.plateWidth / 2;
      let genericDialLayer2;
      for (const module of this.modulesList) {
        if (module['type'] === 0) {
          const slider = this.addSliderLayer2(
            Number(module['data'][0]),
            Number(module['data'][1]),
            Number(module['data'][2]),
            Number(module['data'][3]),
          );
          meshArr.push(slider);
        } else if (module['type'] === 1) {
          if (typeof genericDialLayer2 === 'undefined') {
            genericDialLayer2 = this.addGenericDialLayer2();
          }
          const dialCircle = genericDialLayer2.clone();
          dialCircle.position.setComponent(0, Number(module['data'][0]) + r);
          dialCircle.position.setComponent(2, Number(module['data'][1]) + r);
          dialCircle.updateMatrix();
          /*const dialCircle = this.addDialLayer2(
          Number(module['data'][0]),
          Number(module['data'][1]),
        );*/
          meshArr.push(dialCircle);
        } else if (module['type'] === 2) {
          continue;
        }
      }
      resolve(meshArr);
    });
  }

  //cylinder and rectangle for each slider, ezpz
  public addSliderLayer2(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
  ): THREE.Mesh {
    const l = this.editorData.derivedVals.segmentLength + 2; //extra 1 on each end
    const w = this.editorData.derivedVals.sliderRadius * 2 + 2; //same as layer 1 but no part gap
    const h =
      this.editorData.minWallWidth +
      this.editorData.textDepth +
      this.editorData.magnetHeight; // same as layer 1 but no part gap
    let sL, sD, newX, newZ;
    //bottom of track cube minus height plus 3
    const bottomOfSliderCube = -h + 3,
      magYTranslate =
        -1 +
        bottomOfSliderCube +
        (this.editorData.magnetHeight + this.editorData.partGapWidth + 1) / 2; //stick out bottom
    if (rotation === 0) {
      //vertical
      sL = w;
      sD = l;
      newX = translateX + w / 2 + this.editorData.partGapWidth / 2;
      newZ = translateY + l / 2;
    } else {
      sL = l;
      sD = w;
      newX = translateX + l / 2;
      newZ = translateY + w / 2 + this.editorData.partGapWidth / 2;
    }
    const knobR = this.editorData.derivedVals.knobWidth / 2;
    const geometry = new THREE.BoxGeometry(sL, h, sD);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    //material.setValues({ opacity: 0.5, transparent: true });
    const sliderCube = new THREE.Mesh(geometry, material);
    sliderCube.position.set(newX, -h / 2 + 3, newZ);
    sliderCube.updateMatrix();
    const magCyl = this.addMagCyl(newX, magYTranslate, newZ);
    //this.scene.add(magCyl);
    let sliderCSG = CSG.fromMesh(sliderCube, 0);
    const magCylCSG = CSG.fromMesh(magCyl, 1);
    const knobCylGeo = new THREE.CylinderGeometry(knobR, knobR, h + 5, 32, 32);
    const knobCylMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const knobCyl = new THREE.Mesh(knobCylGeo, knobCylMaterial);
    knobCyl.position.set(newX, (-h + 5) / 2 + 3, newZ);
    //this.scene.add(knobCyl);
    knobCyl.updateMatrix();
    const knobCylCSG = CSG.fromMesh(knobCyl, 2);
    sliderCSG = sliderCSG.union(knobCylCSG);
    sliderCSG = sliderCSG.subtract(magCylCSG);
    const completeSlider = CSG.toMesh(sliderCSG, sliderCube.matrix, material);
    completeSlider.name = 'sliderLayer2';
    return completeSlider;
  }
  public addGenericDialLayer2() {
    const myGenericDialLayer2 = this.addDialLayer2(0, 0);
    return myGenericDialLayer2;
  }
  public addDialLayer2(translationX: number, translationY: number): THREE.Mesh {
    //small tall cylinder, large flat cylinder, boolean difference magnet cylinders, engrave text
    const r = this.editorData.derivedVals.plateWidth / 2; //same as before but no part gap
    const h =
      this.editorData.minWallWidth +
      this.editorData.magnetHeight +
      this.editorData.textDepth; //same as before but no part gap and no extra + 1 to stick out of surface
    const newX = translationX + r;
    const newZ = translationY + r;
    const bottomOfDialCircle = -h + 3,
      magYTranslate =
        -1 +
        bottomOfDialCircle +
        (this.editorData.magnetHeight + this.editorData.partGapWidth + 1) / 2;
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
        (this.editorData.derivedVals.plateWidth / 2 -
          (1.5 + this.editorData.magnetDiameter / 2)) *
          Math.cos(theta); //x and y are circle center, want to set mag edge minWallWidth inside dial edge
      const magZVal =
        newZ +
        (this.editorData.derivedVals.plateWidth / 2 -
          (1.5 + this.editorData.magnetDiameter / 2)) *
          Math.sin(theta); //x and y are circle center
      magCylArr.push(this.addMagCyl(magXVal, magYTranslate, magZVal));
    }

    //this.scene.add(magCyl);
    const knobR = this.editorData.derivedVals.knobWidth / 2;
    const knobH = this.editorData.magnetHeight + h + 5;
    const knobAlignCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(knobR, knobR, knobH, 32),
      material,
    );
    knobAlignCyl.position.set(newX, -h / 2 + 3 + 2.5, newZ);
    knobAlignCyl.updateMatrix();
    let dialCSG = CSG.fromMesh(dialCircle);
    for (const magCylMesh of magCylArr) {
      const magCylCSG = CSG.fromMesh(magCylMesh);
      dialCSG = dialCSG.subtract(magCylCSG);
    }

    const knobAlignCSG = CSG.fromMesh(knobAlignCyl);
    dialCSG = dialCSG.union(knobAlignCSG);

    //TODO: Add in text to number dial once I've had time to deal with it
    const dialText = this.addDialDigits(newX, newZ, bottomOfDialCircle + h);
    for (const divot of dialText.divots) {
      const divotCSG = CSG.fromMesh(divot);
      dialCSG = dialCSG.subtract(divotCSG);
    }
    for (const digit of dialText.digits) {
      const digitCSG = CSG.fromMesh(digit);
      dialCSG = dialCSG.union(digitCSG);
    }
    const completeDialCircle = CSG.toMesh(dialCSG, dialCircle.matrix, material);
    completeDialCircle.name = 'dialLayer2';
    return completeDialCircle;
  }

  public addDialDigits(
    dialCenterX: number,
    dialCenterZ: number,
    yTranslate: number,
  ) {
    const l = this.editorData.derivedVals.knobWidth + 3,
      w = this.editorData.derivedVals.knobWidth + 1,
      h = this.editorData.textDepth + 1,
      newR = this.editorData.derivedVals.knobWidth + l / 2,
      angleDiffRads = (2 * Math.PI) / 10,
      textRadius =
        this.editorData.derivedVals.plateWidth / 2 -
        (3 * this.editorData.derivedVals.knobWidth) / 4,
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
        yTranslate + h / 2 - this.editorData.textDepth,
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
        yTranslate - this.editorData.textDepth / 2,
      );
      textObj.digits.push(textMesh);
    }
    return textObj;
  }

  public createLayer3(): Promise<THREE.Mesh> {
    return new Promise((resolve) => {
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
      let layer3CSG = CSG.fromMesh(layer3Base);
      for (const module of this.modulesList) {
        if (module['type'] === 0) {
          const slider = this.addSliderLayer3(
            Number(module['data'][0]),
            Number(module['data'][1]),
            Number(module['data'][2]),
            Number(module['data'][3]),
          );
          layer3CSG = layer3CSG.subtract(slider);
        } else if (module['type'] === 1) {
          const dialWindow = this.addDialWindowLayer3(
            Number(module['data'][0]),
            -height / 2 + 5 + 1,
            Number(module['data'][1]),
          );
          layer3CSG = layer3CSG.subtract(dialWindow);
          const knobHole = this.addDialKnobLayer3(
            Number(module['data'][0]),
            -height / 2 + 5 + 1,
            Number(module['data'][1]),
          );
          layer3CSG = layer3CSG.subtract(knobHole);
          //this.scene.add(dialCircle);
        } else if (module['type'] === 2) {
          const csgObj = this.addText(
            Number(module['data'][0]),
            Number(module['data'][1]),
            Number(module['data'][2]),
            module['data'][3] + '',
            Number(module['data'][4]),
            Number(module['data'][5]),
            5,
          );
          layer3CSG = layer3CSG.subtract(csgObj.divot);
          layer3CSG = layer3CSG.union(csgObj.text);
        } else if (module['type'] === 3) {
          const csgObj = this.addTextLayer3(module['data'][3] as string);
          layer3CSG = layer3CSG.union(csgObj);
        }
      }
      const layer3 = CSG.toMesh(layer3CSG, layer3Base.matrix, material);
      //this.scene.add(layer3);
      resolve(layer3);
    });
  }

  /**Need to maintain a new slider Length and width but translate based on Layer 1's numbers */
  public addSliderLayer3(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
  ) {
    const l = length * this.editorData.derivedVals.segmentLength + 2; //extra 1 on each end
    const w =
      this.editorData.derivedVals.sliderRadius * 2 +
      2 +
      2 * this.editorData.partGapWidth; //extra 1 on each end
    //window with rounded end caps - union cube and cylinders at either end
    const rectLength = this.editorData.derivedVals.segmentLength * (length - 1);
    const r =
      this.editorData.derivedVals.knobWidth / 2 + this.editorData.partGapWidth;
    const height = this.editorData.minWallWidth + this.editorData.textDepth + 2;
    const endGeometry = new THREE.CylinderGeometry(r, r, height, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xfffff0 });
    const tY = -height / 2 + 5 + 1;
    let newX, newZ, mCSG;
    if (rotation === 0) {
      //vertical
      newX = translateX + w / 2;
      newZ = translateY + l / 2;
      //newX = translateX + r + 1 + this.editorData.partGapWidth;
      //newZ = translateY + rectLength / 2 + 1 + this.editorData.partGapWidth;
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
      mCSG = CSG.fromMesh(midMesh);
      const tCSG = CSG.fromMesh(topMesh);
      const bCSG = CSG.fromMesh(bottomMesh);
      mCSG = mCSG.union(tCSG);
      mCSG = mCSG.union(bCSG);
      //sliderLayer3 = CSG.toMesh(mCSG, midMesh.matrix, material);
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
      mCSG = CSG.fromMesh(midMesh);
      const rCSG = CSG.fromMesh(rightMesh);
      const lCSG = CSG.fromMesh(leftMesh);
      mCSG = mCSG.union(rCSG);
      mCSG = mCSG.union(lCSG);
      //sliderLayer3 = CSG.toMesh(mCSG, midMesh.matrix, material);
    }
    return mCSG;
  }

  public addDialWindowLayer3(tX: number, tY: number, tZ: number) {
    const l = this.editorData.derivedVals.knobWidth + 3,
      w = this.editorData.derivedVals.knobWidth + 1,
      h = this.editorData.minWallWidth + this.editorData.textDepth + 2;
    //hole for dial knob, window for dial numerals
    const newR = this.editorData.derivedVals.knobWidth + l / 2;

    const theta = Math.PI / 2;
    const newXVal =
      tX + this.editorData.derivedVals.plateWidth / 2 + newR * Math.cos(theta);
    const newZVal =
      tZ + this.editorData.derivedVals.plateWidth / 2 + newR * Math.sin(theta);
    const geometry = new THREE.BoxGeometry(w, h, l);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const divotBox = new THREE.Mesh(geometry, material);
    divotBox.position.set(newXVal, tY, newZVal);
    divotBox.updateMatrix();
    return CSG.fromMesh(divotBox);
  }

  public addDialKnobLayer3(tX: number, tY: number, tZ: number) {
    const r =
        this.editorData.derivedVals.knobWidth / 2 +
        this.editorData.partGapWidth,
      h = this.editorData.minWallWidth + this.editorData.textDepth + 2;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const knobHole = new THREE.Mesh(geometry, material);
    knobHole.position.set(
      tX + this.editorData.derivedVals.plateWidth / 2,
      tY,
      tZ + this.editorData.derivedVals.plateWidth / 2,
    );
    knobHole.updateMatrix();
    return CSG.fromMesh(knobHole);
  }

  public addTextLayer3(svgPathNode: string): CSG {
    const layer3Height =
      this.editorData.minWallWidth + this.editorData.textDepth;
    const yTranslate = layer3Height / 2 + 5 - this.editorData.textDepth;
    //boolean difference rectangle, union text
    //console.log('Test 1');
    const loader = new ThreePath();
    const data = loader.parse(svgPathNode);
    const paths = data.paths;
    console.log('Test 1');

    const shapes = [];

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      const shapesTemp = path.toShapes(true);
      shapes.push(...shapesTemp);
    }

    // Assuming you want to extrude the shape
    const extrudeSettings = {
      steps: 2,
      depth: this.editorData.textDepth * 2,
      bevelEnabled: false,
      bevelThickness: 0,
      bevelSize: 0,
      bevelOffset: 0,
      bevelSegments: 0,
    };

    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.position.y = yTranslate;
    mesh.updateMatrix();
    const textCSG = CSG.fromMesh(mesh);
    return textCSG;

    // Add the mesh to your scene

    //this.scene.add(mesh);
  }
}

export { SpellTracker };
