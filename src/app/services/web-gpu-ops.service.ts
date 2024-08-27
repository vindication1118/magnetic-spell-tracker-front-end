/// <reference types="@webgpu/types" />

import { PathPosition } from '../interfaces/path-position';
import { Injectable } from '@angular/core';
import * as THREE from 'three';
import * as jscad from '@jscad/modeling';
import { Vec3 } from '@jscad/modeling/src/maths/vec3';
//import _ from 'lodash';

@Injectable({
  providedIn: 'root',
})
export class WebGpuOpsService {
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
  convertBufferToVec3Array(
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

  convertToVec3Array(
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

  async runComputeShaderAndCreateGeometry(
    pointsA: (PathPosition | THREE.Vec2)[],
    pointsB: (PathPosition | THREE.Vec2)[],
  ): Promise<geom3.Geom3> {
    if (!this.device) {
      throw new Error('GPU device not initialized.');
    }

    const workgroupSize = await this.selectOptimalWorkgroupSize();
    const shaderCode = `
  struct Vertex {
  position : vec3<f32>,
  nearestVertex : u32,
};

@group(0) @binding(0) var<storage, read> pointsA : array<Vertex>;
@group(0) @binding(1) var<storage, read> pointsB : array<Vertex>;
@group(0) @binding(2) var<storage, read_write> updatedPointsA : array<Vertex>;

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
  let index = id.x;
  let pointA = pointsA[index].position;

  var nearestIndex : u32 = 0;
  var minDistance : f32 = 1e10;

  for (var i = 0u; i < arrayLength(&pointsB); i = i + 1u) {
      let pointB = pointsB[i].position;

      // Calculate the distance in the xz plane
      let distance = distance(vec2<f32>(pointA.x, pointA.z), vec2<f32>(pointB.x, pointB.z));

      if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
      }
  }

  // Assign the new y value based on the distance to the nearest point in B
  let newY = 1.0 - minDistance;

  // Update the vertex with the new y value and the nearest vertex index
  updatedPointsA[index] = Vertex(vec3<f32>(pointA.x, newY, pointA.z), nearestIndex);
}`;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    const pipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    const usageA = GPUBufferUsage.STORAGE;
    const usageB = GPUBufferUsage.STORAGE;
    const usageC = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;

    const bufferA = this.createBufferFromPoints(pointsA, true, usageA, true);
    const bufferB = this.createBufferFromPoints(pointsB, false, usageB, true);
    const bufferC = this.createBufferFromPoints(pointsA, true, usageC, false);

    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufferA } },
        { binding: 1, resource: { buffer: bufferB } },
        { binding: 2, resource: { buffer: bufferC } },
      ],
    });

    const computeEncoder = this.device.createCommandEncoder();
    const passEncoder = computeEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(pointsA.length / workgroupSize));
    passEncoder.end();

    this.device.queue.submit([computeEncoder.finish()]);
    const readBuffer = this.device.createBuffer({
      size: bufferC.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const copyEncoder = this.device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(bufferC, 0, readBuffer, 0, bufferC.size);
    this.device.queue.submit([copyEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultArray = new Float32Array(readBuffer.getMappedRange());
    console.log(resultArray); // Check if it contains the expected values
    const resultCopy = Array.from(resultArray);
    readBuffer.unmap();

    return this.createMeshFromShaderOutput(
      this.convertToVec3Array(pointsA),
      this.convertToVec3Array(pointsB),
      resultCopy,
    );
  }
}
