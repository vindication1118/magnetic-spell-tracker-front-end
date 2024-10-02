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
import { cuboid, circle, polygon } from '@jscad/modeling/src/primitives';
import { rotate, translate } from '@jscad/modeling/src/operations/transforms';
import {
  extrudeLinear,
  extrudeRotate,
  slice,
} from '@jscad/modeling/src/operations/extrusions';
import { bezier } from '@jscad/modeling/src/curves';
import { Mat4, Vec2, Vec3 } from '@jscad/modeling/src/maths/types';
import { Colored, Geom2, Geom3 } from '@jscad/modeling/src/geometries/types';
import { degToRad } from '@jscad/modeling/src/utils';
import { create, fromRotation } from '@jscad/modeling/src/maths/mat4';
import { SplitCorners } from '../interfaces/split-corners';
import { angle } from '@jscad/modeling/src/maths/vec3';

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

  public static testExtrude(
    triangleHeight: number,
    otherShapes?: Vec3[][],
  ): Geom3[] {
    const testLine: Vec3[] = [
      [11.408, 9.773425, 0],
      [11.408, 9.723075000000001, 0],
      [11.408, 9.672725, 0],
      [11.408, 9.622375000000002, 0],
      [11.408, 9.57205, 0],
      [11.408, 9.52175, 0],
      [11.408, 9.471425, 0],
      [11.408, 9.421074999999998, 0],
      [11.408, 9.370725, 0],
      [11.408, 9.320374999999999, 0],
      [11.408, 9.270025, 0],
      [11.408, 9.219674999999999, 0],
      [11.408, 9.169325, 0],
      [11.408, 9.118974999999999, 0],
      [11.408, 9.068625, 0],
      [11.408, 9.018275, 0],
      [11.408, 8.967925000000001, 0],
      [11.408, 8.917575, 0],
      [11.408, 8.867225000000001, 0],
      [11.408, 8.816875, 0],
      [11.408, 8.766525000000001, 0],
      [11.408, 8.716175, 0],
      [11.408, 8.665825000000002, 0],
      [11.408, 8.615475, 0],
      [11.408, 8.56515, 0],
      [11.408, 8.51485, 0],
      [11.408, 8.464524999999998, 0],
      [11.408, 8.414175, 0],
      [11.408, 8.363824999999999, 0],
      [11.408, 8.313475, 0],
      [11.408, 8.263124999999999, 0],
      [11.408, 8.212775, 0],
      [11.408, 8.162424999999999, 0],
      [11.408, 8.112075, 0],
      [11.408, 8.061725, 0],
      [11.408, 8.011375000000001, 0],
      [11.408, 7.961025, 0],
      [11.408, 7.910675, 0],
      [11.408, 7.8603250000000005, 0],
      [11.408, 7.809975, 0],
      [11.408, 7.759625, 0],
      [11.408, 7.709275, 0],
      [11.408, 7.658925, 0],
      [11.408, 7.608575, 0],
      [11.408, 7.55825, 0],
      [11.408, 7.50795, 0],
      [11.408, 7.457625, 0],
      [11.408, 7.407275, 0],
      [11.408, 7.356925, 0],
      [11.408, 7.306575, 0],
      [11.408, 7.256225, 0],
      [11.408, 7.205875, 0],
      [11.408, 7.155525, 0],
      [11.408, 7.105175, 0],
      [11.408, 7.054825, 0],
      [11.408, 7.004475, 0],
      [11.408, 6.954125, 0],
      [11.408, 6.9037749999999996, 0],
      [11.408, 6.853425, 0],
      [11.408, 6.803075, 0],
      [11.408, 6.752725, 0],
      [11.408, 6.702375, 0],
      [11.408, 6.65205, 0],
      [11.408, 6.60175, 0],
      [11.408, 6.551425, 0],
      [11.408, 6.501075, 0],
      [11.408, 6.450725, 0],
      [11.408, 6.400375, 0],
      [11.408, 6.3500250000000005, 0],
      [11.408, 6.299675, 0],
      [11.408, 6.249325, 0],
      [11.408, 6.198975, 0],
      [11.408, 6.148625, 0],
      [11.408, 6.098275, 0],
      [11.408, 6.047925, 0],
      [11.408, 5.997575, 0],
      [11.408, 5.947225, 0],
      [11.408, 5.896875, 0],
      [11.408, 5.846525, 0],
      [11.408, 5.796175, 0],
      [11.408, 5.745825, 0],
      [11.408, 5.695475, 0],
      [11.408, 5.64515, 0],
      [11.408, 5.59485, 0],
      [11.408, 5.544525, 0],
      [11.408, 5.494175, 0],
      [11.408, 5.443825, 0],
      [11.408, 5.393475, 0],
      [11.408, 5.343125, 0],
      [11.408, 5.292775, 0],
      [11.408, 5.242425, 0],
      [11.408, 5.192075, 0],
      [11.408, 5.141725, 0],
      [11.408, 5.091375, 0],
      [11.408, 5.041025, 0],
      [11.408, 4.9906749999999995, 0],
      [11.408, 4.940325, 0],
      [11.408, 4.889975, 0],
      [11.408, 4.839625, 0],
      [11.408, 4.789275, 0],
      [11.408, 4.738925, 0],
      [11.408, 4.688575, 0],
      [11.408, 4.63825, 0],
      [11.408, 4.58795, 0],
      [11.408, 4.537625, 0],
      [11.408, 4.487275, 0],
      [11.408, 4.4369250000000005, 0],
      [11.408, 4.386575, 0],
      [11.408, 4.336225, 0],
      [11.408, 4.285875, 0],
    ];
    const exts: Geom3[] = [];

    const triPoints: Vec2[] = [
      [0, 0],
      [-triangleHeight, -triangleHeight],
      [triangleHeight, -triangleHeight],
    ];
    otherShapes?.push(testLine);
    const triPoly = polygon({ points: triPoints });
    console.log(otherShapes);
    otherShapes?.forEach((sh) => {
      if (!this.samePoints(sh[0], sh[sh.length - 1])) {
        sh?.push(sh[0]);
      }
      const splitCorners = this.splitCorners(sh);
      console.log(splitCorners);
      splitCorners.nonLinear.forEach((section, index) => {
        console.log(index);
        const ctlPts = this.getBezierControlPoints(section);
        const charExt = this.extrudeAlongPath(section, ctlPts, triPoly, true);
        exts.push(charExt);
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
        exts.push(cone);
      });
      splitCorners.linear.forEach((section) => {
        const charExt = this.doExtrudeLinear(section, triPoly);
        exts.push(charExt);
      });
    });

    return exts;
  }

  public static removeDuplicateVectors(points: Vec3[]): Set<Vec3> {
    const pointSet = new Set(points);
    return pointSet;
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
    console.log('bezier Curve:');
    console.log(shapeCurve);

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

          console.log(positionArray);
          const tangentArray = this.reduceVec3Precision(
            this.arrayOrNumToVec3(bezier.tangentAt(progress, shapeCurve)),
            6,
          );

          console.log(tangentArray);
          const rotationMatrix = this.reduceMat4Precision(
            this.rotationMatrixFromVectors(
              bezierDelta,
              maths.vec3.clone(tangentArray),
            ),
            6,
          );

          console.log(rotationMatrix);
          const translationMatrix = this.reduceMat4Precision(
            maths.mat4.fromTranslation(
              maths.mat4.create(),
              this.arrayOrNumToVec3(positionArray),
            ),
            6,
          );

          console.log(translationMatrix);
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
    console.log('Direction');
    console.log(direction);
    console.log('Angle Diff');
    console.log(angleDiff);
    console.log('Starting Point');
    console.log(v0);

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
          console.log('Line extrude count: ');
          console.log(count);
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
              console.log('pushing to linearSection');
              linearSections.push(sepPointsArr);
            } else {
              console.log('pushing to bezier section');
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
    console.log(separatedPoints);
    return {
      endCaps: endCapPoints,
      nonLinear: separatedPoints,
      linear: linearSections,
    };
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
