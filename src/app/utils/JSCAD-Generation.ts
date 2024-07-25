import { TrackerModule, TextModule } from '../interfaces/tracker-module';
import { CSG } from './CSGMesh';
import { EditorData } from '../interfaces/editor-data';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import fontData from 'three/examples/fonts/droid/droid_sans_regular.typeface.json';
import { ElementRef } from '@angular/core';
import {
  primitives,
  text,
  extrusions,
  booleans,
  transforms,
} from '@jscad/modeling';
import { Geom3 } from '@jscad/modeling/src/geometries/types';

class SpellTracker {
  public editorData!: EditorData;
  public layer1Height!: number;
  public modulesList!: TrackerModule[];
  // Vertex shader
  private vsSource = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;
  // Fragment shader for CSG operations
  private fsSource = `
      precision highp float;

      // Distance functions for basic shapes
      float sphereSDF(vec3 p, float r) {
        return length(p) - r;
      }

      float boxSDF(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
      }

      // CSG operations
      float opUnion(float d1, float d2) {
        return min(d1, d2);
      }

      float opIntersection(float d1, float d2) {
        return max(d1, d2);
      }

      float opDifference(float d1, float d2) {
        return max(d1, -d2);
      }

      // Combine shapes using CSG
      float getDistance(vec3 p) {
        float d1 = sphereSDF(p - vec3(0.5, 0.0, 0.0), 0.5);
        float d2 = boxSDF(p + vec3(0.5, 0.0, 0.0), vec3(0.3));
        return opDifference(d1, d2);
      }

      // Ray marching
      vec3 getNormal(vec3 p) {
        float eps = 0.001;
        vec3 n;
        n.x = getDistance(p + vec3(eps, 0.0, 0.0)) - getDistance(p - vec3(eps, 0.0, 0.0));
        n.y = getDistance(p + vec3(0.0, eps, 0.0)) - getDistance(p - vec3(0.0, eps, 0.0));
        n.z = getDistance(p + vec3(0.0, 0.0, eps)) - getDistance(p - vec3(0.0, 0.0, eps));
        return normalize(n);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(640.0, 480.0) * 2.0 - 1.0;
        vec3 ro = vec3(0.0, 0.0, 5.0); // Ray origin
        vec3 rd = normalize(vec3(uv, -1.0)); // Ray direction

        float t = 0.0;
        for (int i = 0; i < 100; i++) {
          vec3 p = ro + t * rd;
          float d = getDistance(p);
          if (d < 0.001) {
            vec3 n = getNormal(p);
            vec3 lightDir = normalize(vec3(1.0, 1.0, -1.0));
            float diff = max(dot(n, lightDir), 0.0);
            gl_FragColor = vec4(vec3(diff), 1.0);
            return;
          }
          t += d;
        }

        gl_FragColor = vec4(0.0); // Background color
      }
    `;

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

  public updateEditorData(newData: EditorData) {
    this.editorData = newData;
  }

  public updateModulesList(newList: TrackerModule[]) {
    this.modulesList = newList;
  }

