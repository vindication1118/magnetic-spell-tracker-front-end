/**
 * Extrude Along a Bezier Path
 * @category Creating Shapes
 * @skillLevel 5
 * @description Using a 3D bezier path to create a solid tube
 * @tags curves, bezier, extrusion, slice
 * @authors Simon Clark
 * @licence MIT License
 */

import { colors, geometries, maths, extrusions } from '@jscad/modeling';
import { cuboid, circle /*, polygon*/ } from '@jscad/modeling/src/primitives';
import { rotate, translate } from '@jscad/modeling/src/operations/transforms';
import {
  extrudeLinear,
  //extrudeRectangular,
  //extrudeRotate,
  slice,
} from '@jscad/modeling/src/operations/extrusions';
import { bezier } from '@jscad/modeling/src/curves';
import { Mat4, Vec2, Vec3 } from '@jscad/modeling/src/maths/types';
import { Vec3 as mVec3 } from 'manifold-3d';
import {
  Colored,
  Geom2,
  Geom3,
  Poly3,
} from '@jscad/modeling/src/geometries/types';
//import { degToRad } from '@jscad/modeling/src/utils';
import { create, fromRotation } from '@jscad/modeling/src/maths/mat4';
import { SplitCorners } from '../interfaces/split-corners';
import { angle } from '@jscad/modeling/src/maths/vec3';
import { IJscadFrenetFrames } from '../interfaces/jscad-frenet-frames';
//import geom2 from '@jscad/modeling/src/geometries/geom2';
import poly3 from '@jscad/modeling/src/geometries/poly3';
import geom3 from '@jscad/modeling/src/geometries/geom3';
import { union } from '@jscad/modeling/src/operations/booleans';
import { hull } from '@jscad/modeling/src/operations/hulls';
import { ManifoldWasmService } from '../services/manifold-wasm.service';
import { JscadExtractedData } from '../interfaces/jscad-extracted-data';
import { JscadFlattenedData } from '../interfaces/jscad-flattened-data';
import { Manifold } from 'manifold-3d';
import { CharShapeData } from '../interfaces/char-shape-data';
import { CharShapeGeometry } from '../interfaces/char-shape-geometry';

export class pathExtruder {
  shapes3D = [
    {
      box4x4: [
        [-8, -4, 2],
        [1, 0, 0],
      ],
    },
    {
      box4x4: [
        [8, 4, 12],
        [0, 1, 0],
      ],
    },
    {
      tube: [
        [6, 4, 12],
        [-3, 4, 12],
        [4, -4, 2],
        [-6, -4, 2],
      ],
    },
    {
      tube: [
        [8, 2, 12],
        [8, -6, 12],
        [8, 0, 0],
        [-8, 4, 2],
        [-8, -2, 2],
      ],
    },
  ];

  public static tube(bezierControlPoints: Vec3[]) {
    // Create the initial slice
    const circ = circle({ radius: 1, segments: 32 });
    const l = bezierControlPoints.length - 1;
    const circPoints = geometries.geom2.toPoints(circ);
    let tubeSlice = slice.fromPoints(circPoints);

    // Rotate it close to the direction we are going in.  Rotation gets funky around 180˚
    const bezierDelta = maths.vec3.clone([
      bezierControlPoints[l][0] - bezierControlPoints[0][0],
      bezierControlPoints[l][1] - bezierControlPoints[0][1],
      bezierControlPoints[l][2] - bezierControlPoints[0][2],
    ]);
    tubeSlice = slice.transform(
      this.rotationMatrixFromVectors(maths.vec3.clone([0, 0, 1]), bezierDelta),
      tubeSlice,
    );

    // Create the bezier function
    const tubeCurve = bezier.create(bezierControlPoints);

    // ...and extrude.
    return extrusions.extrudeFromSlices(
      {
        numberOfSlices: 10,
        capStart: true,
        capEnd: true,
        callback: (progress, count, base) => {
          const positionArray = bezier.valueAt(progress, tubeCurve);
          const myTangent = bezier.tangentAt(progress, tubeCurve);
          const tangentArray = this.arrayOrNumToVec3(myTangent);
          const rotationMatrix = this.rotationMatrixFromVectors(
            bezierDelta,
            maths.vec3.clone(tangentArray),
          );
          const translationMatrix = maths.mat4.fromTranslation(
            maths.mat4.create(),
            this.arrayOrNumToVec3(positionArray),
          );
          return slice.transform(
            maths.mat4.multiply(
              translationMatrix,
              translationMatrix,
              rotationMatrix,
            ),
            base,
          );
        },
      },
      tubeSlice,
    );
  }

