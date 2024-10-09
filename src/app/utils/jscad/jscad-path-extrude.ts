import { maths } from '@jscad/modeling';
import { translate } from '@jscad/modeling/src/operations/transforms';
import { Mat4, Vec2, Vec3 } from '@jscad/modeling/src/maths/types';
import { Vec3 as mVec3 } from 'manifold-3d';
import { Geom3, Poly3 } from '@jscad/modeling/src/geometries/types';
//import { degToRad } from '@jscad/modeling/src/utils';
import { create, fromRotation } from '@jscad/modeling/src/maths/mat4';
import { IJscadFrenetFrames } from '../../interfaces/jscad-frenet-frames';
//import geom2 from '@jscad/modeling/src/geometries/geom2';
import poly3 from '@jscad/modeling/src/geometries/poly3';
import geom3 from '@jscad/modeling/src/geometries/geom3';
import { union } from '@jscad/modeling/src/operations/booleans';
import { ManifoldWasmService } from '../../services/manifold-wasm.service';
import { JscadExtractedData } from '../../interfaces/jscad-extracted-data';
import { JscadFlattenedData } from '../../interfaces/jscad-flattened-data';
import { Manifold } from 'manifold-3d';
import { CharShapeData } from '../../interfaces/char-shape-data';
import { CharShapeGeometry } from '../../interfaces/char-shape-geometry';

export class pathExtruder {
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

    otherShapes?.forEach((sh) => {
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
