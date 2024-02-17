import * as THREE from 'three';
import { EditorData } from '../../interfaces/editor-data';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import fontData from 'three/examples/fonts/droid/droid_sans_regular.typeface.json';
import { CSG } from '../../utils/CSGMesh';
/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const myMesh = addBaseLayer1(data).toJSON();
  postMessage(myMesh);
  createLayer2(data);
});
const editorData: EditorData = {
  magnetDiameter: 2,
  magnetHeight: 1,
  partGapWidth: 0.15,
  minWallWidth: 1.5,
  textPrintOpt: 2,
  textDepth: 0.5,
  bedDimensionX: 200,
  bedDimensionY: 200,
  derivedVals: {
    sliderRadius: 1.15 + 2.5,
    segmentLength: 2 + 0.3 + 4,
    knobWidth: 2 + 0.3 + 4,
    plateWidth: 6 * 6.3,
    plateHeight: 0.5 + 1.5 + 1,
  },
  boundingBox: {
    minX: 20,
    minY: 20,
    maxX: 141.8,
    maxY: 141.8,
  },
};
let layer1Height;

function addBaseLayer1(data): THREE.Object3D {
  //return new Promise((resolve) => {
  const length =
    editorData.boundingBox.maxX + 20 - editorData.boundingBox.minX + 20;
  //base should consist of bottom layer, holes for magnets, and path for track/dials
  //dial thickness will be magnetHeight + (gapWidth + minWall) * 2 for slider base track
  //but also add textDepth
  //plus 1 for wiggle room
  const height =
    editorData.magnetHeight +
    (editorData.partGapWidth + editorData.minWallWidth) * 2 +
    editorData.textDepth +
    1;
  layer1Height = height;
  const depth =
    editorData.boundingBox.maxY + 20 - editorData.boundingBox.minY + 20;
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
  for (const module of data) {
    if (module['type'] === 0) {
      const track = addSliderLayer1(
        Number(module['data'][0]),
        Number(module['data'][1]),
        Number(module['data'][2]),
        Number(module['data'][3]),
      );
      const trackCubeCSG = CSG.fromMesh(track, moduleIndex);
      l1BCSG = l1BCSG.subtract(trackCubeCSG);
    } else if (module['type'] === 1) {
      const dialCircle = addDialCircle(
        Number(module['data'][0]),
        Number(module['data'][1]),
      );
      const dialCSG = CSG.fromMesh(dialCircle, moduleIndex);
      l1BCSG = l1BCSG.subtract(dialCSG);
    } else if (module['type'] === 2) {
      addText(
        Number(module['data'][0]),
        Number(module['data'][1]),
        Number(module['data'][2]),
        module['data'][3] + '',
        Number(module['data'][4]),
        Number(module['data'][5]),
      );
    }
    moduleIndex++;
  }
  const layer1 = CSG.toMesh(l1BCSG, layer1Base.matrix, layer1Base.material);
  return layer1;
  //});
}