  public static extractVerticesAndFaces(geom: Geom3): JscadExtractedData {
    const polygons = geom3.toPolygons(geom);

    const vertices: Vec3[] = [];
    const faces: number[][] = [];
    const vertexMap = new Map<string, number>(); // To keep track of unique vertices
    let vertexIndex = 0;

    polygons.forEach((polygon) => {
      const face: number[] = [];

      polygon.vertices.forEach((vertex) => {
        const v = vertex as Vec3;
        const key = `${v[0]}_${v[1]}_${v[2]}`; // Use a key to uniquely identify the vertex

        if (!vertexMap.has(key)) {
          // If the vertex hasn't been added yet, add it to the list
          vertices.push([v[0], v[1], v[2]]);
          vertexMap.set(key, vertexIndex);
          vertexIndex++;
        }

        // Add the vertex index to the face
        face.push(vertexMap.get(key) as number);
      });

      // Each face is a list of indices referencing the vertex list
      faces.push(face);
    });

    return { vertices, faces };
  }

  public static flattenVerticesAndFaces(
    vertices: Vec3[],
    faces: number[][],
  ): JscadFlattenedData {
    const flatVertices: Float32Array = new Float32Array(vertices.flat()); // Flatten the array of vertices
    const flatFaces: Uint32Array = new Uint32Array(faces.flat()); // Flatten the array of face indices

    return { flatVertices, flatFaces };
  }

  public static createManifoldFromJSCAD(
    geom: Geom3,
    mani: ManifoldWasmService,
  ): Manifold {
    // Step 1: Extract vertices and faces from JSCAD Geom3
    const { vertices, faces } = this.extractVerticesAndFaces(geom);

    // Step 2: Flatten the data for manifold-3d
    const { flatVertices, flatFaces } = this.flattenVerticesAndFaces(
      vertices,
      faces,
    );

    // Step 3: Create the Manifold object
    const manimesh = new mani.wasm.Mesh({
      numProp: 3,
      vertProperties: flatVertices,
      triVerts: flatFaces as Uint32Array,
    });

    const manifold = new mani.wasm.Manifold(manimesh);

    return manifold;
  }

  public static testExtrude(
    triangleHeight: number,
    otherShapes?: CharShapeData[],
  ): CharShapeGeometry[] {
    //each shape or hole is an mVec3[]
    //store together in an array since we want to union the extusions
    //of each shape and hole but we don't want hulls to get screwed up
    //so we do mVec3[][]
    //Now we have multiple characters or character parts so we
    //put them in an array for mVec3[][][]
    //but Each of these is made of an array of prisms which is each an mVec3[]
    //so we get mVec3[][][][]
    const exts: CharShapeGeometry[] = [];

    const triPoints: Vec2[] = [
      [0, 0],
      [-triangleHeight, -triangleHeight],
      [triangleHeight, -triangleHeight],
    ];
    //const triPoly = polygon({ points: triPoints });

    otherShapes?.forEach((sh) => {
      // possibly unecessary since we're unioning double hulls, and those
      // complete the loop
      //if (!this.samePoints(sh[0], sh[sh.length - 1])) {
      //  sh?.push(sh[0]);
      //}
      if (!this.isWhitespace(sh.character)) {
        const shapeAndHolesGeo: mVec3[][][] = [];
        const shapeGeo = this.extrudeShapeAlongPath(triPoints, sh.shape);
        shapeAndHolesGeo.push(shapeGeo);
        const holesGeo: mVec3[][][] = [];
        sh.holes.forEach((hole) => {
          holesGeo.push(this.extrudeShapeAlongPath(triPoints, hole));
        });
        shapeAndHolesGeo.push(...holesGeo);
        const CSGeo: CharShapeGeometry = {
          shapeAndHoles: shapeAndHolesGeo,
          character: sh.character,
          index: sh.index,
        };
        exts.push(CSGeo);
      }
      //exts.push(manifold);
      //exts.push(...geos);
      /*if (!this.samePoints(sh[0], sh[sh.length - 1])) {
        sh?.push(sh[0]);
      }*/
      /*const shPts = geom2.fromPoints(this.v3toV2(sh));
      console.log(shPts);
      try {
        geom2.validate(shPts);
      } catch (e) {
        console.log(e);
      }

      //const rect = extrudeRectangular({}, shPts);
      //exts.push(rect);

      const splitCorners = this.splitCorners(sh);
      console.log(splitCorners);
      splitCorners.nonLinear.forEach((section, index) => {
        console.log(index);
        const ctlPts = this.getBezierControlPoints(section);
        //const charExt = this.extrudeAlongPath(section, ctlPts, triPoly, true);
        const geo = geom2.fromPoints(this.v3toV2(section));
        const outlines = geom2.toOutlines(geo);
        //outlines.forEach((outline) => {
        const charExt = extrudeRectangular({ height: 2, size: 2 }, geo);
        console.log(charExt);
        //exts.push(charExt);
        //});
      });
      const pointSet = this.removeDuplicateVectors(splitCorners.endCaps);
      pointSet.forEach((point) => {
        let cone = extrudeRotate(
          {
            angle: 2 * Math.PI,
            startAngle: 0,
            segments: 32,
          },
          triPoly,
        );
        cone = rotate([degToRad(180), 0, 0], cone);
        cone = translate(point, cone);
        //exts.push(cone);
      });
      splitCorners.linear.forEach((section) => {
        //const charExt = this.doExtrudeLinear(section, triPoly);
        const sec2 = this.v3toV2(section);
        const geo = geom2.fromPoints(sec2);
        console.log(geo);
        const charExt = extrudeRectangular({ height: 0.5, size: 0.1 }, geo);
        exts.push(charExt);
        //exts.push(charExt);
      }); */
    });

    return exts;
  }