  public addBaseLayer1(): Promise<Geom3> {
    return new Promise((resolve) => {
      const length =
        this.editorData.boundingBox.maxX +
        20 -
        this.editorData.boundingBox.minX +
        20;
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
      let l1B = primitives.cuboid({ size: [length, height, depth] });

      let moduleIndex = 1;
      for (const module of this.modulesList) {
        if (module['type'] === 0) {
          const track = this.addSliderLayer1(
            Number(module['data'][0]),
            Number(module['data'][1]),
            Number(module['data'][2]),
            Number(module['data'][3]),
            module.editorData,
          );
          l1B = booleans.subtract(l1B, track);
        } else if (module['type'] === 1) {
          const dialCircle = this.addDialCircle(
            Number(module['data'][0]),
            Number(module['data'][1]),
            module.editorData,
          );
          l1B = booleans.subtract(l1B, dialCircle);
        } else if (module['type'] === 2) {
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        moduleIndex++;
      }

      resolve(l1B);
    });
  }

  public addSliderLayer1(
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

    const tL = rotation === 0 ? w : l;
    const tD = rotation === 0 ? l : w;
    const newX = rotation === 0 ? translateX + w / 2 : translateX + l / 2;
    const newZ = rotation === 0 ? translateY + l / 2 : translateY + w / 2;

    let track = primitives.cuboid({ size: [tL, h, tD] });
    const cylArr = [];

    for (let i = 0; i < length; i++) {
      const magX =
        rotation === 0
          ? newX
          : translateX +
            moduleInfo.derivedVals.segmentLength / 2 +
            i * moduleInfo.derivedVals.segmentLength;
      const magZ =
        rotation === 0
          ? translateY +
            moduleInfo.derivedVals.segmentLength / 2 +
            i * moduleInfo.derivedVals.segmentLength
          : newZ;
      cylArr.push(this.addMagCyl(magX, -h / 2 + 1, magZ, moduleInfo));
    }

    for (const cyl of cylArr) {
      track = booleans.union(track, cyl);
    }

    return track;
  }

  public addMagCyl(tX: number, tY: number, tZ: number, moduleInfo: EditorData) {
    const r = moduleInfo.magnetDiameter / 2 + moduleInfo.partGapWidth;
    const h = moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1;
    const geometry = primitives.cylinder({
      height: h,
      radius: r,
      center: [tX, tY, tZ],
    });
    return geometry;
  }

  public addDialCircle(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData,
  ) {
    const r = moduleInfo.derivedVals.plateWidth / 2 + moduleInfo.partGapWidth;
    const h =
      moduleInfo.partGapWidth +
      moduleInfo.minWallWidth +
      moduleInfo.textDepth +
      moduleInfo.magnetHeight +
      1;
    const newX = translationX + r;
    const newZ = translationY + r;
    let dial = primitives.cylinder({
      height: h,
      radius: r,
      center: [newX, -h / 2 + 1, newZ],
    });

    const magCyl = this.addMagCyl(
      newX,
      -h / 2 + 1,
      newZ +
        (moduleInfo.derivedVals.plateWidth / 2 -
          (1.5 + moduleInfo.magnetDiameter / 2)),
      moduleInfo,
    );

    const knobR =
      moduleInfo.derivedVals.knobWidth / 2 + moduleInfo.partGapWidth;
    const knobH = moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1;
    const knobAlignCyl = primitives.cylinder({
      height: knobH,
      radius: knobR,
      center: [newX, -h / 2 + 1, newZ],
    });

    dial = booleans.union(dial, magCyl);
    dial = booleans.union(dial, knobAlignCyl);
    return dial;
  }

  public addText(
    rotation: number,
    translationX: number,
    translationZ: number,
    inputText: string,
    width: number,
    height: number,
    moduleInfo: EditorData,
    translationY?: number,
  ): { text: Geom3; divot: Geom3 } {
    const h = moduleInfo.textDepth;
    const loader = new FontLoader();
    const loadedFont = loader.parse(fontData);
    const textGeo = text.vectorText({
      xOffset: 0,
      yOffset: 0,
      input: inputText,
    });

    const geometry = extrusions.extrudeLinear({ height: h }, textGeo);
    const bbox = primitives.measureBoundingBox(geometry);

    const xWidth = bbox[1][0] - bbox[0][0];
    const yWidth = bbox[1][1] - bbox[0][1];

    const xScale = width / xWidth;
    const yScale = height / yWidth;
    geometry.scale([xScale, yScale, 1]);

    geometry.rotate([-(90 * Math.PI) / 180, 0, -(rotation * Math.PI) / 180]);

    if (typeof translationY === 'undefined') {
      translationY = 1;
    }

    geometry.center([translationX, -h / 2 + translationY, translationZ]);

    const divotGeo = primitives.cuboid({
      size: [xWidth * xScale, h, yWidth * yScale],
      center: [
        translationX + (xWidth * xScale) / 2,
        -h / 2 + translationY,
        translationZ - (yWidth * yScale) / 2,
      ],
    });

    return { text: geometry, divot: divotGeo };
  }

  // ... Other methods go here
}

export { SpellTracker };
