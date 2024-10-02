import { ManifoldWasmService } from './../services/manifold-wasm.service';
import { TrackerModule, TextModule } from '../interfaces/tracker-module';
import { CSG } from './CSGMesh';
import * as THREE from 'three';
import { EditorData } from '../interfaces/editor-data';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
// import { MarchingCubes, edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes';
import fontData from 'three/examples/fonts/droid/droid_sans_regular.typeface.json';
import { ElementRef } from '@angular/core';
import * as deserialize from '@jscad/stl-deserializer';
import * as serialize from '@jscad/stl-serializer';
import { booleans } from '@jscad/modeling/src/index';
import { Geom3 } from '@jscad/modeling/src/geometries/types';
import { PathPosition } from '../interfaces/path-position';
//import { CommandHandler } from './SVGUtils';
import { WebGpuOps } from './web-gpu-ops';
import { CharShape } from '../interfaces/char-shape';
//import { lengths } from '@jscad/modeling/src/curves/bezier';
import {
  Manifold,
  Mat4,
  //Mesh,
  Polygons,
  SimplePolygon,
  Vec2,
} from 'manifold-3d';
import { FrenetFrame } from '../interfaces/frenet-frame';

//import { triangle } from '@jscad/modeling/src/primitives';

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

  public async getAllExtrusions(
    maniServe: ManifoldWasmService,
    shapes: THREE.Shape[],
    size: number,
  ): Promise<Manifold[]> {
    this.manifold = maniServe;
    const manifolds: Manifold[] = [];
    for (const shape of shapes) {
      const manifold = await this.extrudeManifoldTriangles(shape, size);
      manifolds.push(manifold);
    }
    return manifolds;
  }

  public async extrudeManifoldTriangles(
    shape: THREE.Shape,
    size: number,
  ): Promise<Manifold> {
    await this.manifold.init();
    //const catMull2d = this.getCatMull2dFromShape(shape);
    const catMull3d = this.getCatMull3dFromShape(shape);
    const manifolds: Manifold[][] = [];
    for (const curve of catMull3d) {
      const manifold = await this.extrudeUsingFrenetFrames(curve, size);
      manifolds.push(manifold);
    }
    /*console.log(catMull2d);
    const lengths: number[][] = this.getLengthsNested(catMull2d);
    console.log(lengths);
    const manifoldsNested: { mani: Manifold; length: number }[][] =
      await this.getExtrudedManifoldTriangles(lengths, size);

    if (scene !== undefined) {
      for (const manifolds of manifoldsNested) {
        for (const manifold of manifolds) {
          console.log('Trying to add to the scene');
          scene.add(
            this.manifold.manifold2ThreeMesh(
              manifold.mani,
              new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true }),
            ),
          );
        }
        for (const catmulls of catMull3d) {
          console.log('Trying to add to the scene');

          const geometry = new THREE.BufferGeometry().setFromPoints(
            catmulls.getPoints(100),
          );

          const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

          // Create the final object to add to the scene
          const curveObject = new THREE.Line(geometry, material);
          scene.add(curveObject);
        }
      }
    }
    //transform extruded triangles, done in place
    this.transformExtrudedTriangles(catMull2d, manifoldsNested);
    //union them all together
    const finalManifold = this.unionTriangles(manifoldsNested);
    return finalManifold; */
    const maniFinalGroup: Manifold[] = [];
    for (let i = 0; i < manifolds.length; i++) {
      let maniFinal = manifolds[i][0];
      for (let j = 1; j < manifolds[i].length; j++) {
        maniFinal = this.manifold.csgUnion(maniFinal, manifolds[i][j]);
      }
      maniFinalGroup.push(maniFinal);
    }

    let combinedShapeHolesManifold = maniFinalGroup[0];
    for (let i = 1; i < maniFinalGroup.length; i++) {
      combinedShapeHolesManifold = this.manifold.csgUnion(
        combinedShapeHolesManifold,
        maniFinalGroup[i],
      );
    }

    return combinedShapeHolesManifold;
  }

  public async extrudeUsingFrenetFrames(
    catmull: THREE.CatmullRomCurve3,
    triangleHeight: number,
  ): Promise<Manifold[]> {
    const frames = catmull.computeFrenetFrames(100, true);
    const points = catmull.getPoints(100);
    const framesAndPoints: FrenetFrame = { ...frames, points: points };
    return await this.createExtrudedMeshWithManifold(
      framesAndPoints,
      triangleHeight,
    );
  }

  public async transformTriangle(
    frenetFrames: FrenetFrame,
    frameIndex: number,
    triangleHeight: number,
  ): Promise<Manifold> {
    await this.manifold.init();
    const tangent = frenetFrames.tangents[frameIndex];
    const normal = frenetFrames.normals[frameIndex];
    const binormal = frenetFrames.binormals[frameIndex];

    const myCubeToTriPrism = this.manifold.wasm.Manifold.cube(
      [2 * triangleHeight, triangleHeight, tangent.length()],
      true,
    );
    const cubeSideLen = 2 * triangleHeight;
    const helperCube1 = this.manifold.wasm.Manifold.cube(cubeSideLen, true);
    const helperCube2 = this.manifold.wasm.Manifold.cube(cubeSideLen, true);
    const hc1rot = helperCube1.rotate([0, 0, 45]);
    const hc2rot = helperCube2.rotate([0, 0, 45]);
    //center of cube starts at (0, 0). Triangle leg midpoint is at (+- triangleHeight / 2, 0)
    //new center of the cube has to be 2 away from midpoint at right angle to legs, so up cubeSideLen/sqrt(2)
    //and left or right cubeSideLen / sqrt(2)
    const xTranslate = triangleHeight / 2 + triangleHeight / Math.sqrt(2);
    const yTranslate = triangleHeight / Math.sqrt(2); //might be cubeSideLen not tHeight
    const hc1rottrans = hc1rot.translate([-xTranslate, yTranslate, 0]);
    const hc2rottrans = hc2rot.translate([xTranslate, yTranslate, 0]);

    let myTriPrism = this.manifold.csgSubtraction(
      myCubeToTriPrism,
      hc1rottrans,
    );
    myTriPrism = this.manifold.csgSubtraction(myTriPrism, hc2rottrans);
    const cone1 = this.manifold.wasm.Manifold.cylinder(1, 1, 0, 32, true);
    const cone2 = this.manifold.wasm.Manifold.cylinder(1, 1, 0, 32, true);
    const c1rot = cone1.rotate([-90, 0, 0]);
    const c2rot = cone2.rotate([-90, 0, 0]);
    const c1trans = c1rot.translate([0, 0, -tangent.length() / 2]);
    const c2trans = c2rot.translate([0, 0, tangent.length() / 2]);
    let triMani = this.manifold.csgUnion(myTriPrism, c1trans);
    triMani = this.manifold.csgUnion(triMani, c2trans);

    // Create transformation matrix from the Frenet frame

    const transformationMatrix: Mat4 = [
      tangent.x,
      tangent.y,
      tangent.z,
      0,
      normal.x,
      normal.y,
      normal.z,
      0,
      binormal.x,
      binormal.y,
      binormal.z,
      0,
      0,
      0,
      0,
      1,
    ];

    // Apply the transformation to each vertex of the initial triangle
    let transformedTriangle = triMani.transform(transformationMatrix);
    transformedTriangle = transformedTriangle.rotate([0, 0, 90]);
    transformedTriangle = transformedTriangle.translate([
      frenetFrames.points[frameIndex].x,
      frenetFrames.points[frameIndex].y,
      frenetFrames.points[frameIndex].z,
    ]);

    return transformedTriangle;
  }

  // Function to generate the Manifold mesh using Frenet frames and manifold.wasm
  public async createExtrudedMeshWithManifold(
    frenetFrames: FrenetFrame,
    triangleHeight: number,
  ): Promise<Manifold[]> {
    const triangles = [];

    for (let i = 0; i < frenetFrames.tangents.length; i++) {
      const transformedTriangleManifold = await this.transformTriangle(
        frenetFrames,
        i,
        triangleHeight,
      );
      triangles.push(transformedTriangleManifold);
    }
    let trianglesManifold = triangles[0];
    for (let j = 1; j < triangles.length; j++) {
      trianglesManifold = this.manifold.csgUnion(
        trianglesManifold,
        triangles[j],
      );
    }
    return triangles;
  }

  public unionTriangles(
    manifoldsNested: { mani: Manifold; length: number }[][],
  ): Manifold {
    const allUnioned: Manifold[] = [];
    for (const manifolds of manifoldsNested) {
      let unioned: Manifold = manifolds[0].mani;
      for (let i = 1; i < manifolds.length; i++) {
        unioned = this.manifold.csgUnion(unioned, manifolds[i].mani);
      }
      allUnioned.push(unioned);
    }
    let finalManifold = allUnioned[0];
    for (let i = 1; i < allUnioned.length; i++) {
      finalManifold = this.manifold.csgUnion(finalManifold, allUnioned[i]);
    }
    return finalManifold;
  }

  public transformExtrudedTriangles(
    catMull2d: THREE.Vector2[][],
    manifoldsNested: { mani: Manifold; length: number }[][],
  ) {
    const unitVecX = new THREE.Vector2(1, 0);
    catMull2d.forEach((catMull, index1) => {
      catMull.forEach((point, index2) => {
        let vecDiff: THREE.Vector2;
        if (index2 < catMull.length - 1) {
          vecDiff = this.vecDiff(point, catMull[index2 + 1]);
        } else {
          vecDiff = this.vecDiff(point, catMull[0]);
        }
        const angleRads = this.signed2DAngleTo(unitVecX, vecDiff);
        const angleDeg = THREE.MathUtils.radToDeg(angleRads);
        console.log(angleDeg);
        const len = manifoldsNested[index1][index2].length;
        manifoldsNested[index1][index2].mani = manifoldsNested[index1][
          index2
        ].mani.translate([0, (-len * 3) / 2, 0]);
        manifoldsNested[index1][index2].mani = manifoldsNested[index1][
          index2
        ].mani.rotate([90, 0, 0]);
        manifoldsNested[index1][index2].mani = manifoldsNested[index1][
          index2
        ].mani.rotate([0, 0, angleDeg + 90]);
        manifoldsNested[index1][index2].mani = manifoldsNested[index1][
          index2
        ].mani.translate([point.x, point.y, 0]);
        manifoldsNested[index1][index2].mani = manifoldsNested[index1][
          index2
        ].mani.rotate([-90, 0, 0]);
        manifoldsNested[index1][index2].mani = manifoldsNested[index1][
          index2
        ].mani.scale([1, -1, 1]);
      });
    });
  }

  vecDiff(u: THREE.Vector2, v: THREE.Vector2): THREE.Vector2 {
    const diffX = v.x - u.x;
    const diffY = v.y - u.y;
    return new THREE.Vector2(diffX, diffY);
  }

  getNormal(u: THREE.Vector3, v: THREE.Vector3): THREE.Vector3 {
    return new THREE.Plane().setFromCoplanarPoints(new THREE.Vector3(), u, v)
      .normal;
  }

  public signed2DAngleTo(u: THREE.Vector2, v: THREE.Vector2): number {
    // Get the signed angle between u and v, in the range [-pi, pi]
    const u3 = new THREE.Vector3(u.x, u.y, 0);
    const v3 = new THREE.Vector3(v.x, v.y, 0);
    const angle = u3.angleTo(v3);
    const normal = this.getNormal(u3, v3);
    return normal.z * angle;
  }

  public signed3DAngleTo(u: THREE.Vector3, v: THREE.Vector3): number {
    // Get the signed angle between u and v, in the range [-pi, pi]
    const angle = u.angleTo(v);
    const normal = this.getNormal(u, v);
    return normal.z * angle;
  }

  public async getExtrudedManifoldTriangles(
    lengthsNested: number[][],
    size: number,
  ): Promise<{ mani: Manifold; length: number }[][]> {
    const manifoldsNested: { mani: Manifold; length: number }[][] = [];
    for (const lenArr of lengthsNested) {
      const manifolds: { mani: Manifold; length: number }[] = [];
      for (const len of lenArr) {
        const mani = await this.extrudeManifoldTriangle(len, size);
        manifolds.push({ mani: mani, length: len });
      }
      manifoldsNested.push(manifolds);
    }
    return manifoldsNested;
  }

  public async extrudeManifoldTriangle(
    length: number,
    size: number,
  ): Promise<Manifold> {
    await this.manifold.init();
    //const wasm = this.manifold.wasm;
    const pt1: Vec2 = [0, 0];
    const pt2: Vec2 = [size / 2, -size];
    const pt3: Vec2 = [-size / 2, -size];
    const pt4: Vec2 = [0, 0];
    const trianglePoints: SimplePolygon = [pt1, pt2, pt3, pt4];
    const triangle: Polygons = [trianglePoints];
    const triangleCrossSection = new this.manifold.wasm.CrossSection(triangle);
    console.log(length);
    console.log(triangleCrossSection);
    const prism = this.extrudeThreeTriangle(size, length * 3);
    const prismManifold = this.manifold.threeMesh2manifold(prism);
    console.log(
      this.manifold.manifold2ThreeMesh(
        prismManifold,
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
      ),
    );
    return prismManifold;
  }

  public extrudeThreeTriangle(size: number, height: number): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(size / 2, -size);
    shape.lineTo(-size / 2, -size);
    shape.lineTo(0, 0);

    const extrudeSettings = {
      steps: 2,
      depth: height,
      bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  public getCatMull2dFromShape(shape: THREE.Shape): THREE.Vector2[][] {
    const shapePoints = this.addExtraPoints(shape.getPoints());
    const shapeHolePoints = shape.getPointsHoles(12).map((val) => {
      return this.addExtraPoints(val);
    });
    const shapeHoles = [shapePoints, ...shapeHolePoints];
    const shapeHoles3 = this.vec2ToVec3KeepXY(shapeHoles);
    const catMull = this.catMullNestedPoints(shapeHoles3);
    const catMull2d = this.vec3FlatToVec2(catMull);
    return catMull2d;
  }

  public getCatMull3dFromShape(shape: THREE.Shape): THREE.CatmullRomCurve3[] {
    const shapePoints = this.addExtraPoints(shape.getPoints());
    const shapeHolePoints = shape.getPointsHoles(12).map((val) => {
      return this.addExtraPoints(val).reverse();
    });
    const shapeHoles = [shapePoints, ...shapeHolePoints];
    const shapeHoles3 = this.vec2ToVec3KeepXY(shapeHoles);
    const catMull = this.catMullNestedCurve(shapeHoles3);
    return catMull;
  }

  public addExtraPoints(
    points: THREE.Vector2[],
    density = 10,
  ): THREE.Vector2[] {
    const newPoints: THREE.Vector2[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      newPoints.push(p1); // Add the original point

      // Determine the number of segments based on density
      const distance = p1.distanceTo(p2);
      const segments = Math.floor(distance / density);

      // Interpolate points along the straight line segment
      for (let j = 1; j < segments; j++) {
        const t = j / segments;
        const x = THREE.MathUtils.lerp(p1.x, p2.x, t);
        const y = THREE.MathUtils.lerp(p1.y, p2.y, t);
        newPoints.push(new THREE.Vector2(x, y));
      }
    }
    newPoints.push(points[points.length - 1]); // Add the last point
    return newPoints;
  }

  public getLengthsNested(shapes: THREE.Vector2[][]): number[][] {
    const lengthsNested: number[][] = [];
    for (const shape of shapes) {
      const lenArr = this.getLengths(shape);
      lengthsNested.push(lenArr);
    }
    return lengthsNested;
  }

  public vec2ToVec3KeepXY(shapesPoints: THREE.Vector2[][]): THREE.Vector3[][] {
    const shapesPoints3: THREE.Vector3[][] = [];
    for (const shapePoints of shapesPoints) {
      const newShapePoints: THREE.Vector3[] = [];
      for (const point of shapePoints) {
        const newPoint = new THREE.Vector3(point.x, point.y, 0);
        newShapePoints.push(newPoint);
      }
      shapesPoints3.push(newShapePoints);
    }
    return shapesPoints3;
  }

  public catMullNestedPoints(
    shapesPoints: THREE.Vector3[][],
  ): THREE.Vector3[][] {
    const catMull: THREE.CatmullRomCurve3[] = [];
    for (const shapePoints of shapesPoints) {
      const catMullCurve = new THREE.CatmullRomCurve3(shapePoints, true);
      catMull.push(catMullCurve);
    }
    const catMullPoints: THREE.Vector3[][] = [];
    for (const curve of catMull) {
      const points = this.extractCatmullPoints(curve, 100);
      catMullPoints.push(points);
    }
    return catMullPoints;
  }

  public catMullNestedCurve(
    shapesPoints: THREE.Vector3[][],
  ): THREE.CatmullRomCurve3[] {
    const catMull: THREE.CatmullRomCurve3[] = [];
    for (const shapePoints of shapesPoints) {
      const catMullCurve = new THREE.CatmullRomCurve3(shapePoints, true);
      catMull.push(catMullCurve);
    }

    return catMull;
  }
  public extractCatmullPoints(
    curve: THREE.CatmullRomCurve3,
    divisions: number,
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const divisor = 1.0 / divisions;
    for (let i = 0; i < divisions; i++) {
      const point = curve.getPoint(i * divisor);
      points.push(point);
    }
    return points;
  }

  public vec3FlatToVec2(shapesPoints: THREE.Vector3[][]): THREE.Vector2[][] {
    const shapesPoints2: THREE.Vector2[][] = [];
    for (const shapePoints of shapesPoints) {
      const newShapePoints: THREE.Vector2[] = [];
      for (const point of shapePoints) {
        const newPoint = new THREE.Vector2(point.x, point.y);
        newShapePoints.push(newPoint);
      }
      shapesPoints2.push(newShapePoints);
    }
    return shapesPoints2;
  }

  public getLengths(points: THREE.Vector2[]): number[] {
    const lengths: number[] = [];
    const pointCount = points.length;
    for (let i = 0; i < pointCount; i++) {
      if (i === pointCount - 1) {
        lengths.push(this.calcDist(points[i], points[0]));
      } else {
        lengths.push(this.calcDist(points[i], points[i + 1]));
      }
    }
    return lengths;
  }

  public calcDist(pointA: THREE.Vector2, pointB: THREE.Vector2): number {
    const a = pointB.x - pointA.x;
    const b = pointB.y - pointA.y;
    return Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2));
  }

  // Pass in shape and holes separately, union them later
  public extrudeTriangle(
    pathPoints: THREE.Vector3[],
    divisions: number,
    size: number, //size of triangle
  ): THREE.Mesh {
    // Define the triangle shape (right isosceles triangle)
    const triangleShape = new THREE.Shape();
    triangleShape.moveTo(-size / 2, 0);
    triangleShape.lineTo(size / 2, size / 2);
    triangleShape.lineTo(size / 2, -size / 2);
    triangleShape.lineTo(-size / 2, 0);

    const path = new THREE.CatmullRomCurve3(pathPoints, true);
    // Extrude settings
    const extrudeSettings = {
      steps: divisions, // Number of segments along the path
      extrudePath: path,
      bevelEnabled: false, // Disable bevels to keep the shape clean
    };

    // Create the extruded geometry
    const extrudedGeometry = new THREE.ExtrudeGeometry(
      triangleShape,
      extrudeSettings,
    );
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      //wireframe: true,
    });
    const extrudedMesh = new THREE.Mesh(extrudedGeometry, material);

    // Add the extruded mesh to the scene
    return extrudedMesh;
  }

  public updateEditorData(newData: EditorData) {
    this.editorData = newData;
  }

  public updateModulesList(newList: TrackerModule[]) {
    this.modulesList = newList;
  }
  /*
  public async addBaseLayer1(): Promise<THREE.Object3D> {
    return new Promise(async (resolve) => {
      const length =
        this.editorData.boundingBox.maxX +
        20 -
        this.editorData.boundingBox.minX +
        20;
      const layerColor = 0x00ff00;
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
        color: layerColor,
      });
      //material.setValues({ opacity: 0.5, transparent: true });
      const layer1Base = new THREE.Mesh(geometry, material);
      layer1Base.position.set(length / 2, -height / 2, depth / 2); //top should be at 0
      layer1Base.updateMatrix();

      let l1BJSC = await this.convertThreeToJSCAD(layer1Base);


let l1BJSC = this.convertThreeToJSCAD(layer1Base);
      //let l1BCSG = CSG.fromMesh(layer1Base, 0);
      //let moduleIndex = 1;
      for (const module of this.modulesList) {
        if (module['type'] === 0) {
          const track = this.addSliderLayer1(
            Number(module['data'][0]),
            Number(module['data'][1]),
            Number(module['data'][2]),
            Number(module['data'][3]),
            module.editorData,
          );
          const trackCubeJSC = this.convertThreeToJSCAD(track);
          l1BJSC = booleans.subtract(l1BJSC, trackCubeJSC);
          //const trackCubeCSG = CSG.fromMesh(track, moduleIndex);
          //l1BCSG = l1BCSG.subtract(trackCubeCSG);
        } else if (module['type'] === 1) {
          const dialCircle = this.addDialCircle(
            Number(module['data'][0]),
            Number(module['data'][1]),
            module.editorData,
          );
          const dialJSC = this.convertThreeToJSCAD(dialCircle);
          l1BJSC = booleans.subtract(l1BJSC, dialJSC);
          //const dialCSG = CSG.fromMesh(dialCircle, moduleIndex);
          //l1BCSG = l1BCSG.subtract(dialCSG);
        } else if (module['type'] === 2) {
          continue;
        }
        //moduleIndex++;
      }
      //const layer1 = CSG.toMesh(l1BCSG, layer1Base.matrix, layer1Base.material);
      const layer1 = this.convertJSCADToThree(l1BJSC, layerColor);
      layer1.name = 'layer1';
      resolve(layer1);

    });
  } */

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

  /* Only available inside a web worker.
  private convertThreeToJSCADSync(model: THREE.Mesh): Geom3 {
    const meshSTL = this.threeExporter.parse(model, {
      binary: true,
    });
    const blob = new Blob([meshSTL], { type: 'text/plain' });
    //console.log(typeof meshSTL);
    //console.log(meshSTL);
    console.log('Trying with blob');
    const filereader = new FileReaderSync();
    const jscBlob = filereader.readAsArrayBuffer(blob);
    const jscGeom = deserialize.deserialize({ output: 'geometry' }, jscBlob);
    return jscGeom as Geom3;
  }

  private convertJSCADToThreeSync(
    model: Geom3,
    modelColor: number,
  ): THREE.Mesh {
    const stlArray = serialize.serialize({ binary: true }, model);
    const stlBuffer = stlArray[0];
    const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
    const filereader = new FileReaderSync();
    const threeBlob = filereader.readAsArrayBuffer(blob);
    console.log(blob);
    console.log(threeBlob);
    const threeModel = this.threeLoader.parse(threeBlob);
    return new THREE.Mesh(
      threeModel,
      new THREE.MeshStandardMaterial({ color: modelColor }),
    );
  } */

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
      meshArr.push(new THREE.Mesh(geometry, wireFrameMaterial));
      meshArr.push(new THREE.Mesh(geometry, faceMaterial));
      return meshArr;
    }
    return Array(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: modelColor, wireframe: false }),
      ),
    );
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
    //material.setValues({ opacity: 0.5, transparent: true });
    const trackCube = new THREE.Mesh(geometry, material);
    trackCube.position.set(newX, -h / 2 + 1, newZ);
    trackCube.updateMatrix();
    this.applyTransformationMatrix(trackCube);
    const geomArr = [];
    let trackJSC = await this.convertThreeToJSCAD(trackCube);
    geomArr.push(trackJSC);
    //let trackCSG = CSG.fromMesh(trackCube, 0);
    //let cylIndex = 1;
    for (const cyl of cylArr) {
      //const cylCSG = CSG.fromMesh(cyl, cylIndex);
      const cylJSC = await this.convertThreeToJSCAD(cyl);
      geomArr.push(cylJSC);
      //trackCSG = trackCSG.union(cylCSG);
      //cylIndex++;
    }
    trackJSC = booleans.union(geomArr);
    //const trackMesh = CSG.toMesh(
    //trackCSG,
    //trackCube.matrix,
    //trackCube.material,
    //);
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
    //this.scene.add(cylinder);
    return cylinder;
  }

  public async addDialCircle(
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
    const bottomOfDialCircle = -h + 1,
      magYTranslate =
        1 +
        bottomOfDialCircle -
        (moduleInfo.magnetHeight + moduleInfo.partGapWidth + 1) / 2;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    //material.setValues({ opacity: 0.5, transparent: true });
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
    //let dialCSG = CSG.fromMesh(dialCircle);
    unionArr.push(await this.convertThreeToJSCAD(dialCircle));
    //const magCylCSG = CSG.fromMesh(magCyl);
    unionArr.push(await this.convertThreeToJSCAD(magCyl));
    //const knobAlignCSG = CSG.fromMesh(knobAlignCyl);
    unionArr.push(await this.convertThreeToJSCAD(knobAlignCyl));
    const completeDialCircleJSC = booleans.union(unionArr);
    const completeDialCircle = await this.convertJSCADToThree(
      completeDialCircleJSC,
      0xff0000,
    );
    ///dialCSG = dialCSG.union(magCylCSG);
    //dialCSG = dialCSG.union(knobAlignCSG);
    //const completeDialCircle = CSG.toMesh(dialCSG, dialCircle.matrix, material);
    return completeDialCircle;
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
  ): Promise<{ text: CSG; divot: CSG }> {
    const h = moduleInfo.textDepth;
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
    //this.applyTransformationMatrix()`
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
    moduleInfo: EditorData,
    translationY?: number,
  ): THREE.Mesh {
    const h = moduleInfo.textDepth;
    const loader = new FontLoader();
    const loadedFont = loader.parse(fontData);
    const geometry = new TextGeometry(inputText, {
      font: loadedFont,
      size: 8,
      depth: h,
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
            module.editorData,
          );
          meshArr.push(slider);
        } else if (module['type'] === 1) {
          if (typeof genericDialLayer2 === 'undefined') {
            genericDialLayer2 = this.addGenericDialLayer2(module.editorData);
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
    moduleInfo: EditorData,
  ): THREE.Mesh {
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
  public addGenericDialLayer2(moduleInfo: EditorData) {
    const myGenericDialLayer2 = this.addDialLayer2(0, 0, moduleInfo);
    return myGenericDialLayer2;
  }
  public addDialLayer2(
    translationX: number,
    translationY: number,
    moduleInfo: EditorData,
  ): THREE.Mesh {
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
    let dialCSG = CSG.fromMesh(dialCircle);
    for (const magCylMesh of magCylArr) {
      const magCylCSG = CSG.fromMesh(magCylMesh);
      dialCSG = dialCSG.subtract(magCylCSG);
    }

    const knobAlignCSG = CSG.fromMesh(knobAlignCyl);
    dialCSG = dialCSG.union(knobAlignCSG);

    //TODO: Add in text to number dial once I've had time to deal with it
    const dialText = this.addDialDigits(
      newX,
      newZ,
      bottomOfDialCircle + h,
      moduleInfo,
    );
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

  public async createLayer3(): Promise<THREE.Mesh> {
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
            module.editorData,
          );
          layer3CSG = layer3CSG.subtract(slider);
        } else if (module['type'] === 1) {
          const dialWindow = this.addDialWindowLayer3(
            Number(module['data'][0]),
            -height / 2 + 5 + 1,
            Number(module['data'][1]),
            module.editorData,
          );
          layer3CSG = layer3CSG.subtract(dialWindow);
          const knobHole = this.addDialKnobLayer3(
            Number(module['data'][0]),
            -height / 2 + 5 + 1,
            Number(module['data'][1]),
            module.editorData,
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
            module.editorData,
            5,
          );
          csgObj.then((result) => {
            layer3CSG = layer3CSG.subtract(result.divot);
            layer3CSG = layer3CSG.union(result.text);
          });
        } else if (module['type'] === 3) {
          const textModule = module as TextModule;
          const csgObj = this.addTextLayer3(textModule['meshJSON']);
          layer3CSG = layer3CSG.union(csgObj);
        }
      }
      const layer3 = CSG.toMesh(layer3CSG, layer3Base.matrix, material);
      //this.scene.add(layer3);
      resolve(layer3);
    });
  }

  public async createLayer3TextForIntersect(): Promise<THREE.Mesh> {
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
        if (module['type'] === 3) {
          const textModule = module as TextModule;
          const csgObj = this.addTextLayer3(textModule['meshJSON']);
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
    moduleInfo: EditorData,
  ) {
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
    let newX, newZ, mCSG;
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

  public addDialWindowLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ) {
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
    return CSG.fromMesh(divotBox);
  }

  public addDialKnobLayer3(
    tX: number,
    tY: number,
    tZ: number,
    moduleInfo: EditorData,
  ) {
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
    return CSG.fromMesh(knobHole);
  }

  public addTextLayer3(meshJSON: object): CSG {
    const mesh = this.objectLoader.parse(meshJSON) as THREE.Mesh;
    const textCSG = CSG.fromMesh(mesh);
    return textCSG;
  }

  //call this on each shape and hole
  public addTextTriangleExtrusion(
    shape: (PathPosition | THREE.Vec2)[],
  ): THREE.Mesh {
    const pathPos3d = WebGpuOps.convertPathPosArrayToTHREEVec3(shape);
    const mesh = this.extrudeTriangle(pathPos3d, 50, 2);
    return mesh;
  }

  //public async extrudeCharVert(shape: CharShape): Promise<Geom3> {

  //}

  public async extrudeCharTri(shape: CharShape): Promise<THREE.Mesh> {
    const shapeMesh = this.addTextTriangleExtrusion(shape.shape);
    const extrudedMeshArr: THREE.Mesh[] = [];
    extrudedMeshArr.push(shapeMesh);
    for (const hole of shape.holes) {
      const holeMesh = this.addTextTriangleExtrusion(hole.reverse());
      extrudedMeshArr.push(holeMesh);
    }
    const jscadArr: Geom3[] = [];
    for (const mesh of extrudedMeshArr) {
      const jscadMesh = await this.convertThreeToJSCAD(mesh);
      jscadArr.push(jscadMesh);
    }
    const unionedJSCAD = await booleans.union(jscadArr);
    const unionedThree = await this.convertJSCADToThree(unionedJSCAD, 0xffffff);
    //unionedThree.material.wireframe = true;
    return unionedThree[0];
  }

  public async extrudeAllCharsTri(shapes: CharShape[]): Promise<THREE.Mesh[]> {
    const allMeshes: THREE.Mesh[] = [];
    for (const shape of shapes) {
      allMeshes.push(await this.extrudeCharTri(shape));
    }
    return allMeshes;
  }
}

export { SpellTracker };