  public static isWhitespace(char: string): boolean {
    return char.trim() === '';
  }

  public static removeDuplicateVectors(points: Vec3[]): Set<Vec3> {
    const pointSet = new Set(points);
    return pointSet;
  }

  public static v3toV2(sh: Vec3[]): Vec2[] {
    const ret: Vec2[] = [];
    sh.forEach((pt) => {
      ret.push([pt[0], pt[1]]);
    });
    return ret;
  }

  // Function to generate a Mat4 that rotates the shape from XY to XZ and aligns its normal to a line segment in the XY plane
  public static generateRotationMatrixForNormalAlignment(
    lineSegmentXY: Vec3,
  ): Mat4 {
    const TAU = Math.PI * 2;
    //let matrix = fromRotation(create(), TAU / 4, [1, 0, 0]);
    const matrixZ = fromRotation(create(), TAU / 4, [1, 0, 0]);

    const angle = this.angleBetweenVectors(
      [0, 1, 0],
      [lineSegmentXY[0], lineSegmentXY[1], 0],
    );
    //matrix = fromRotation(matrix, 0, [0, 0, 1]);
    const matrixAngle = fromRotation(create(), angle, [0, 0, 1]);
    const combined = this.multiplyMat4(matrixZ, matrixAngle);
    return combined;
  }

