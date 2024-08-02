import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChildren,
  QueryList,
  Input,
  NgZone,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
//import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { SpellTracker } from '../../utils/Object-Generation';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// import Stats from 'three/examples/jsm/libs/stats.module';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { saveAs } from 'file-saver';
import { MatButtonModule } from '@angular/material/button';
import { EditorData } from '../../interfaces/editor-data';
import { TrackerModule, TextModule } from '../../interfaces/tracker-module';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { StlFilenames } from '../../interfaces/stl-filenames';
import JSZip from 'jszip';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import * as d3 from 'd3';
import { PathPosition } from '../../interfaces/path-position';
//import fontDataBold from 'three/examples/fonts/droid/droid_sans_bold.typeface.json';
@Component({
  selector: 'app-preview3d',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './preview3d.component.html',
  styleUrl: './preview3d.component.scss',
})
export class Preview3dComponent implements OnInit, AfterViewInit {
  @ViewChildren('canvas') canvasses!: QueryList<ElementRef>;
  private canvasRef!: ElementRef;
  private marchingRef!: ElementRef;
  @ViewChild('svgContainer')
  private svgContainer!: ElementRef;
  private frameID: number | null = null;
  private svgGroup!: d3.Selection<SVGSVGElement, unknown, null, undefined>;

  //* Cube Properties
  @Input() modulesList!: TrackerModule[];
  public rotationSpeedX: number = 0.05;
  public rotationSpeedY: number = 0.01;
  public size: number = 200;
  public texture: string = '/assets/texture.jpg';
  //* Stage Properties
  public cameraZ: number = 8000;
  public fieldOfView: number = 1;
  public nearClippingPlane: number = 0.1;
  public farClippingPlane: number = 80000;

