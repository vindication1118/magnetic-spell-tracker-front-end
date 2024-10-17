/// <reference types="@webgpu/types" />

import { PathPosition } from '../interfaces/path-position';
import * as THREE from 'three';
import * as jscad from '@jscad/modeling/src/index';
import { Vec3 } from '@jscad/modeling/src/maths/vec3';
//import _ from 'lodash';

export class WebGpuOps {
  static runComputeShaderAndCreateGeometry() {
    //exterior: (THREE.Vec2 | PathPosition)[], //interior: (THREE.Vec2 | PathPosition)[],
    throw new Error('Method not implemented.');
  }
  static initialize() {
    throw new Error('Method not implemented.');
  }
  constructor() {}

  private device: GPUDevice | null = null;

  public async initialize(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get GPU adapter.');
    }

    this.device = await adapter.requestDevice();
  }

  public async selectOptimalWorkgroupSize(): Promise<number> {
    if (!this.device) {
      throw new Error('GPU device not initialized.');
    }

    // Query the device's limits
    const maxWorkgroupSize = this.device.limits.maxComputeWorkgroupSizeX;
    const maxComputeUnits = this.device.limits.maxComputeWorkgroupsPerDimension;

    // Commonly, a warp size is 32 (as in NVIDIA GPUs), but this may vary across architectures
    const warpSize = 32;

    // Start with the warp size, and adjust up to the maxWorkgroupSize
    let optimalWorkgroupSize = warpSize;

    // Adjust the workgroup size to be a multiple of the warp size and not exceed maxWorkgroupSize
    while (optimalWorkgroupSize * 2 <= maxWorkgroupSize) {
      optimalWorkgroupSize *= 2;
    }

    // Adjust for maximum compute units if necessary
    if (optimalWorkgroupSize > maxComputeUnits) {
      optimalWorkgroupSize = maxComputeUnits;
    }

    console.log('Selected Optimal Workgroup Size:', optimalWorkgroupSize);
    return optimalWorkgroupSize;
  }

  convertToShaderFormat(
    points: (PathPosition | THREE.Vector2)[],
    includeVertexIndex: boolean,
  ): Float32Array {
    const flatArray: number[] = [];

    points.forEach((point) => {
      if (includeVertexIndex) {
        flatArray.push(point.x, 1, point.y, 0); // swap y to z and set y to 1
      } else {
        flatArray.push(point.x, 1, point.y); // swap y to z and set y to 1
      }
    });

    return new Float32Array(flatArray);
  }

  createSegmentBuffer(points: (PathPosition | THREE.Vector2)[]): Float32Array {
    const numSegments = points.length;
    const numFloatsPerSegment = 8; //has to be a vec4 for alignment reasons, 4th is just gonna be dummy
    const totalLen = numSegments * numFloatsPerSegment;
    return new Float32Array(totalLen);
  }

  createBufferFromPoints(
    points: (PathPosition | THREE.Vector2)[],
    includeVertexIndex: boolean,
    mode: number,
    mapAtCreation: boolean,
  ): GPUBuffer {
    if (!this.device) {
      throw new Error('GPU device not initialized.');
    }

    const flatArray = this.convertToShaderFormat(points, includeVertexIndex);
    const buffer = this.device.createBuffer({
      size: flatArray.byteLength,
      usage: mode,
      mappedAtCreation: mapAtCreation,
    });

    // If mappedAtCreation is true, you can immediately access the buffer to write data
    if (mapAtCreation) {
      const arrayBuffer = buffer.getMappedRange(); // Get the mapped memory
      const typedArray = new Float32Array(arrayBuffer);
      typedArray.set(flatArray); // Write some data into the buffer

      // Unmap the buffer so it can be used by the GPU
      buffer.unmap();
    }

    return buffer;
  }

  // Method to convert output buffer to array of 3D vectors (Vec3f equivalent)
  static convertBufferToVec3Array(
    outputBuffer: Float32Array,
  ): [number, number, number][] {
    const vectors: [number, number, number][] = [];

    for (let i = 0; i < outputBuffer.length; i += 3) {
      const vector: [number, number, number] = [
        outputBuffer[i], // x
        outputBuffer[i + 1], // y
        outputBuffer[i + 2], // z
      ];
      vectors.push(vector);
    }

    return vectors;
  }

  static convertToVec3Array(
    points: (THREE.Vector2 | PathPosition)[],
  ): [number, number, number][] {
    const vec3Array: [number, number, number][] = [];

    points.forEach((point) => {
      const vec3: [number, number, number] = [
        point.x, // x value
        1, // constant y value of 1
        point.y, // z value from y
      ];
      vec3Array.push(vec3);
    });

    return vec3Array;
  }

  static convertPathPosArrayToTHREEVec3(
    points: (THREE.Vector2 | PathPosition)[],
  ) {
    const vec3Arr: THREE.Vector3[] = [];
    points.forEach((point) => {
      vec3Arr.push(new THREE.Vector3(point.x, 0, point.y));
    });

    return vec3Arr;
  }

  public getBinaryFloatToInt(wrongFloat: number): number {
    // Create an ArrayBuffer with enough bytes to store a float32 (4 bytes)
    const buffer = new ArrayBuffer(4);

    // Create a DataView to manipulate the ArrayBuffer
    const view = new DataView(buffer);

    // Write the float value into the buffer as a float32
    view.setFloat32(0, wrongFloat, this.checkEndianness()); // true for little-endian, false for big-endian

    // Read the buffer as a 32-bit integer
    const intRepresentation = view.getInt32(0, this.checkEndianness()); // true for little-endian, false for big-endian

    return intRepresentation;
  }

  public checkEndianness(): boolean {
    // Create an ArrayBuffer with 4 bytes (32 bits)
    const buffer = new ArrayBuffer(4);

    // Create a DataView to manipulate the ArrayBuffer
    const view = new DataView(buffer);

    // Set an int32 value of 1
    view.setUint32(0, 0x01020304);

    // Check the first byte to determine endianness
    if (view.getUint8(0) === 0x01) {
      return false;
    } else {
      return true;
    }
  }

  public createMeshFromShaderOutput(
    pointsA: [number, number, number][],
    pointsB: [number, number, number][],
    updatedPointsA: number[],
  ): geom3.Geom3 {
    console.log(pointsA);
    console.log(pointsB);
    console.log(updatedPointsA);
    const polygons = [];
    const numberArray = Array.from(updatedPointsA);
    console.log(numberArray[4]);
    for (let i = 0; i < pointsA.length; i++) {
      const A_prime: Vec3 = [
        updatedPointsA[i * 4],
        updatedPointsA[i * 4 + 1],
        updatedPointsA[i * 4 + 2],
      ];
      const nearestIndex = this.getBinaryFloatToInt(updatedPointsA[i * 4 + 3]);
      const B = pointsB[nearestIndex];

      // Find adjacent vertices B_adj and A'_adj
      const B_adj = pointsB[(nearestIndex + 1) % pointsB.length];
      const A_adj: Vec3 | null =
        i < pointsA.length - 1
          ? [
              updatedPointsA[(i + 1) * 4],
              updatedPointsA[(i + 1) * 4 + 1],
              updatedPointsA[(i + 1) * 4 + 2],
            ]
          : null;
      // Create two triangles or a quadrilateral
      if (A_adj !== null) {
        // Quadrilateral
        console.log(A_prime);
        console.log(B);
        console.log(B_adj);
        console.log(A_adj);
        polygons.push(
          jscad.geometries.poly3.fromPoints([A_prime, B, B_adj, A_adj]),
        );
      } else {
        // Two triangles
        polygons.push(jscad.geometries.poly3.fromPoints([A_prime, B, B_adj]));
      }
    }

    return jscad.geometries.geom3.create(polygons);
  }

  public createMeshFromShaderSegments(segments: number[]): geom3.Geom3 {
    const polygons = [];
    const numSegments = segments.length / 8; //one higher than actual max
    for (let i = 0; i < numSegments; i++) {
      const B: Vec3 = [
        segments[i * 8],
        segments[i * 8 + 1],
        segments[i * 8 + 2],
      ];
      const A: Vec3 = [
        segments[i * 8 + 4],
        segments[i * 8 + 5],
        segments[i * 8 + 6],
      ];
      const ni = (i + 1) % numSegments;
      const B_adj: Vec3 = [
        segments[ni * 8],
        segments[ni * 8 + 1],
        segments[ni * 8 + 2],
      ];
      const A_adj: Vec3 = [
        segments[ni * 8 + 4],
        segments[ni * 8 + 5],
        segments[ni * 8 + 6],
      ];
      polygons.push(jscad.geometries.poly3.fromPoints([B, A, A_adj, B_adj]));
      polygons.push(jscad.geometries.poly3.fromPoints([B, B_adj, A_adj, A]));
    }

    return jscad.geometries.geom3.create(polygons);
  }

  async runComputeShaderAndCreateGeometry(
    pointsA: (PathPosition | THREE.Vector2)[],
    pointsB: (PathPosition | THREE.Vector2)[],
  ): Promise<geom3.Geom3> {
    if (!this.device) {
      throw new Error('GPU device not initialized.');
    }

    const workgroupSize = await this.selectOptimalWorkgroupSize();
    const maxNearestVertices = 8; // change later to output of shaderCode0

    //counts how many nearest vertices in B to point in A and sets y Values based on distance
    //call on full set of shape and hole vertices
    const shaderCode0 = `
      struct Vertex {
        position : vec3<f32>,
        nearestVertexCount : u32,
      };

      @group(0) @binding(0) var<storage, read> pointsA : array<Vertex>;
      @group(0) @binding(1) var<storage, read> pointsB : array<Vertex>;
      @group(0) @binding(2) var<storage, read_write> updatedPointsA : array<Vertex>;

      @compute @workgroup_size(${workgroupSize})
      fn main(@builtin(global_invocation_id) id : vec3<u32>) {
        let index = id.x;
        let pointA = pointsA[index].position;

        var nearestCount : u32 = 0;
        var minDistance : f32 = 1e10;

        for (var i = 0u; i < arrayLength(&pointsB); i = i + 1u) {
            let pointB = pointsB[i].position;

            // Calculate the distance in the xz plane
            let distance = distance(vec2<f32>(pointA.x, pointA.z), vec2<f32>(pointB.x, pointB.z));

            if (distance < minDistance) { //may need to define as abs(dist - minDist) < someValue treat as equal, else do math, flipping the order of the if and else if

                minDistance = distance;
                nearestCount = 1;
            } else if (distance == minDistance) {
                 nearestCount++;
            }
        }
        // Assign the new y value based on the distance to the nearest point in B
        let newY = 1.0 - minDistance;
        // Update the vertex with the new y value and the nearest vertex index
        updatedPointsA[index] = Vertex(vec3<f32>(pointA.x, newY, pointA.z), nearestCount);
      }`;

    // actually gets the nearest vertex indices for realsies - will need to map to shape or hole
    const shaderCode1 = `
      // Define the maximum number of nearest vertices to consider
      const MAX_NEAREST_VERTICES: u32 = ${maxNearestVertices}; // Adjust as necessary

      struct Vertex {
          position: vec3<f32>,
          nearestVerticesIndices: array<i32, MAX_NEAREST_VERTICES>, // Array initialized to -1
      };

      @group(0) @binding(0) var<storage, read> inputVertices: array<vec3<f32>>; // Input vertices
      @group(0) @binding(1) var<storage, read> nearestCountBuffer: array<u32>; // Counts from the first round
      @group(0) @binding(2) var<storage, read_write> outputVertices: array<Vertex>; // Output buffer with initialized vertices

      @compute @workgroup_size(${workgroupSize})
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
          let index = global_id.x;
          if (index >= arrayLength(&inputVertices)) {
              return;
          }

          let vertex = inputVertices[index];
          let count = nearestCountBuffer[index];
          var outputVertex: Vertex;
          outputVertex.position = vertex;

          // Initialize the indices to -1
          for (var i: u32 = 0; i < MAX_NEAREST_VERTICES; i = i + 1) {
              outputVertex.nearestVerticesIndices[i] = -1;
          }

          var currentIndex: u32 = 0;

          // Iterate over all vertices to find the nearest vertices
          for (var i: u32 = 0; i < arrayLength(&inputVertices); i = i + 1) {
              if (i == index || currentIndex >= count) {
                  continue; // Skip self and stop if the count is met
              }

              // Example condition to determine "nearness"; modify based on your criteria
              let distance = length(inputVertices[i] - vertex);
              if (distance < someThreshold) { // Define "someThreshold" based on your requirements
                  outputVertex.nearestVerticesIndices[currentIndex] = i;
                  currentIndex = currentIndex + 1;
              }
          }

          // Store the output vertex with updated indices
          outputVertices[index] = outputVertex;
      }`;
    // Needs updating to take into account nearest vertex count. call separately for shapes and holes
    const shaderCode2 = `
      struct Vertex {
        position : vec3<f32>,
        nearestVertex : u32,
      };

      struct Segment {
          v0: vec4<f32>,
          v2: vec4<f32>,
      }

      @group(0) @binding(0) var<storage, read> pointsB : array<Vertex>;
      @group(0) @binding(1) var<storage, read_write> updatedPointsA : array<Vertex>;
      @group(0) @binding(2) var<storage, read_write> vertexPairs : array<Segment>;

      @compute @workgroup_size(${workgroupSize})
      fn main(@builtin(global_invocation_id) id : vec3<u32>) {
          let pBIndex = id.x;
          let pointB = pointsB[pBIndex].position;

          let nearestIndex = findNearestVertexInUpdatedA(pointB); // Find the nearest vertex in pointsA
          let maxIndex = arrayLength(&updatedPointsA) - 1u;
          // Get the nearest vertex and its adjacent vertices in pointsA
          let A_nearest = updatedPointsA[nearestIndex].position;
          var projectedPoint: vec4<f32>;
          if(nearestIndex == 0u){
              let A_next = updatedPointsA[nearestIndex + 1u].position;
              // Project pointB onto the line segment [A_nearest, A_next]
              projectedPoint = v3tov4(projectPointOntoLine(pointB, A_nearest, A_next));
              // Store the resulting pair
              vertexPairs[pBIndex] = Segment(v3tov4(pointB), projectedPoint);
          } else if (nearestIndex == maxIndex){
              let A_prev = updatedPointsA[nearestIndex - 1u].position;
              // Project pointB onto the line segment [A_nearest, A_next]
              projectedPoint = v3tov4(projectPointOntoLine(pointB, A_nearest, A_prev));
              // Store the resulting pair
              vertexPairs[pBIndex] = Segment(v3tov4(pointB), projectedPoint);
          }
          else {
              //Possible TODO: Add discontinuity checking
              let A_next = updatedPointsA[nearestIndex + 1u].position;
              let A_prev = updatedPointsA[nearestIndex - 1u].position;
              // Project pointB onto the line segment [A_nearest, A_next]
              let projectedPoint1 = projectPointOntoLine(pointB, A_nearest, A_next);
              let projectedPoint2 = projectPointOntoLine(pointB, A_nearest, A_prev);
              projectedPoint = v3tov4(getNearestPoint(pointB, projectedPoint1, projectedPoint2));
              // Store the resulting pair
              vertexPairs[pBIndex] =  Segment(v3tov4(pointB), projectedPoint);
          }
      }

      fn v3tov4(pointA: vec3<f32>) -> vec4<f32> {
          return vec4<f32>(pointA.x, pointA.y, pointA.z, 0.0);
      }

      fn getNearestPoint(startingPoint: vec3<f32>, projectedPoint1: vec3<f32>, projectedPoint2: vec3<f32>) -> vec3<f32> {
          let dist1 = distance(startingPoint, projectedPoint1);
          let dist2 = distance(startingPoint, projectedPoint2);
          if(dist1 <= dist2) {
              return projectedPoint1;
          } else {
              return projectedPoint2;
          }
      }

      // Function to project point P onto the line segment [A, B]
      fn projectPointOntoLine(P: vec3<f32>, A: vec3<f32>, B: vec3<f32>) -> vec3<f32> {
          // Vector AB = B - A
          let AB = B - A;

          // Vector AP = P - A
          let AP = P - A;

          // Dot product of AP and AB
          let dotProduct = dot(AP, AB);

          // Dot product of AB with itself
          let magnitudeAB2 = dot(AB, AB);

          // Projection scalar t
          let t = dotProduct / magnitudeAB2;

          // Clamp t to [0, 1] to ensure the projected point is within the segment
          let t_clamped = clamp(t, 0.0, 1.0);

          // Calculate the projection point P' = A + t * AB
          return A + t_clamped * AB;
      }

      fn findNearestVertexInUpdatedA(pB: vec3<f32>) -> u32 {
          var nearestIndex : u32 = 0u;
          var minDistance : f32 = 1e10;
          // Placeholder: Return the nearest vertex index for the given point P
          for (var i = 0u; i < arrayLength(&updatedPointsA); i = i + 1u) {
            let uPA = updatedPointsA[i].position;

            // Calculate the distance in the xz plane
            let distance = distance(vec3<f32>(uPA.x, uPA.y, uPA.z), vec3<f32>(pB.x, pB.y, pB.z));

            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = i;
            }
          }
          return nearestIndex;
      }
      `;
    const shaderModule0 = this.device.createShaderModule({ code: shaderCode0 });
    const pipeline0 = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule0,
        entryPoint: 'main',
      },
    });
    const shaderModule1 = this.device.createShaderModule({ code: shaderCode1 });

    const pipeline1 = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule1,
        entryPoint: 'main',
      },
    });
    const shaderModule2 = this.device.createShaderModule({ code: shaderCode2 });
    const pipeline2 = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule2,
        entryPoint: 'main',
      },
    });

    const usageA = GPUBufferUsage.STORAGE;
    const usageB = GPUBufferUsage.STORAGE;
    const usageC = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
    const usageD = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;

    const bufferA = this.createBufferFromPoints(pointsA, true, usageA, true);
    const bufferB = this.createBufferFromPoints(pointsB, true, usageB, true);
    const bufferC = this.createBufferFromPoints(pointsA, true, usageC, false);
    const bufferD = this.device.createBuffer({
      size: this.createSegmentBuffer(pointsB).byteLength,
      usage: usageD,
      mappedAtCreation: false,
    });
    const bindGroup0 = this.device.createBindGroup({
      layout: pipeline0.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufferA } },
        { binding: 1, resource: { buffer: bufferB } },
        { binding: 2, resource: { buffer: bufferC } },
      ],
    });
    const bindGroup1 = this.device.createBindGroup({
      layout: pipeline1.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufferA } },
        { binding: 1, resource: { buffer: bufferB } },
        { binding: 2, resource: { buffer: bufferC } },
      ],
    });

    const bindGroup2 = this.device.createBindGroup({
      layout: pipeline2.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufferB } },
        { binding: 1, resource: { buffer: bufferC } },
        { binding: 2, resource: { buffer: bufferD } },
      ],
    });

    const computeEncoder0 = this.device.createCommandEncoder();
    const passEncoder0 = computeEncoder0.beginComputePass();
    passEncoder0.setPipeline(pipeline0);
    passEncoder0.setBindGroup(0, bindGroup0);
    passEncoder0.dispatchWorkgroups(Math.ceil(pointsA.length / workgroupSize));
    passEncoder0.end();
    this.device.queue.submit([computeEncoder0.finish()]);

    const computeEncoder1 = this.device.createCommandEncoder();
    const passEncoder1 = computeEncoder1.beginComputePass();
    passEncoder1.setPipeline(pipeline1);
    passEncoder1.setBindGroup(0, bindGroup1);
    passEncoder1.dispatchWorkgroups(Math.ceil(pointsA.length / workgroupSize));
    passEncoder1.end();
    this.device.queue.submit([computeEncoder1.finish()]);

    const computeEncoder2 = this.device.createCommandEncoder();
    const passEncoder2 = computeEncoder2.beginComputePass();
    passEncoder2.setPipeline(pipeline2);
    passEncoder2.setBindGroup(0, bindGroup2);
    passEncoder2.dispatchWorkgroups(Math.ceil(pointsB.length / workgroupSize));
    passEncoder2.end();
    this.device.queue.submit([computeEncoder2.finish()]);

    const readBufferC = this.device.createBuffer({
      size: bufferC.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const copyEncoder = this.device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(bufferC, 0, readBufferC, 0, bufferC.size);
    this.device.queue.submit([copyEncoder.finish()]);

    await readBufferC.mapAsync(GPUMapMode.READ);
    const resultArray = new Float32Array(readBufferC.getMappedRange());
    //console.log(resultArray); // Check if it contains the expected values
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const resultCopy = Array.from(resultArray);
    readBufferC.unmap();

    const readBufferD = this.device.createBuffer({
      size: bufferD.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const copyEncoder2 = this.device.createCommandEncoder();
    copyEncoder2.copyBufferToBuffer(bufferD, 0, readBufferD, 0, bufferD.size);
    this.device.queue.submit([copyEncoder2.finish()]);

    await readBufferD.mapAsync(GPUMapMode.READ);
    const resultArray2 = new Float32Array(readBufferD.getMappedRange());
    //console.log(resultArray); // Check if it contains the expected values
    const resultCopy2 = Array.from(resultArray2);
    readBufferD.unmap();

    //console.log(resultCopy);
    //console.log(pointsB);
    //console.log(resultCopy2);
    return this.createMeshFromShaderSegments(resultCopy2);
  }
}