  // Function to multiply two 4x4 matrices (Mat4)
  public static multiplyMat4(A: Mat4, B: Mat4): Mat4 {
    const result: Mat4 = new Array<number>(16).fill(0) as Mat4;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        result[row * 4 + col] =
          A[row * 4 + 0] * B[0 * 4 + col] +
          A[row * 4 + 1] * B[1 * 4 + col] +
          A[row * 4 + 2] * B[2 * 4 + col] +
          A[row * 4 + 3] * B[3 * 4 + col];
      }
    }

    return result;
  }

  public static extrudeAlongPath(
    inputShape: Vec3[],
    bezierControlPoints: Vec3[],
    extShape: Geom2,
    xyPlane: boolean = false,
  ): Geom3 {
    // Create the initial slice

    const l = bezierControlPoints.length - 1;
    const shapePoints = geometries.geom2.toPoints(extShape);
    let shapeSlice = slice.fromPoints(shapePoints);

    // Rotate it close to the direction we are going in.  Rotation gets funky around 180˚
    const bezierDelta = maths.vec3.clone([
      bezierControlPoints[l][0] - bezierControlPoints[0][0],
      bezierControlPoints[l][1] - bezierControlPoints[0][1],
      bezierControlPoints[l][2] - bezierControlPoints[0][2],
    ]);

    const inputShapeDelta = maths.vec3.clone([
      inputShape[1][0] - inputShape[0][0],
      inputShape[1][1] - inputShape[0][1],
      inputShape[1][2] - inputShape[0][2],
    ]);

    if (xyPlane) {
      shapeSlice = slice.transform(
        this.rotationMatrixFromVectors(
          maths.vec3.clone([0, 0, 1]),
          maths.vec3.clone([0, 1, 0]),
        ),
        shapeSlice,
      );
      shapeSlice = slice.transform(
        this.rotationMatrixFromVectors(
          maths.vec3.clone([0, 1, 0]),
          inputShapeDelta,
        ),
        shapeSlice,
      );
    } else {
      shapeSlice = slice.transform(
        this.rotationMatrixFromVectors(
          maths.vec3.clone([0, 0, 1]),
          bezierDelta,
        ),
        shapeSlice,
      );
    }

    // Create the bezier function
    const shapeCurve = bezier.create(bezierControlPoints);

    // ...and extrude.
    return extrusions.extrudeFromSlices(
      {
        numberOfSlices: 10,
        capStart: false,
        capEnd: false,
        callback: (progress, count, base) => {
          const positionArray = this.reduceVec3Precision(
            this.arrayOrNumToVec3(bezier.valueAt(progress, shapeCurve)),
            6,
          );

          const tangentArray = this.reduceVec3Precision(
            this.arrayOrNumToVec3(bezier.tangentAt(progress, shapeCurve)),
            6,
          );

          const rotationMatrix = this.reduceMat4Precision(
            this.rotationMatrixFromVectors(
              bezierDelta,
              maths.vec3.clone(tangentArray),
            ),
            6,
          );

          const translationMatrix = this.reduceMat4Precision(
            maths.mat4.fromTranslation(
              maths.mat4.create(),
              this.arrayOrNumToVec3(positionArray),
            ),
            6,
          );

          const myTransformedSlice = slice.transform(
            maths.mat4.multiply(
              translationMatrix,
              translationMatrix,
              rotationMatrix,
            ),
            base,
          );

          return myTransformedSlice;
        },
      },
      shapeSlice,
    );
  }

  public static doExtrudeLinear(inputShape: Vec3[], extShape: Geom2): Geom3 {
    const v0 = inputShape[0];
    const vLast = inputShape[inputShape.length - 1];
    const dist = maths.vec3.distance(vLast, v0);
    let ext = extrudeLinear({ height: dist }, extShape);
    const direction = this.subtract(vLast, v0);
    let angleDiff = angle([0, 1, 0], direction);
    if (direction[0] > 0) {
      angleDiff = angleDiff + Math.PI;
    }

    ext = rotate([-Math.PI / 2, 0, 0], ext);
    ext = rotate([0, 0, angleDiff], ext);
    ext = translate(v0, ext);
    return ext;
  }
  public static extrudeAlongLine(
    inputShape: Vec3[],
    extShape: Geom2,
    xyPlane: boolean = false,
  ): Geom3 {
    // Create the initial slice

    const l = inputShape.length - 1;
    const shapePoints = geometries.geom2.toPoints(extShape);
    let shapeSlice = slice.fromPoints(shapePoints);

    const inputShapeDelta = maths.vec3.clone([
      inputShape[l][0] - inputShape[0][0],
      inputShape[l][1] - inputShape[0][1],
      inputShape[l][2] - inputShape[0][2],
    ]);

    if (xyPlane) {
      shapeSlice = slice.transform(
        this.rotationMatrixFromVectors(
          maths.vec3.clone([0, 0, 1]),
          maths.vec3.clone([0, 1, 0]),
        ),
        shapeSlice,
      );
      shapeSlice = slice.transform(
        this.rotationMatrixFromVectors(
          maths.vec3.clone([0, 1, 0]),
          inputShapeDelta,
        ),
        shapeSlice,
      );
    } else {
      shapeSlice = slice.transform(
        this.rotationMatrixFromVectors(
          maths.vec3.clone([0, 0, 1]),
          inputShapeDelta,
        ),
        shapeSlice,
      );
    }

    // ...and extrude.
    return extrusions.extrudeFromSlices(
      {
        numberOfSlices: inputShape.length,
        capStart: false,
        capEnd: false,
        callback: (progress, count, base) => {
          const posTan: Vec3 = this.reduceVec3Precision(inputShape[count], 6);

          const positionArray: Vec3 = posTan;
          const tangentArray: Vec3 = posTan;

          const rotationMatrix = this.reduceMat4Precision(
            this.rotationMatrixFromVectors(
              inputShapeDelta,
              maths.vec3.clone(tangentArray),
            ),
            6,
          );
          const translationMatrix = this.reduceMat4Precision(
            maths.mat4.fromTranslation(
              maths.mat4.create(),
              this.arrayOrNumToVec3(positionArray),
            ),
            6,
          );

          const myTransformedSlice = slice.transform(
            maths.mat4.multiply(
              translationMatrix,
              translationMatrix,
              rotationMatrix,
            ),
            base,
          );
          return myTransformedSlice;
        },
      },
      shapeSlice,
    );
  }

  public static arrayOrNumToVec3(numOrArr: number[] | number): Vec3 {
    let tangentArray: Vec3;
    if (typeof numOrArr === 'number') {
      tangentArray = [numOrArr, 0, 0];
    } else {
      const len = numOrArr.length;
      if (len >= 3) {
        tangentArray = [numOrArr[0], numOrArr[1], numOrArr[2]];
      } else if (len === 2) {
        tangentArray = [numOrArr[0], numOrArr[1], 0];
      } else {
        tangentArray = [numOrArr[0], 0, 0];
      }
    }
    return tangentArray;
  }

  public static reduceFloatPrecision(value: number, precision: number): number {
    const factor = Math.pow(10, precision); // 10^precision
    return Math.round(value * factor) / factor;
  }

  // Apply precision reduction to a vector (Vec3)
  public static reduceVec3Precision(vec: Vec3, precision: number): Vec3 {
    return [
      this.reduceFloatPrecision(vec[0], precision),
      this.reduceFloatPrecision(vec[1], precision),
      this.reduceFloatPrecision(vec[2], precision),
    ];
  }

  public static reduceMat4Precision(mat: Mat4, precision: number): Mat4 {
    const myArr: number[] = [];
    mat.forEach((val) => {
      myArr.push(this.reduceFloatPrecision(val, precision));
    });
    return myArr as Mat4;
  }

  public static rotationMatrixFromVectors = (
    srcVector: Vec3,
    targetVector: Vec3,
  ) => {
    // From https://gist.github.com/kevinmoran/b45980723e53edeb8a5a43c49f134724
    srcVector = maths.vec3.normalize(maths.vec3.create(), srcVector);
    targetVector = maths.vec3.normalize(maths.vec3.create(), targetVector);

    const axis = maths.vec3.cross(maths.vec3.create(), targetVector, srcVector);
    const cosA = maths.vec3.dot(targetVector, srcVector);
    const k = 1 / (1 + cosA);

    return maths.mat4.fromValues(
      axis[0] * axis[0] * k + cosA,
      axis[1] * axis[0] * k - axis[2],
      axis[2] * axis[0] * k + axis[1],
      0,
      axis[0] * axis[1] * k + axis[2],
      axis[1] * axis[1] * k + cosA,
      axis[2] * axis[1] * k - axis[0],
      0,
      axis[0] * axis[2] * k - axis[1],
      axis[1] * axis[2] * k + axis[0],
      axis[2] * axis[2] * k + cosA,
      0,
      0,
      0,
      0,
      1,
    );
  };

  public static box4x4(translation: Vec3, color: colors.RGB): Geom3 & Colored {
    const b = cuboid({ size: [4, 4, 4] });
    return colors.colorize(color, translate(translation, b));
  }

  public static add(v1: Vec3, v2: Vec3): Vec3 {
    return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
  }

  public static subtract(v1: Vec3, v2: Vec3): Vec3 {
    return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
  }

  public static multiplyScalar(vc: Vec3, scalar: number): Vec3 {
    return [vc[0] * scalar, vc[1] * scalar, vc[2] * scalar];
  }

  public static lerp(v1: Vec3, v2: Vec3, t: number): Vec3 {
    return this.add(this.multiplyScalar(v1, 1 - t), this.multiplyScalar(v2, t));
  }

  public static samePoints(v0: Vec3, v1: Vec3): boolean {
    const same = true;
    if (v0[0] !== v1[0]) {
      return false;
    }
    if (v0[1] !== v1[1]) {
      return false;
    }
    if (v0[2] !== v1[2]) {
      return false;
    }
    return same;
  }

  public static splitCorners(points: Vec3[]): SplitCorners {
    if (!this.samePoints(points[0], points[points.length - 1])) {
      points.push(maths.vec3.clone(points[0]));
    }
    const threshold = 10;
    const lowerThreshold = 0 + threshold;
    const upperThreshold = 360 - threshold;
    const separatedPoints: Vec3[][] = [];
    const endCapPoints: Vec3[] = [];
    const linearSections: Vec3[][] = [];
    let sepPointsArr: Vec3[] = [];
    let maxAngle = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (i === 0 || i === points.length - 1) {
        endCapPoints.push(p0);
      }

      if (i > 0 && i < points.length - 2) {
        const pPrev = points[i - 1];
        //const pNext = points[i + 2];
        const angle = this.angleBetween(pPrev, p0, p1);

        // Threshold angle for detecting sharp corners (e.g., 30 degrees)
        if (angle > lowerThreshold && angle < upperThreshold) {
          if (sepPointsArr.length > 1) {
            sepPointsArr.push(p0);
            if (maxAngle === 0) {
              linearSections.push(sepPointsArr);
            } else {
              separatedPoints.push(sepPointsArr);
              maxAngle = 0;
            }

            sepPointsArr = [];
            endCapPoints.push(p0, p1);
          }
        } else {
          if (angle > 0) {
            maxAngle = Math.max(angle, maxAngle);
          }

          sepPointsArr.push(points[i]);
        }
      } else {
        // Don't detect angle on first and last points
        sepPointsArr.push(points[i]);
      }
    }
    if (sepPointsArr.length > 1 && maxAngle > 0) {
      separatedPoints.push(sepPointsArr);
    } else {
      linearSections.push(sepPointsArr);
    }

    return {
      endCaps: endCapPoints,
      nonLinear: separatedPoints,
      linear: linearSections,
    };
  }

  /*
  //geom3 is a list of polygons, which is itself an object
  //made of a list of vertices and a plane. A plane is an array of numbers
  //with the first three being the x, y, z of a normal vector and the fourth being
  //dist from origin
  //plan is to extrude triprisms along each segment and on the outside
  //add the necessary cone section(s)
  public static customExtrude(points: Vec3[], triangleHeight: number) {
    let prevLeft: Vec3;
    let prevRight: Vec3;
    for (let i = 0; i < points.length; i++) {
      if (i >= points.length - 1) {
        //add endcap
      } else if (i === 0) {
        const p0 = points[i];
        const p1 = points[i + 1];
        //orient first triangle,
      } else {
        const p0 = points[i];
        const p1 = points[i + 1];
      }
    }
  } */

  public static transformShapeAlongPath(
    shape: Vec2[],
    frames: IJscadFrenetFrames,
  ): Vec3[][] {
    const transformedShapes = [];
    for (let i = 0; i < frames.tangents.length; i++) {
      const position = frames.points[i]; // Current point on the path

      // Transform each point of the shape using the Frenet frame
      //
      const transformedShape = shape.map((point) => {
        const frame = {
          normal: frames.normals[i],
          binormal: frames.binormals[i],
          tangent: frames.tangents[i],
          point: frames.points[i],
        };
        const x = point[0];

        const z = point[1];

        const transformedPoint: Vec3 = [
          x * frame.binormal[0] + z * frame.normal[0] + position[0], // X transformed using binormal & normal
          x * frame.binormal[1] + z * frame.normal[1] + position[1], // Y transformed using binormal & normal
          x * frame.binormal[2] + z * frame.normal[2] + position[2], // Z transformed using binormal & normal
        ];

        return transformedPoint;
      });

      transformedShapes.push(transformedShape);
    }

    return transformedShapes;
  }

  public static createPolygonFromShape(shape: Vec3[]) {
    // `shape` is an array of Vec3 points (e.g., [[x, y, z], [x, y, z], ...])
    return poly3.fromPoints(shape);
  }

  public static createPrism(shape1: Vec3[], shape2: Vec3[]): Geom3 {
    const shPoly1 = poly3.fromPoints(shape1);
    const shPoly2 = poly3.fromPoints(shape2.reverse()); //normals pointing opposite
    const sides = this.createSidePolygons(shape1, shape2);
    sides.push(shPoly1, shPoly2);
    return geom3.create(sides);
  }

  public static createPrisms(shapes: Vec3[][]): Geom3[] {
    const geos: Geom3[] = [];
    for (let i = 0; i < shapes.length - 1; i++) {
      const geo = this.createPrism(shapes[i], shapes[i + 1]);
      geos.push(geo);
    }
    return geos;
  }

  public static createSidePolygons(shape1: Vec3[], shape2: Vec3[]): Poly3[] {
    const sidePolygons: Poly3[] = [];

    for (let i = 0; i < shape1.length; i++) {
      const nextIndex = (i + 1) % shape1.length;

      // Create a quad between corresponding points of shape1 and shape2
      const polygon1 = poly3.fromPoints([
        shape1[i],
        shape1[nextIndex],
        shape2[nextIndex],
      ]);
      const polygon2 = poly3.fromPoints([
        shape1[i],
        shape2[nextIndex],
        shape2[i],
      ]);

      sidePolygons.push(polygon1, polygon2);
    }

    return sidePolygons;
  }

  public static convertToGeom3(shapes: Vec3[][]): Geom3 {
    const polygons = [];

    // Create top and bottom caps
    const topPolygon = this.createPolygonFromShape(shapes[0]);
    const bottomPolygon = this.createPolygonFromShape(
      shapes[shapes.length - 1],
    );

    polygons.push(topPolygon, bottomPolygon);

    // Create side polygons connecting the shapes
    for (let i = 0; i < shapes.length - 1; i++) {
      const shape1 = shapes[i];
      const shape2 = shapes[i + 1];

      const sidePolygons = this.createSidePolygons(shape1, shape2);
      polygons.push(...sidePolygons);
    }

    // Create a geom3 from the list of polygons
    return geom3.create(polygons);
  }

  public static connectShapes(shape1: Vec3[], shape2: Vec3[]): Vec3[][] {
    const geometry = [];

    for (let i = 0; i < shape1.length; i++) {
      const nextIndex = (i + 1) % shape1.length;

      // Create triangles or quads between corresponding points on shape1 and shape2
      geometry.push([
        shape1[i],
        shape1[nextIndex],
        shape2[i],
        shape2[i],
        shape1[nextIndex],
        shape2[nextIndex],
      ]);
    }

    return geometry;
  }

  public static connectPrisms(prisms: Geom3[]): Geom3[] {
    const geos: Geom3[] = [];
    for (let i = 0; i < prisms.length; i++) {
      const nextIndex = (i + 1) % prisms.length; //p.length - 1?
      const geo = hull(prisms[i], prisms[nextIndex]);
      geos.push(geo);
    }
    return geos;
  }

  public static async connectPrismManifolds(
    prisms: Manifold[],
    maniServ: ManifoldWasmService,
  ): Promise<Manifold[]> {
    await maniServ.init();
    const geos: Manifold[] = [];
    for (let i = 0; i < prisms.length; i++) {
      const nextIndex = (i + 1) % prisms.length; //p.length - 1?
      const geo = maniServ.wasm.Manifold.hull([prisms[i], prisms[nextIndex]]);
      geos.push(geo);
    }
    return geos;
  }

  public static extrudeShapeAlongPath(
    shape: Vec2[],
    pathPoints: Vec3[],
  ): mVec3[][] {
    // Step 1: Compute Frenet frames
    const frames = this.calculateFrenetFrames(pathPoints);

    // Step 2: Transform the shape along the path
    const transformedShapes = this.transformShapeAlongPath(shape, frames);
    const prisms = this.createPrisms(transformedShapes);
    const prismsPoints: mVec3[][] = [];
    prisms.forEach((prism) => {
      const polygons = prism.polygons;
      const points: mVec3[] = [];
      polygons.forEach((polygon) => {
        polygon.vertices.forEach((vertex) => {
          const retPt: mVec3 = [vertex[0], vertex[1], vertex[2]];
          points.push(retPt);
        });
      });
      const uniquePts = this.removeDuplicateVertices(points);

      prismsPoints.push(uniquePts);
    });

    return prismsPoints;
  }

  public static removeDuplicateVertices(vertices: mVec3[]): mVec3[] {
    const vertexMap = new Map<string, Vec3>();
    const duplicates: mVec3[] = [];
    const originals: mVec3[] = [];

    vertices.forEach((vertex) => {
      const key = `${vertex[0]}_${vertex[1]}_${vertex[2]}`; // Unique key for each vertex

      if (vertexMap.has(key)) {
        duplicates.push(vertex); // If vertex already exists, add to duplicates list
      } else {
        vertexMap.set(key, vertex); // Add unique vertex to the map
        originals.push(vertex);
      }
    });

    return originals;
  }

  public static unionChain(hulls: Geom3[]): Geom3 {
    let geo: Geom3 = hulls[0];
    for (let i = 1; i < hulls.length; i++) {
      geo = union(geo, hulls[i]);
    }
    return geo;
  }

  public static async unionChainMani(
    hulls: Manifold[],
    maniServ: ManifoldWasmService,
  ): Promise<Manifold> {
    await maniServ.init();
    let geo: Manifold = hulls[0];
    for (let i = 1; i < hulls.length; i++) {
      geo = maniServ.csgUnion(geo, hulls[i]);
    }
    return geo;
  }

  public static randomTranslate(hulls: Geom3[]): Geom3[] {
    const geos: Geom3[] = [];
    for (const hull of hulls) {
      const randx = Math.random() * 200 - 100;
      const randy = Math.random() * 200 - 100;
      const randz = Math.random() * 200 - 100;
      const newHull = translate([randx, randy, randz], hull);
      geos.push(newHull);
    }
    return geos;
  }

  public static calculateTangents(points: Vec3[]) {
    const tangents = [];
    for (let i = 0; i < points.length - 1; i++) {
      const P1 = points[i];
      const P2 = points[i + 1];
      const tangent = this.normalize(this.subtract(P2, P1));
      tangents.push(tangent);
    }
    return tangents;
  }

  public static normalize(v: Vec3): Vec3 {
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  public static calculateNormals(tangents: Vec3[], xyPlane: boolean = true) {
    const normals = [];
    const arbitraryVector = [0, 0, 1] as Vec3; // Any vector not parallel to the tangent
    for (let i = 0; i < tangents.length; i++) {
      let normal: Vec3;
      if (xyPlane) {
        normal = [0, 0, 1] as Vec3;
      } else {
        const tangent = tangents[i];
        normal = this.crossProduct(tangent, arbitraryVector);
        normal = this.normalize(normal);
      }

      normals.push(normal);
    }
    return normals;
  }

  public static crossProduct(v1: Vec3, v2: Vec3): Vec3 {
    return [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0],
    ] as Vec3;
  }

  public static calculateBinormals(tangents: Vec3[], normals: Vec3[]) {
    const binormals = [];
    for (let i = 0; i < tangents.length; i++) {
      const tangent = tangents[i];
      const normal = normals[i];
      const binormal = this.crossProduct(tangent, normal);
      binormals.push(binormal);
    }
    return binormals;
  }

  public static calculateFrenetFrames(points: Vec3[]): IJscadFrenetFrames {
    const tangents = this.calculateTangents(points);
    const normals = this.calculateNormals(tangents);
    const binormals = this.calculateBinormals(tangents, normals);

    const frames = {
      tangents: tangents,
      normals: normals,
      binormals: binormals,
      points: points,
    };
    return frames;
  }

  public static getBezierControlPoints(points: Vec3[]): Vec3[] {
    if (points.length < 2) {
      throw new Error(
        'At least two points are needed to generate control points.',
      );
    }

    const controlPoints: Vec3[] = [];

    // Iterate through the points and calculate control points
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];

      // Calculate control points based on the midpoint between the points
      const midpoint = this.lerp(p0, p1, 0.5);

      // Adjust the control points slightly (you can change the factor to modify the smoothness)
      const controlPoint1 = this.lerp(p0, midpoint, 0.5); // First control point
      const controlPoint2 = this.lerp(p1, midpoint, 0.5); // Second control point

      // Add the control points to the array
      controlPoints.push(controlPoint1, controlPoint2);
    }

    return controlPoints;
  }

  public static getBezierControlPointsSharpCorners(points: Vec3[]): Vec3[] {
    if (points.length < 3) {
      throw new Error(
        'At least three points are needed to handle sharp corners.',
      );
    }

    const controlPoints: Vec3[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];

      let controlPoint1, controlPoint2;

      if (i > 0 && i < points.length - 2) {
        const pPrev = points[i - 1];
        //const pNext = points[i + 2];
        const angle = this.angleBetween(pPrev, p0, p1);

        // Threshold angle for detecting sharp corners (e.g., 30 degrees)
        if (angle < 30) {
          // Sharp corner detected, so move control points closer to the corner
          controlPoint1 = this.lerp(p0, p1, 0.8); // Move control point closer to p0
          controlPoint2 = this.lerp(p1, p0, 0.8); // Move control point closer to p1
        } else {
          // Normal case for smooth transitions
          // Calculate control points based on the midpoint between the points
          const midpoint = this.lerp(p0, p1, 0.5);

          // Adjust the control points slightly (you can change the factor to modify the smoothness)
          controlPoint1 = this.lerp(p0, midpoint, 0.5); // First control point
          controlPoint2 = this.lerp(p1, midpoint, 0.5); // Second control point
        }
      } else {
        // Normal control points for start and end points
        const midpoint = this.lerp(p0, p1, 0.5);
        controlPoint1 = this.lerp(p0, midpoint, 0.5);
        controlPoint2 = this.lerp(p1, midpoint, 0.5);
      }

      controlPoints.push(controlPoint1, controlPoint2);
    }

    return controlPoints;
  }

  public static angleBetweenVectors(v0: Vec3, v1: Vec3): number {
    const dotProduct = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
    const magV0 = Math.sqrt(v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2]);
    const magV1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);

    let cosTheta = dotProduct / (magV0 * magV1);
    if (cosTheta > 1) {
      cosTheta = 1;
    }
    if (cosTheta < -1) {
      cosTheta = -1;
    }

    return Math.acos(cosTheta) | 0; // Return angle in degrees
  }

  public static angleBetween(p0: Vec3, p1: Vec3, p2: Vec3): number {
    const v0 = this.subtract(p1, p0);
    const v1 = this.subtract(p2, p1);

    const dotProduct = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
    const magV0 = Math.sqrt(v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2]);
    const magV1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);

    let cosTheta = dotProduct / (magV0 * magV1);
    if (cosTheta > 1) {
      cosTheta = 1;
    }
    if (cosTheta < -1) {
      cosTheta = -1;
    }

    return Math.acos(cosTheta) * (180 / Math.PI); // Return angle in degrees
  }
}