  @Input() public editorData: EditorData = {
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
      minX: 10,
      minY: 20,
      maxX: 141.8,
      maxY: 129.4,
    },
  };

  //? Helper Properties (Private Properties);

  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private marchingControls!: OrbitControls;
  private exporter: STLExporter = new STLExporter();
  private exporterOptions = { binary: true };
  private tracker!: SpellTracker;
  private lightDirected!: THREE.DirectionalLight;
  private marchingCamera!: THREE.PerspectiveCamera;
  private marchingScene!: THREE.Scene;

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }
  private get marching(): HTMLCanvasElement {
    return this.marchingRef.nativeElement;
  }
  private loader = new THREE.TextureLoader();
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private material = new THREE.MeshBasicMaterial();
  private objectLoader = new THREE.ObjectLoader();
  private cube: THREE.Mesh = new THREE.Mesh(this.geometry, this.material);

  private renderer!: THREE.WebGLRenderer;
  private marchingRenderer!: THREE.WebGLRenderer;

  private scene!: THREE.Scene;
  private layer1Height!: number;
  private composer!: EffectComposer;

  // SSAO pass
  private ssaoPass!: SSAOPass;

  constructor(private ngZone: NgZone) {}
  /*
  private initWebGL(): void {
    const aspectRatio = this.getAspectRatio();
    this.marchingRenderer = new THREE.WebGLRenderer({
      canvas: this.marching,
      logarithmicDepthBuffer: true,
    });
    this.marchingRenderer.setSize(window.innerWidth, window.innerHeight);

    this.marchingScene = new THREE.Scene();
    this.marchingCamera = new THREE.PerspectiveCamera(
      this.fieldOfView,
      aspectRatio,
      this.nearClippingPlane,
      this.farClippingPlane,
    );
    this.marchingCamera.position.z = 5;

    const resolution = 50; // Define the resolution of the Marching Cubes
    const effect = new MarchingCubes(
      resolution,
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
      true,
      true,
      100000,
    );
    effect.position.set(0, 0, 0);
    effect.scale.set(700, 700, 700);

    this.marchingScene.add(effect);

    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(1, 1, 1).normalize();
    this.marchingScene.add(light);

    // Markers for the axes. Keep commented for debug
    const xMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 100, 16),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    xMarker.position.set(50, 0, 0);
    xMarker.rotation.set(0, 0, (90 * Math.PI) / 180);
    this.marchingScene.add(xMarker);
    const yMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 100, 16),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
    );
    yMarker.position.set(0, 50, 0);
    this.marchingScene.add(yMarker);
    const zMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 100, 16),
      new THREE.MeshStandardMaterial({ color: 0x0000ff }),
    );
    zMarker.position.set(0, 0, 50);
    zMarker.rotation.set((90 * Math.PI) / 180, 0, 0);
    this.marchingScene.add(zMarker);

    // Define the SDF functions and add objects
    this.updateCubes(effect);
    /*
    const animate = () => {
      requestAnimationFrame(animate);
      this.updateCubes(effect);
      this.marchingRenderer.render(this.marchingScene, this.marchingCamera);
    };

    animate();
    this.marchingRenderer.setPixelRatio(devicePixelRatio);
    this.marchingRenderer.setSize(
      this.marching.clientWidth,
      this.marching.clientHeight,
    );
    this.marchingControls = new OrbitControls(
      this.marchingCamera,
      this.marchingRenderer.domElement,
    );
    //eslint-disable-next-line
    const component: Preview3dComponent = this;
    this.ngZone.runOutsideAngular(() => {
      (function render() {
        component.frameID = requestAnimationFrame(render);
        component.updateCubes(effect);
        //component.animateCube();
        component.marchingControls.update();
        component.marchingRenderer.render(
          component.marchingScene,
          component.marchingCamera,
        );
        //console.log(component.camera.position);
      })();
    });
  }

  private updateCubes(effect: MarchingCubes): void {
    effect.reset();

    const sphere = (x: number, y: number, z: number, r: number) => {
      return (xi: number, yi: number, zi: number) => {
        return Math.sqrt((xi - x) ** 2 + (yi - y) ** 2 + (zi - z) ** 2) - r;
      };
    };

    const box = (
      x: number,
      y: number,
      z: number,
      bx: number,
      by: number,
      bz: number,
    ) => {
      return (xi: number, yi: number, zi: number) => {
        const dx = Math.max(Math.abs(xi - x) - bx, 0);
        const dy = Math.max(Math.abs(yi - y) - by, 0);
        const dz = Math.max(Math.abs(zi - z) - bz, 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      };
    };

    const combineSDF = (
      sdf1: CallableFunction,
      sdf2: CallableFunction,
      operation: string,
    ) => {
      return (x: number, y: number, z: number) => {
        const d1 = sdf1(x, y, z);
        const d2 = sdf2(x, y, z);
        if (operation === 'union') {
          return Math.min(d1, d2);
        } else if (operation === 'intersection') {
          return Math.max(d1, d2);
        } else if (operation === 'difference') {
          return Math.max(d1, -d2);
        }
        return d1;
      };
    };

    const resolution = 50; // Ensure resolution matches the one used in the effect initialization
    const halfResolution = resolution / 2;
    const sdfResolution = 1 / resolution;

    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        for (let z = 0; z < resolution; z++) {
          const px = x * sdfResolution - halfResolution;
          const py = y * sdfResolution - halfResolution;
          const pz = z * sdfResolution - halfResolution;

          const sphere1 = sphere(20, 20, 20, 30);
          const box1 = box(-20, -20, -20, 20, 20, 20);
          const sdf = combineSDF(sphere1, box1, 'union');

          const value = sdf(px, py, pz);
          effect.field[x + y * resolution + z * resolution * resolution] =
            value;
        }
      }
    }

    effect.update();
    console.log(effect);
  } */

  /**
   * Create the scene
   *
   * @private
   * @memberof EditorComponent
   */
  private createScene() {
    //* Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    const lightAmbient = new THREE.AmbientLight(0xffffff, 0.5); // soft white light
    this.scene.add(lightAmbient);
    this.lightDirected = new THREE.DirectionalLight(0xffffff, 1.0);
    this.scene.add(this.lightDirected);
    const targetObj = new THREE.Object3D();
    const bbox = this.editorData.boundingBox;
    console.log(bbox);
    targetObj.position.set(
      (1 * (bbox.maxX - bbox.minX)) / 2,
      0,
      (1 * (bbox.maxY - bbox.minY)) / 2,
    );
    this.scene.add(targetObj);
    this.lightDirected.target = targetObj;
    this.lightDirected.position.set(0, 1000, 0);
    /* // Markers for the axes. Keep commented for debug
    const xMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 100, 16),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    xMarker.position.set(50, 0, 0);
    xMarker.rotation.set(0, 0, (90 * Math.PI) / 180);
    this.scene.add(xMarker);
    const yMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 100, 16),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
    );
    yMarker.position.set(0, 50, 0);
    this.scene.add(yMarker);
    const zMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 100, 16),
      new THREE.MeshStandardMaterial({ color: 0x0000ff }),
    );
    zMarker.position.set(0, 0, 50);
    zMarker.rotation.set((90 * Math.PI) / 180, 0, 0);
    this.scene.add(zMarker); */

    //*Camera
    const aspectRatio = this.getAspectRatio();
    this.camera = new THREE.PerspectiveCamera(
      this.fieldOfView,
      aspectRatio,
      this.nearClippingPlane,
      this.farClippingPlane,
    );
    this.camera.position.x = (1 * (bbox.maxX - bbox.minX)) / 2;
    this.camera.position.y = 8000;
    this.camera.position.z = 8000;
    this.generateLayer3TextMeshes();

    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(new URL('./3d.worker', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }) => {
        console.log('Adding new object');
        this.scene.add(this.objectLoader.parse(data));
      };
      worker.postMessage({
        eD: this.editorData,
        mL: this.modulesList,
      });
    } else {
      // Web workers are not supported in this environment.
      console.log('Web workers not allowed!');
      this.tracker.addBaseLayer1().then((layer1) => {
        this.scene.add(layer1);
      });
      this.tracker.createLayer2().then((layer2) => {
        for (const mesh of layer2) {
          this.scene.add(mesh);
        }
      });
      this.tracker.createLayer3().then((layer3) => {
        this.scene.add(layer3);
      });
    }
  }

  private getAspectRatio() {
    return this.canvas.clientWidth / this.canvas.clientHeight;
  }

  /**
   * Start the rendering loop
   *
   * @private
   * @memberof EditorComponent
   */
  private startRenderingLoop() {
    //* Renderer
    // Use canvas element in template
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      logarithmicDepthBuffer: true,
    });
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // SSAO pass
    this.ssaoPass = new SSAOPass(
      this.scene,
      this.camera,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
    );
    this.ssaoPass.kernelRadius = 32;
    this.ssaoPass.minDistance = 0.05;
    this.ssaoPass.maxDistance = 0.1;
    this.composer.addPass(this.ssaoPass);
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    //eslint-disable-next-line
    const component: Preview3dComponent = this;
    this.ngZone.runOutsideAngular(() => {
      (function render() {
        component.frameID = requestAnimationFrame(render);
        //component.animateCube();
        component.controls.update();
        component.updateLighting(component.lightDirected, component.camera);
        component.renderer.render(component.scene, component.camera);
        //console.log(component.camera.position);
      })();
    });
  }

  ngOnInit(): void {
    window.addEventListener('resize', () => this.onWindowResize());
  }

  ngAfterViewInit() {
    console.log(this.canvasses);
    this.canvasRef = this.canvasses.first;
    this.marchingRef = this.canvasses.last;
    this.svgGroup = d3
      .select(this.svgContainer.nativeElement)
      .append('svg')
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      .attr('viewBox', '0 0 200 200')
      .attr('width', '100%')
      .attr('height', '100%');
    this.tracker = new SpellTracker(this.editorData, this.modulesList);
    //this.initWebGL();
    this.createScene();
    this.startRenderingLoop();
  }

  private updateLighting(
    lightDirected: THREE.DirectionalLight,
    camera: THREE.Camera,
  ) {
    let lightY = camera.position.y;
    if (lightY >= 1500) {
      lightY = 1500;
    }
    if (lightY <= -1500) {
      lightY = -1500;
    }
    lightDirected.position.set(camera.position.x, lightY, camera.position.z);
  }
  private onWindowResize(): void {
    this.ngZone.runOutsideAngular(() => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.marchingCamera.aspect = window.innerWidth / window.innerHeight;
      this.marchingCamera.updateProjectionMatrix();
      this.marchingRenderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Function to export and download each object as STL
  // names are 'sliderLayer2', 'dialLayer2', 'layer1', 'layer3'
  public outputSTL() {
    const jsZip = new JSZip();

    // Assuming you have an array of blobs and corresponding filenames
    const blobs: Blob[] = [];
    const filenames: string[] = [];
    const nameArr: string[] = [];
    const fileCount: StlFilenames = {
      layer1: 0,
      layer3: 0,
      sliderLayer2: 0,
      dialLayer2: 0,
    };
    this.scene.children.forEach((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        // Export the geometry
        switch (child.name) {
          case 'layer1':
            fileCount.layer1++;
            break;
          case 'sliderLayer2':
            fileCount.sliderLayer2++;
            break;
          case 'dialLayer2':
            fileCount.dialLayer2++;
            break;
          case 'layer3':
            fileCount.layer3++;
            break;
          default:
            break;
        }
        if (!nameArr.includes(child.name)) {
          nameArr.push(child.name);
          const stlString = this.exporter.parse(child);

          // Create a blob from the STL string
          const blob = new Blob([stlString], { type: 'text/plain' });
          blobs.push(blob);
          filenames.push(child.name + '.stl');
        }
      }
    });
    const readme =
      'layer1.stl: print ' +
      fileCount.layer1 +
      ' time(s) \nsliderLayer2.stl: print ' +
      fileCount.sliderLayer2 +
      ' time(s) \ndialLayer2.stl: print ' +
      fileCount.dialLayer2 +
      ' time(s) \nlayer3: print ' +
      fileCount.layer3 +
      ' time(s) \n';

    const readmeBlob = new Blob([readme], { type: 'text/plain' });
    blobs.push(readmeBlob);
    filenames.push('README.md');

    // Add each blob to the zip with a filename
    blobs.forEach((blob, index) => {
      jsZip.file(filenames[index], blob);
    });

    // Generate the zip file as a blob
    jsZip.generateAsync({ type: 'blob' }).then((zipBlob) => {
      // You now have a zipBlob representing your zip file, which you can download or use as needed
      saveAs(zipBlob, 'my-test-stls.zip');
    });
  }

  /** This would go in a separate module to be run in a web worker, but requires access to the DOM
   *  in order to work properly. All the CSG stuff is the expensive stuff anyway, so we build the
   *  mesh here, store it in the modulesList, then handle it in a web worker or failing that,
   *  in the tracker module
   */
  public generateLayer3TextMeshes() {
    for (const module of this.modulesList) {
      if (module['type'] === 3) {
        const textModule = module as TextModule;
        console.log(textModule.data);
        const textMesh = this.generateTextMeshJSON(
          module['data'][3] as unknown as string,
          module as TextModule,
        );
        textModule['meshJSON'] = textMesh;
      }
    }
    //console.log(this.modulesList);
    this.tracker.updateModulesList(this.modulesList);
  }

  /**This would go in a separate module to be run in a web worker, but requires access to the DOM in order to
   * work properly. All the CSG stuff is the expensive stuff anyway, so we build the mesh here then merge it
   * in the web worker
   */

  public generateTextMeshJSON(
    svgPathNode: string,
    moduleInfo: TextModule,
  ): object[] {
    const layer3Height =
      moduleInfo.editorData.minWallWidth + moduleInfo.editorData.textDepth;
    const yTranslate = layer3Height / 2 + 5 - moduleInfo.editorData.textDepth;
    const loader = new SVGLoader();
    const data = loader.parse(svgPathNode);
    const paths = data.paths;
    console.log(paths);
    const shapes: THREE.Shape[] = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      const shapesTemp = path.toShapes(true);
      shapes.push(...shapesTemp);
    }
    const extrudeSettings = {
      steps: 2,
      depth: moduleInfo.editorData.textDepth * 2,
      bevelEnabled: false,
      bevelThickness: 0,
      bevelSize: 0,
      bevelOffset: 0,
      bevelSegments: 0,
    };
    /**
     * each continuous non whitespace character or continuous component of a character
     * (like i is 2 because of the i dot) in our string has its own array of
     * {x: xval, y: yval} objects
     */
    console.log(shapes);
    const myShapes = shapes.map((shape) => {
      const points = shape.extractPoints(5);
      const allPoints = [...points.shape, ...points.holes.flat()];
      return allPoints;
    });
    const myCoords: d3.Delaunay.Point[][] = [];
    for (const char of myShapes) {
      const coordArr: d3.Delaunay.Point[] = [];
      for (const coord of char) {
        const currentCoord: d3.Delaunay.Point = [coord.x, coord.y];
        coordArr.push(currentCoord);
      }
      myCoords.push(coordArr);
    }
    //console.log(myCoords);

    this.generateVoronoiFromText(myCoords, moduleInfo);
    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.position.y = yTranslate;
    mesh.updateMatrix();
    const meshJSON = mesh.toJSON();
    console.log(meshJSON);
    return meshJSON;
  }

  public generateVoronoiFromText(
    coords: d3.Delaunay.Point[][],
    moduleInfo: TextModule,
  ) {
    //console.log(this.svgGroup);
    for (const char of coords) {
      const delaunay = d3.Delaunay.from(char);
      const voronoi = delaunay.voronoi(this.getVoronoiBounds(char));
      const svgPath = voronoi.render();
      //console.log(svgPath);
      this.svgGroup
        .append('path')
        .attr('d', svgPath)
        .style('stroke', 'white')
        .style('stroke-width', 0.05);
    }
    console.log(moduleInfo.data);
    this.svgGroup
      .append('path')
      .attr('d', moduleInfo.data[5])
      .style('stroke', 'red')
      .style('stroke-width', 0.05)
      .style('fill', 'none');
  }

  public addExtraPoints(points: THREE.Vector2[], density = 10) {
    const newPoints = [];
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

  public getVoronoiBounds(
    coords: d3.Delaunay.Point[],
  ): [number, number, number, number] {
    //[xMin, yMin, xMax, yMax]
    const bounds: [number, number, number, number] = [
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      Number.MIN_VALUE,
    ];
    for (const point of coords) {
      if (point[0] < bounds[0]) {
        bounds[0] = point[0];
      }
      if (point[1] < bounds[1]) {
        bounds[1] = point[1];
      }
      if (point[0] > bounds[2]) {
        bounds[2] = point[0];
      }
      if (point[1] > bounds[3]) {
        bounds[3] = point[1];
      }
    }
    const finalBounds: [number, number, number, number] = [
      bounds[0] - 1,
      bounds[1] - 1,
      bounds[2] + 1,
      bounds[3] + 1,
    ];
    return finalBounds;
  }

  public parsePathData(pathData: string) {
    const commands = pathData.match(/[a-df-z][^a-df-z]*/gi);
    let x = 0,
      y = 0,
      firstPosition = { x: 0, y: 0 }; // Starting position of the pen
    const positions: PathPosition[] = [];
    if (commands !== null) {
      commands.forEach((command) => {
        const type = command[0];
        const args = command
          .slice(1)
          .trim()
          .split(/[\s,]+/)
          .map(Number);

        switch (type) {
          case 'M': // Move to absolute
            [x, y] = args;
            positions.push({ x, y });
            break;
          case 'm': // Move to relative
            x += args[0];
            y += args[1];
            positions.push({ x, y });
            break;
          case 'L': // Line to absolute
            [x, y] = args;
            positions.push({ x, y });
            break;
          case 'l': // Line to relative
            x += args[0];
            y += args[1];
            positions.push({ x, y });
            break;
          case 'H': // Horizontal line to absolute
            x = args[0];
            positions.push({ x, y });
            break;
          case 'h': // Horizontal line to relative
            x += args[0];
            positions.push({ x, y });
            break;
          case 'V': // Vertical line to absolute
            y = args[0];
            positions.push({ x, y });
            break;
          case 'v': // Vertical line to relative
            y += args[0];
            positions.push({ x, y });
            break;
          case 'Q': // Quadratic Bézier curve to absolute
            {
              const [cx, cy, x2, y2] = args;
              x = x2;
              y = y2;
              positions.push({ x, y, cx, cy });
            }
            break;
          case 'q': // Quadratic Bézier curve to relative
            {
              const [dx, dy, dx2, dy2] = args;
              const cx = x + dx;
              const cy = y + dy;
              x += dx2;
              y += dy2;
              positions.push({ x, y, cx, cy });
            }
            break;
          case 'Z':
          case 'z': // Close path
            firstPosition = positions[0];
            x = firstPosition.x;
            y = firstPosition.y;
            positions.push({ x, y });
            break;
          // Handle other commands if necessary
        }
      });
    }

    return positions;
  }
}
