import { PathPosition } from '../interfaces/path-position';
import { Injectable } from '@angular/core';
import * as THREE from 'three';

@Injectable({
  providedIn: 'root',
})
export class WebGpuOpsService {
  constructor() {}
  public async calculateVertices() {
    if (!navigator.gpu) {
      console.error('WebGPU not supported in this browser.');
      return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
      console.error('Failed to obtain WebGPU device.');
      return;
    }

    // Load shader code
    const shaderCode = await fetch('/shaders/nearestVertex.wgsl').then(
      (response) => response.text(),
    );

    // Define vertices (for example purposes, replace with your data)
    const verticesAtY0 = new Float32Array([
      /* ... */
    ]);
    const verticesAtY1 = new Float32Array([
      /* ... */
    ]);

    // Create buffers
    const vertexBufferY0 = device.createBuffer({
      size: verticesAtY0.byteLength,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBufferY0.getMappedRange()).set(verticesAtY0);
    vertexBufferY0.unmap();

    const vertexBufferY1 = device.createBuffer({
      size: verticesAtY1.byteLength,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBufferY1.getMappedRange()).set(verticesAtY1);
    vertexBufferY1.unmap();

    const resultBuffer = device.createBuffer({
      size: verticesAtY1.length * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create shader module
    const shaderModule = device.createShaderModule({
      code: shaderCode,
    });

    // Set up pipeline
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    // Create bind group
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: vertexBufferY0 } },
        { binding: 1, resource: { buffer: vertexBufferY1 } },
        { binding: 2, resource: { buffer: resultBuffer } },
      ],
    });

    // Create command encoder and compute pass
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(verticesAtY1.length);
    passEncoder.end();

    // Submit the command buffer
    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    // Read results
    const resultReadBuffer = device.createBuffer({
      size: resultBuffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    commandEncoder.copyBufferToBuffer(
      resultBuffer,
      0,
      resultReadBuffer,
      0,
      resultBuffer.size,
    );
    device.queue.submit([commandEncoder.finish()]);

    await resultReadBuffer.mapAsync(GPUMapMode.READ);
    const resultArray = new Uint32Array(resultReadBuffer.getMappedRange());
    console.log('Nearest vertices indices:', resultArray);

    resultReadBuffer.unmap();
  }

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

  public async runComputeShader(workgroupSize: number): Promise<Float32Array> {
    if (!this.device) {
      throw new Error('GPU device not initialized.');
    }

    const shaderCode = `
      @group(0) @binding(0) var<storage, read_write> buffer : array<f32>;

      @compute @workgroup_size(${workgroupSize})
      fn main(@builtin(global_invocation_id) id : vec3<u32>) {
        let index = id.x;
        buffer[index] = f32(index) * 2.0;
      }
    `;

    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    const pipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    const data = new Float32Array(64);
    const buffer = this.device.createBuffer({
      size: data.byteLength,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();

    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: buffer,
          },
        },
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(1); // Adjust based on workload
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Read back the results
    const readBuffer = this.device.createBuffer({
      size: buffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    commandEncoder.copyBufferToBuffer(buffer, 0, readBuffer, 0, buffer.size);
    this.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultArray = new Float32Array(readBuffer.getMappedRange());

    return resultArray;
  }

  convertToShaderFormat(
    points: (PathPosition | THREE.Vector2)[],
  ): Float32Array {
    const flatArray: number[] = [];

    points.forEach((point) => {
      flatArray.push(point.x, 1, point.y); // swap y to z and set y to 1
    });

    return new Float32Array(flatArray);
  }

  createBufferFromPoints(points: (PathPosition | THREE.Vector2)[]): GPUBuffer {
    if (!this.device) {
      throw new Error('GPU device not initialized.');
    }

    const flatArray = this.convertToShaderFormat(points);
    const buffer = this.device.createBuffer({
      size: flatArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(buffer.getMappedRange()).set(flatArray);
    buffer.unmap();

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

  async runComputeShaderWithDynamicWorkgroupSize(
    workgroupSize: number,
    pointsA: (PathPosition | THREE.Vector2)[],
    pointsB: (PathPosition | THREE.Vector2)[],
  ): Promise<[number, number, number][]> {
    if (!this.device) {
      throw new Error('GPU device not initialized.');
    }

    // Shader code as a string, with a placeholder for workgroup size
    const shaderCode = `
      struct Vertex {
        position : vec3<f32>;
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
          let distance = distance(vec2<f32>(pointA.x, pointA.z), vec2<f32>(pointB.x, pointB.z));

          if (distance < minDistance) {
            minDistance = distance;
            nearestIndex = i;
          }
        }

        let newY = 1.0 + minDistance;
        updatedPointsA[index] = Vertex(vec3<f32>(pointA.x, newY, pointA.z));
      }
    `;

    // Compile the shader with the updated workgroup size
    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    const pipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });

    const bufferA = this.createBufferFromPoints(pointsA);
    const bufferB = this.createBufferFromPoints(pointsB);

    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: bufferA,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: bufferB,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: bufferA, // Writing updated positions back to bufferA
          },
        },
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(pointsA.length / workgroupSize)); // Adjust based on workload
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Read back the results
    const readBuffer = this.device.createBuffer({
      size: bufferA.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    commandEncoder.copyBufferToBuffer(bufferA, 0, readBuffer, 0, bufferA.size);
    this.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultArray = new Float32Array(readBuffer.getMappedRange());
    const resultVec3Array = this.convertBufferToVec3Array(resultArray);
    return resultVec3Array;
  }
}
