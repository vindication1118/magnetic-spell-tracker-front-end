import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

@Component({
  selector: 'app-test-gpu-csg',
  standalone: true,
  imports: [],
  templateUrl: './test-gpu-csg.component.html',
  styleUrls: ['./test-gpu-csg.component.scss'],
})
export class TestGpuCsgComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef;

  constructor() {}

  ngOnInit(): void {
    console.log('init');
  }

  ngAfterViewInit(): void {
    this.initWebGL();
  }

  private initWebGL(): void {
    const canvas = this.canvasRef.nativeElement;
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      logarithmicDepthBuffer: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const textureWidth = 512;
    const textureHeight = 512;

    const renderTarget = new THREE.WebGLRenderTarget(
      textureWidth,
      textureHeight,
    );
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      precision highp float;

uniform vec2 resolution;

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
  float d1 = sphereSDF(p - vec3(0.0, 0.0, 0.0), 0.5);
  float d2 = boxSDF(p + vec3(0.2, 0.0, 0.0), vec3(0.3));
  return opDifference(d1, d2);
}

// Ray marching to find the distance to the nearest surface
float rayMarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 100; i++) {
    vec3 p = ro + t * rd;
    float d = getDistance(p);
    if (d < 0.001) {
      return t; // Return the distance where the ray intersects the surface
    }
    t += d;
  }
  return -1.0; // No intersection found
}

// Calculate normal at a given point on the surface
vec3 getNormal(vec3 p) {
  float eps = 0.001;
  vec3 n;
  n.x = getDistance(p + vec3(eps, 0.0, 0.0)) - getDistance(p - vec3(eps, 0.0, 0.0));
  n.y = getDistance(p + vec3(0.0, eps, 0.0)) - getDistance(p - vec3(0.0, eps, 0.0));
  n.z = getDistance(p + vec3(0.0, 0.0, eps)) - getDistance(p - vec3(0.0, 0.0, eps));
  return normalize(n);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution * 2.0 - 1.0;
  uv.x *= resolution.x / resolution.y; // Correct aspect ratio
  vec3 ro = vec3(0.0, 0.0, 2.0); // Ray origin
  vec3 rd = normalize(vec3(uv, -1.0)); // Ray direction

  float t = rayMarch(ro, rd);
  if (t > 0.0) {
    vec3 p = ro + t * rd;
    vec3 n = getNormal(p);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, lightDir), 0.0);
    gl_FragColor = vec4(vec3(diff), 1.0); // Output shaded color
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Background color
  }
}
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        resolution: { value: new THREE.Vector2(textureWidth, textureHeight) },
      },
    });
    const fieldOfView = 1;
    const nearClippingPlane = 0.1;
    const farClippingPlane = 80000;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const lightAmbient = new THREE.AmbientLight(0xffffff, 0.5); // soft white light
    scene.add(lightAmbient);
    const lightDirected = new THREE.DirectionalLight(0xffffff, 1.0);
    scene.add(lightDirected);
    scene.add(plane);
    const aspectRatio = this.getAspectRatio(canvas);
    const camera = new THREE.PerspectiveCamera(
      fieldOfView,
      aspectRatio,
      nearClippingPlane,
      farClippingPlane,
    );
    camera.position.x = 0;
    camera.position.y = 0;
    camera.position.z = 0;
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const sdfData = new Uint8Array(textureWidth * textureHeight * 4);
    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      textureWidth,
      textureHeight,
      sdfData,
    );

    //const boxGeo = new THREE.BoxGeometry(10, 10, 10);
    //const boxMat = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    //const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    //scene.add(boxMesh);

    // Implement Marching Cubes on CPU using the sdfData
    const vertices: number[] = [];
    const indices: number[] = [];
    // ... (Marching Cubes implementation)

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xffff00 }),
    );
    this.removeObject(plane, scene);
    scene.add(mesh);

    const controls = new OrbitControls(camera, renderer.domElement);
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();
  }

  private getAspectRatio(canvas: HTMLCanvasElement) {
    return canvas.clientWidth / canvas.clientHeight;
  }
  private removeObject(mesh: THREE.Mesh | null, scene: THREE.Scene): void {
    if (mesh) {
      scene.remove(mesh); // Remove from scene
      if (mesh.geometry) {
        mesh.geometry.dispose(); // Dispose of geometry
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else {
          mesh.material.dispose(); // Dispose of material
        }
      }
      mesh = null;
    }
  }
}