function addSliderLayer1(
  length: number,
  rotation: number,
  translateX: number,
  translateY: number,
) {
  const l = length * editorData.derivedVals.segmentLength + 2; //extra 1 on each end
  const w =
    editorData.derivedVals.sliderRadius * 2 + 2 + 2 * editorData.partGapWidth; //extra 1 on each end
  const h =
    editorData.partGapWidth +
    editorData.minWallWidth +
    editorData.textDepth +
    editorData.magnetHeight +
    1; // want this sticking out of surface of base cube by 1
  let tL, tD, newX, newZ;
  const cylArr = [],
    //bottom of track cube minus half of height plus 1
    bottomOfTrackCube = -h + 1,
    magYTranslate =
      1 +
      bottomOfTrackCube -
      (editorData.magnetHeight + editorData.partGapWidth + 1) / 2;
  if (rotation === 0) {
    //vertical
    tL = w;
    tD = l;
    newX = translateX + w / 2;
    newZ = translateY + l / 2;
    const firstCylZ = 1 + translateY + editorData.derivedVals.segmentLength / 2;
    for (let i = 0; i < length; i++) {
      cylArr.push(
        addMagCyl(
          newX,
          magYTranslate,
          firstCylZ + i * editorData.derivedVals.segmentLength,
        ),
      );
    }
  } else {
    tL = l;
    tD = w;
    const firstCylX = 1 + translateX + editorData.derivedVals.segmentLength / 2;
    newX = translateX + l / 2;
    newZ = translateY + w / 2;
    for (let i = 0; i < length; i++) {
      cylArr.push(
        addMagCyl(
          firstCylX + i * editorData.derivedVals.segmentLength,
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
  const trackMesh = CSG.toMesh(trackCSG, trackCube.matrix, trackCube.material);
  return trackMesh;
}

function addMagCyl(tX: number, tY: number, tZ: number) {
  const r = editorData.magnetDiameter / 2 + editorData.partGapWidth;
  const h = editorData.magnetHeight + editorData.partGapWidth + 1;
  const radialSegments = 32; //maybe overkill
  const geometry = new THREE.CylinderGeometry(r, r, h, radialSegments);
  const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.position.set(tX, tY, tZ);
  cylinder.updateMatrix();
  //scene.add(cylinder);
  return cylinder;
}

function addDialCircle(translationX: number, translationY: number) {
  const r = editorData.derivedVals.plateWidth / 2 + editorData.partGapWidth;
  const h =
    editorData.partGapWidth +
    editorData.minWallWidth +
    editorData.textDepth +
    editorData.magnetHeight +
    1;
  const newX = translationX + r;
  const newZ = translationY + r;
  const bottomOfDialCircle = -h + 1,
    magYTranslate =
      1 +
      bottomOfDialCircle -
      (editorData.magnetHeight + editorData.partGapWidth + 1) / 2;
  const geometry = new THREE.CylinderGeometry(r, r, h, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  //material.setValues({ opacity: 0.5, transparent: true });
  const dialCircle = new THREE.Mesh(geometry, material);
  dialCircle.position.set(newX, -h / 2 + 1, newZ);
  dialCircle.updateMatrix();
  const magCyl = addMagCyl(
    newX,
    magYTranslate,
    newZ +
      (editorData.derivedVals.plateWidth / 2 -
        (1.5 + editorData.magnetDiameter / 2)),
  );
  const knobR = editorData.derivedVals.knobWidth / 2 + editorData.partGapWidth;
  const knobH = editorData.magnetHeight + editorData.partGapWidth + 1;
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
function addText(
  rotation: number,
  translationX: number,
  translationZ: number,
  inputText: string,
  width: number,
  height: number,
  translationY?: number,
): THREE.Mesh {
  const h = editorData.textDepth;
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
  //scene.add(bboxBox);
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
  return myText;
  //scene.add(myText);
}
/*  */
function addTextXCentered(
  rotation: number,
  translationX: number,
  translationZ: number,
  inputText: string,
  width: number,
  height: number,
  translationY?: number,
): THREE.Mesh {
  const h = editorData.textDepth;
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
  //scene.add(bboxBox);
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
  //scene.add(myText);
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

function createLayer2(data) {
  //return new Promise((resolve) => {
  const meshArr: THREE.Mesh[] = [];
  const r = editorData.derivedVals.plateWidth / 2;
  let genericDialLayer2;
  for (const module of data) {
    if (module['type'] === 0) {
      const slider = addSliderLayer2(
        Number(module['data'][0]),
        Number(module['data'][1]),
        Number(module['data'][2]),
        Number(module['data'][3]),
      );
      postMessage(slider.toJSON());
    } else if (module['type'] === 1) {
      if (typeof genericDialLayer2 === 'undefined') {
        genericDialLayer2 = addGenericDialLayer2();
      }
      const dialCircle = genericDialLayer2.clone();
      dialCircle.position.setComponent(0, Number(module['data'][0]) + r);
      dialCircle.position.setComponent(2, Number(module['data'][1]) + r);
      dialCircle.updateMatrix();
      /*const dialCircle = addDialLayer2(
          Number(module['data'][0]),
          Number(module['data'][1]),
        );*/
      postMessage(dialCircle.toJSON());
    } else if (module['type'] === 2) {
      continue;
    }
  }
  //});
}

//cylinder and rectangle for each slider, ezpz
function addSliderLayer2(
  length: number,
  rotation: number,
  translateX: number,
  translateY: number,
): THREE.Mesh {
  const l = editorData.derivedVals.segmentLength + 2; //extra 1 on each end
  const w = editorData.derivedVals.sliderRadius * 2 + 2; //same as layer 1 but no part gap
  const h =
    editorData.minWallWidth + editorData.textDepth + editorData.magnetHeight; // same as layer 1 but no part gap
  let sL, sD, newX, newZ;
  //bottom of track cube minus height plus 3
  const bottomOfSliderCube = -h + 3,
    magYTranslate =
      -1 +
      bottomOfSliderCube +
      (editorData.magnetHeight + editorData.partGapWidth + 1) / 2; //stick out bottom
  if (rotation === 0) {
    //vertical
    sL = w;
    sD = l;
    newX = translateX + w / 2 + editorData.partGapWidth / 2;
    newZ = translateY + l / 2;
  } else {
    sL = l;
    sD = w;
    newX = translateX + l / 2;
    newZ = translateY + w / 2 + editorData.partGapWidth / 2;
  }
  const knobR = editorData.derivedVals.knobWidth / 2;
  const geometry = new THREE.BoxGeometry(sL, h, sD);
  const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
  //material.setValues({ opacity: 0.5, transparent: true });
  const sliderCube = new THREE.Mesh(geometry, material);
  sliderCube.position.set(newX, -h / 2 + 3, newZ);
  sliderCube.updateMatrix();
  const magCyl = addMagCyl(newX, magYTranslate, newZ);
  //scene.add(magCyl);
  let sliderCSG = CSG.fromMesh(sliderCube, 0);
  const magCylCSG = CSG.fromMesh(magCyl, 1);
  const knobCylGeo = new THREE.CylinderGeometry(knobR, knobR, h + 5, 32, 32);
  const knobCylMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const knobCyl = new THREE.Mesh(knobCylGeo, knobCylMaterial);
  knobCyl.position.set(newX, (-h + 5) / 2 + 3, newZ);
  //scene.add(knobCyl);
  knobCyl.updateMatrix();
  const knobCylCSG = CSG.fromMesh(knobCyl, 2);
  sliderCSG = sliderCSG.union(knobCylCSG);
  sliderCSG = sliderCSG.subtract(magCylCSG);
  const completeSlider = CSG.toMesh(sliderCSG, sliderCube.matrix, material);
  return completeSlider;
}
function addGenericDialLayer2() {
  const myGenericDialLayer2 = addDialLayer2(0, 0);
  return myGenericDialLayer2;
}
function addDialLayer2(translationX: number, translationY: number): THREE.Mesh {
  //small tall cylinder, large flat cylinder, boolean difference magnet cylinders, engrave text
  const r = editorData.derivedVals.plateWidth / 2; //same as before but no part gap
  const h =
    editorData.minWallWidth + editorData.magnetHeight + editorData.textDepth; //same as before but no part gap and no extra + 1 to stick out of surface
  const newX = translationX + r;
  const newZ = translationY + r;
  const bottomOfDialCircle = -h + 3,
    magYTranslate =
      -1 +
      bottomOfDialCircle +
      (editorData.magnetHeight + editorData.partGapWidth + 1) / 2;
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
      (editorData.derivedVals.plateWidth / 2 -
        (1.5 + editorData.magnetDiameter / 2)) *
        Math.cos(theta); //x and y are circle center, want to set mag edge minWallWidth inside dial edge
    const magZVal =
      newZ +
      (editorData.derivedVals.plateWidth / 2 -
        (1.5 + editorData.magnetDiameter / 2)) *
        Math.sin(theta); //x and y are circle center
    magCylArr.push(addMagCyl(magXVal, magYTranslate, magZVal));
  }

  //scene.add(magCyl);
  const knobR = editorData.derivedVals.knobWidth / 2;
  const knobH = editorData.magnetHeight + h + 5;
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
  const dialText = addDialDigits(newX, newZ, bottomOfDialCircle + h);
  for (const divot of dialText.divots) {
    const divotCSG = CSG.fromMesh(divot);
    dialCSG = dialCSG.subtract(divotCSG);
  }
  for (const digit of dialText.digits) {
    const digitCSG = CSG.fromMesh(digit);
    dialCSG = dialCSG.union(digitCSG);
  }
  const completeDialCircle = CSG.toMesh(dialCSG, dialCircle.matrix, material);
  return completeDialCircle;
}

function addDialDigits(
  dialCenterX: number,
  dialCenterZ: number,
  yTranslate: number,
) {
  const l = editorData.derivedVals.knobWidth + 3,
    w = editorData.derivedVals.knobWidth + 1,
    h = editorData.textDepth + 1,
    newR = editorData.derivedVals.knobWidth + l / 2,
    angleDiffRads = (2 * Math.PI) / 10,
    textRadius =
      editorData.derivedVals.plateWidth / 2 -
      (3 * editorData.derivedVals.knobWidth) / 4,
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
      yTranslate + h / 2 - editorData.textDepth,
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
    const textMesh = addTextXCentered(
      thetaDeg,
      textXVal,
      textZVal,
      text,
      newWidth,
      l / 2,
      yTranslate - editorData.textDepth / 2,
    );
    textObj.digits.push(textMesh);
  }
  return textObj;
}

function createLayer3(data): Promise<THREE.Mesh> {
  return new Promise((resolve) => {
    //create top layer, thick enough for min wall plus text thickness, then add slider tracks and holes for dial knob and number window
    const length =
      editorData.boundingBox.maxX + 20 - editorData.boundingBox.minX + 20;
    //base should consist of bottom layer, holes for magnets, and path for track/dials
    //dial thickness will be magnetHeight + (gapWidth + minWall) * 2 for slider base track
    //but also add textDepth
    //plus 1 for wiggle room
    const height = editorData.minWallWidth + editorData.textDepth;
    //layer1Height = height;
    const depth =
      editorData.boundingBox.maxY + 20 - editorData.boundingBox.minY + 20;
    const geometry = new THREE.BoxGeometry(length, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
    });
    //material.setValues({ opacity: 0.5, transparent: true });
    const layer3Base = new THREE.Mesh(geometry, material);
    layer3Base.position.set(length / 2, -height / 2 + 5, depth / 2); //top should be at 0
    layer3Base.updateMatrix();
    for (const module of data) {
      if (module['type'] === 0) {
        const slider = addSliderLayer3(
          Number(module['data'][0]),
          Number(module['data'][1]),
          Number(module['data'][2]),
          Number(module['data'][3]),
        );
        //scene.add(slider);
      } else if (module['type'] === 1) {
        const dialCircle = addDialLayer3(
          Number(module['data'][0]),
          Number(module['data'][1]),
        );
        //scene.add(dialCircle);
      } else if (module['type'] === 2) {
        continue;
      }
    }
    resolve(layer3Base);
  });
}

function addSliderLayer3(
  length: number,
  rotation: number,
  translateX: number,
  translateY: number,
) {
  //window with rounded end caps - union cube and cylinders at either end
  const rectLength = editorData.derivedVals.segmentLength * (length - 1);
  const r = editorData.derivedVals.knobWidth / 2 + editorData.partGapWidth;
  if (rotation === 0) {
    //vertical
  } else {
  }
}

function addDialLayer3(tX: number, tY: number) {
  //hole for dial knob, window for dial numerals
}

function addTextLayer3() {
  //boolean difference rectangle, union text
}

//function addMagneticCylinder(length, width, translateX, translateY) {}
