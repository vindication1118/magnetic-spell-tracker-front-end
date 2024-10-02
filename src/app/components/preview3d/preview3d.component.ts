import { ManifoldWasmService } from './../../services/manifold-wasm.service';
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
import { SpellTracker } from '../../utils/Object-Gen-Combo';
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
import { CommandHandler } from '../../utils/SVGUtils';
import { CharShape } from '../../interfaces/char-shape';
//import { CSG } from '../../utils/CSGMesh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Manifold } from 'manifold-3d';
//import booleans from '@jscad/modeling/src/operations/booleans';
//import { Geom3 } from '@jscad/modeling/src/geometries/types';
//import fontDataBold from 'three/examples/fonts/droid/droid_sans_bold.typeface.json';
import { pathExtruder } from '../../utils/jscad-path-extrude';
//4import { Geom3 } from '@jscad/modeling/src/geometries/types';
import { Vec3 } from '@jscad/modeling/src/maths/vec3';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private manifoldInstance!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private meshInstance!: any;
  private wasmLoaded: boolean = false;

  constructor(
    private ngZone: NgZone,
    private manifoldService: ManifoldWasmService,
    //private webGpuOpsService: WebGpuOpsService,
  ) {}

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
    const lightAmbient = new THREE.AmbientLight(0xffffff, 0.1); // soft white light
    this.scene.add(lightAmbient);
    this.lightDirected = new THREE.DirectionalLight(0xffffff, 1.0);
    this.scene.add(this.lightDirected);
    const targetObj = new THREE.Object3D();
    const bbox = this.editorData.boundingBox;
    console.log(bbox);
    /*targetObj.position.set(
      (1 * (bbox.maxX - bbox.minX)) / 2,
      0,
      (1 * (bbox.maxY - bbox.minY)) / 2,
    );*/
    targetObj.position.set(60, -100, 0);
    this.scene.add(targetObj);
    this.lightDirected.target = targetObj;
    this.lightDirected.position.set(100, 200, 100);

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
    this.generateLayer3TextExtrusionsTri();
    this.addAxesMarkers(true, true);

    /*
    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(new URL('./3d.worker', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }) => {
        console.log('Adding new object');
        console.log(data);
        //this.scene.add(this.objectLoader.parse(data));
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
    } */
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

  async ngOnInit() {
    console.log('init preview3d');
    window.addEventListener('resize', () => this.onWindowResize());
    console.log('init wasm');
    await this.manifoldService.init();
    console.log('getting preview manifold inst');
    this.manifoldInstance = await this.manifoldService.getManifoldInstance();
    this.meshInstance = await this.manifoldService.getMeshInstance();
    console.log('doing three integration');

    this.wasmLoaded = true;
    console.log('done with preview init');
  }

  async ngAfterViewInit() {
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
    const zoomableGroup = this.svgGroup.append('g');
    // Define the zoomed function
    function zoomed(event: d3.D3ZoomEvent<SVGGElement, unknown>): void {
      // Apply the transformation to the <g> element
      zoomableGroup.attr('transform', event.transform.toString());
    }

    // Add your content to the zoomable group
    zoomableGroup
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'none')
      .attr('x', 0)
      .attr('y', 0);

    // Set up the zoom behavior
    const zoom: d3.ZoomBehavior<SVGSVGElement, unknown> = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 5]) // Zoom limits
      .on('zoom', zoomed); // Attach the zoomed function to the zoom event

    // Apply the zoom behavior to the SVG
    this.svgGroup.call(zoom);

    await this.manifoldService.init();
    this.tracker = new SpellTracker(this.editorData, this.modulesList);
    //this.initWebGL();
    this.createScene();
    this.startRenderingLoop();
  }

  // X is red, Y is Green, Z is Blue
  private async addAxesMarkers(three: boolean, manifold: boolean) {
    if (three) {
      // Markers for the axes.
      const xMarker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 200, 16),
        new THREE.MeshStandardMaterial({ color: 0xff0000 }),
      );
      xMarker.position.set(100, 0, 0);
      xMarker.rotation.set(0, 0, (90 * Math.PI) / 180);
      this.scene.add(xMarker);
      const yMarker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 200, 16),
        new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
      );
      yMarker.position.set(0, 100, 0);
      this.scene.add(yMarker);
      const zMarker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 200, 16),
        new THREE.MeshStandardMaterial({ color: 0x0000ff }),
      );
      zMarker.position.set(0, 0, 100);
      zMarker.rotation.set((90 * Math.PI) / 180, 0, 0);
      this.scene.add(zMarker);
    }
    if (manifold) {
      await this.manifoldService.init();
      const wasm = this.manifoldService.wasm;
      // Markers for the axes.
      let xMarker: Manifold = wasm.Manifold.cylinder(100, 0.1, 0.1, 100, false);
      xMarker = xMarker.rotate(0, -90, 0);
      let xMarkerPlus: Manifold = wasm.Manifold.cube(3, true);
      xMarkerPlus = xMarkerPlus.translate([100, 0, 0]);
      let xMarkerMinus: Manifold = wasm.Manifold.sphere(3, 16);
      xMarkerMinus = xMarkerMinus.translate([-100, 0, 0]);
      this.scene.add(
        this.manifoldService.manifold2ThreeMesh(
          xMarker,
          new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        ),
        this.manifoldService.manifold2ThreeMesh(
          xMarkerPlus,
          new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        ),
        this.manifoldService.manifold2ThreeMesh(
          xMarkerMinus,
          new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        ),
      );
      let yMarker: Manifold = wasm.Manifold.cylinder(100, 0.1, 0.1, 100, false);
      yMarker = yMarker.rotate(-90, 0, 0);
      let yMarkerPlus: Manifold = wasm.Manifold.cube(3, true);
      yMarkerPlus = yMarkerPlus.translate([0, 100, 0]);
      let yMarkerMinus: Manifold = wasm.Manifold.sphere(3, 16);
      yMarkerMinus = yMarkerMinus.translate([0, -100, 0]);
      this.scene.add(
        this.manifoldService.manifold2ThreeMesh(
          yMarker,
          new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
        ),
        this.manifoldService.manifold2ThreeMesh(
          yMarkerPlus,
          new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
        ),
        this.manifoldService.manifold2ThreeMesh(
          yMarkerMinus,
          new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
        ),
      );
      const zMarker: Manifold = wasm.Manifold.cylinder(
        100,
        0.1,
        0.1,
        100,
        false,
      );
      let zMarkerPlus: Manifold = wasm.Manifold.cube(3, true);
      zMarkerPlus = zMarkerPlus.translate([0, 0, 100]);
      let zMarkerMinus: Manifold = wasm.Manifold.sphere(3, 16);
      zMarkerMinus = zMarkerMinus.translate([0, 0, -100]);
      this.scene.add(
        this.manifoldService.manifold2ThreeMesh(
          zMarker,
          new THREE.MeshBasicMaterial({ color: 0x0000ff }),
        ),
        this.manifoldService.manifold2ThreeMesh(
          zMarkerPlus,
          new THREE.MeshBasicMaterial({ color: 0x0000ff }),
        ),
        this.manifoldService.manifold2ThreeMesh(
          zMarkerMinus,
          new THREE.MeshBasicMaterial({ color: 0x0000ff }),
        ),
      );
    }
  }

  /*
  private async calculate3DText(
    interior: (THREE.Vec2 | PathPosition)[],
    exterior: (THREE.Vec2 | PathPosition)[],
  ) {
    try {
      await WebGpuOps.initialize();
      const geometry = WebGpuOps
        .runComputeShaderAndCreateGeometry
        //interior,
        //exterior,
        ();
      geometry.then((result: Geom3) => {
        //convert to stl then to three and add to scene
        this.tracker
          .convertJSCADToThree(
            result,
            CommandHandler.getRandomArbitrary(0xaaaaaa, 0xffffff),
            true,
          )
          .then((mesh) => {
            this.scene.add(mesh);
          });
      });
    } catch (error) {
      console.error(error);
    }
  }*/

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
  public shapesToVec3s(shapes: THREE.Shape[]): Vec3[][] {
    const charVec3s: Vec3[][] = [];
    shapes.forEach((sh) => {
      const shPoints: Vec3[] = [];
      sh.getPoints(50).forEach((pt) => {
        shPoints.push([pt.x, pt.y, 0]);
      });
      charVec3s.push(shPoints);
      sh.getPointsHoles(50).forEach((hole) => {
        const holePoints: Vec3[] = [];
        hole.forEach((pt) => {
          holePoints.push([pt.x, pt.y, 0]);
        });
        charVec3s.push(holePoints);
      });
    });
    return charVec3s;
  }

  public charShapesToVec3s(shapes: CharShape[]): Vec3[][] {
    const charVec3s: Vec3[][] = [];
    shapes.forEach((sh) => {
      const shPoints: Vec3[] = [];
      sh.shape.forEach((pt) => {
        shPoints.push([pt.x, pt.y, 0]);
      });
      charVec3s.push(shPoints);
      sh.holes.forEach((hole) => {
        const holePoints: Vec3[] = [];
        hole.forEach((pt) => {
          holePoints.push([pt.x, pt.y, 0]);
        });
        charVec3s.push(holePoints);
      });
    });
    return charVec3s;
  }

  public async generateLayer3TextExtrusionsTri() {
    await this.manifoldService.init();
    const charDepth = 1;
    for (const module of this.modulesList) {
      if (module['type'] === 3) {
        console.log(module.data);
        const textMeshTri = this.generateTextShapes(
          module['data'][3] as unknown as string,
        );
        const extraPoints: CharShape[] = [];
        textMeshTri.forEach((sh) => {
          const newShape = this.tracker.addExtraPoints(sh.getPoints(20));
          const newHoles = sh.getPointsHoles(20).map((pts) => {
            return this.addExtraPoints(pts);
          });
          extraPoints.push({ shape: newShape, holes: newHoles });
        });
        const otherShapes = this.charShapesToVec3s(extraPoints);
        const myGeo3s = pathExtruder.testExtrude(2, otherShapes);
        myGeo3s.forEach((geo) => {
          this.tracker
            .convertJSCADToThree(geo, 0xffff00, true, true)
            .then((res) => {
              res.forEach((mesh) => {
                this.scene.add(mesh);
              });
            });
        });
        //textModule['meshJSON'] = textMesh;
        const textModule = module as TextModule;
        //console.log(textModule.data);
        /*
        const textMeshVertArr = this.generateTextMeshesForIntersect(
          module['data'][3] as unknown as string,
          textModule,
          charDepth,
        );
        const manifolds: Manifold[] = await this.tracker.getAllExtrusions(
          this.manifoldService,
          textMeshTri,
          charDepth,
        );

        for (let i = 0; i < manifolds.length; i++) {
          let maniVert = this.manifoldService.threeMesh2manifold(
            textMeshVertArr[i],
          );
          const translate = -(charDepth / 2 + 0.1);
          maniVert = maniVert.translate([0, 0, translate]);
          const maniFinal = this.manifoldService.csgSubtraction(
            maniVert,
            manifolds[i],
          );
          const maniMesh = this.manifoldService.manifold2ThreeMesh(
            maniFinal,
            new THREE.MeshStandardMaterial({
              transparent: true,
              opacity: 0.65,
            }),
          );
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const maniMeshWire = new THREE.Mesh(
            maniMesh.geometry,
            new THREE.MeshBasicMaterial({
              color: 0x0000ff,
              wireframe: true,
            }),
          );
          //this.scene.add(maniMesh, maniMeshWire);
        } */

        //const vert = textMeshVertArr[index];
        //const vertCSG = CSG.fromMesh(vert);
        //const triCSG = CSG.fromMesh(mesh);
        //const subtractCSG = this.manifoldService.threeSubtraction(vert, mesh);
        //const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
        //const intersectGeom = CSG.toGeometry(intersectCSG);
        //const intersectMesh = new THREE.Mesh(intersectGeom, material);
        //this.scene.add(subtractCSG);
        //this.scene.add(maniMesh);
        //this.scene.add(maniMeshWire);
        //await this.sleep(5000);
      }
    }
    //console.log(this.modulesList);
    this.tracker.updateModulesList(this.modulesList);
  }

  // Function to convert a Three.js geometry into a format usable by Manifold-3D
  public convertThreeJsToManifold(geometry: THREE.BufferGeometry) {
    // Extract positions (vertices) and indices (faces) from the BufferGeometry
    const positions = geometry.getAttribute('position').array;
    const indices = geometry.getIndex() ? geometry.getIndex()?.array : null;

    // Convert positions to a flat array of Vec3
    const vertices = [];
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push([positions[i], positions[i + 1], positions[i + 2]]);
    }

    // Convert indices to faces (triangles)
    const faces = [];
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        faces.push([indices[i], indices[i + 1], indices[i + 2]]);
      }
    } else {
      // If no indices are provided, create faces from sequential vertices
      for (let i = 0; i < vertices.length / 3; i++) {
        faces.push([i * 3, i * 3 + 1, i * 3 + 2]);
      }
    }

    return { vertices, faces };
  }

  public cleanTHREEMeshGeometry(geometry: THREE.BufferGeometry) {
    // Step 1: Merge vertices to remove duplicates
    geometry = BufferGeometryUtils.mergeVertices(geometry);

    // Step 2: Remove unreferenced vertices (not directly supported by Three.js)
    // Recalculate bounding sphere and bounding box to update geometry state
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    // Step 3: Recompute vertex normals to fix shading and lighting issues
    geometry.computeVertexNormals();

    // Additional cleanup steps:
    // - You can also check for non-manifold edges or perform more advanced cleaning
    //   using external libraries or tools as needed.

    return geometry;
  }

  // A function that returns a promise that resolves after the given milliseconds
  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public generateLayer3TextMeshes(charDepth: number): void | THREE.Mesh[] {
    for (const module of this.modulesList) {
      if (module['type'] === 3) {
        const textModule = module as TextModule;
        //console.log(textModule.data);
        const textMesh = this.generateTextMeshesForIntersect(
          module['data'][3] as unknown as string,
          textModule,
          charDepth,
        );
        return textMesh;
      }
    }
    //console.log(this.modulesList);
    this.tracker.updateModulesList(this.modulesList);
  }

  public generateTextMeshesForIntersect(
    svgPathNode: string,
    moduleInfo: TextModule,
    charDepth: number,
  ): THREE.Mesh[] {
    //const layer3Height =
    //  moduleInfo.editorData.minWallWidth + moduleInfo.editorData.textDepth;
    //const yTranslate = layer3Height / 2 + 5 - moduleInfo.editorData.textDepth;
    const yTranslate = -(charDepth / 2 + 0.1);
    const loader = new SVGLoader();
    const data = loader.parse(svgPathNode);
    //get path for each character
    const paths = data.paths;
    console.log(paths);
    const shapes: THREE.Shape[] = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      const shapesTemp = path.toShapes(true);
      shapes.push(...shapesTemp);
    }
    console.log(moduleInfo);
    const extrudeSettings = {
      steps: 2,
      depth: charDepth,
      bevelEnabled: false,
      bevelThickness: 0,
      bevelSize: 0,
      bevelOffset: 0,
      bevelSegments: 0,
    };
    const geometryArr: THREE.ExtrudeGeometry[] = [];
    shapes.forEach((shape) =>
      geometryArr.push(new THREE.ExtrudeGeometry(shape, extrudeSettings)),
    );
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const meshes: THREE.Mesh[] = [];
    geometryArr.forEach((geometry) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.set(Math.PI / 2, 0, 0);
      mesh.position.y = yTranslate;
      mesh.updateMatrix();
      meshes.push(mesh);
    });
    return meshes;
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
    //get path for each character
    const paths = data.paths;
    //console.log(paths);
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
    //console.log(shapes);
    const myShapes = shapes.map((shape) => {
      return shape.extractPoints(5);
      //const allPoints = [...points.shape, ...points.holes.flat()];
      //return allPoints;
    });

    //console.log(myCoords);

    this.generateVoronoiFromText(myShapes, moduleInfo);
    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.position.y = yTranslate;
    mesh.updateMatrix();
    const meshJSON = mesh.toJSON();
    //console.log(meshJSON);
    return meshJSON;
  }

  /**This would go in a separate module to be run in a web worker, but requires access to the DOM in order to
   * work properly. All the CSG stuff is the expensive stuff anyway, so we build the mesh here then merge it
   * in the web worker
   */

  public generateTextCharShapes(svgPathNode: string): CharShape[] {
    //const layer3Height =
    // moduleInfo.editorData.minWallWidth + moduleInfo.editorData.textDepth;
    //const yTranslate = layer3Height / 2 + 5 - moduleInfo.editorData.textDepth;
    const loader = new SVGLoader();
    const data = loader.parse(svgPathNode);
    //get path for each character
    const paths = data.paths;
    //console.log(paths);
    const shapes: THREE.Shape[] = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const shapesTemp = path.toShapes(true);
      shapes.push(...shapesTemp);
    }

    /**
     * each continuous non whitespace character or continuous component of a character
     * (like i is 2 because of the i dot) in our string has its own array of
     * {x: xval, y: yval} objects
     */
    //console.log(shapes);
    const myShapes = shapes.map((shape) => {
      return shape.extractPoints(5);
      //const allPoints = [...points.shape, ...points.holes.flat()];
      //return allPoints;
    });

    return myShapes;
  }

  public generateTextShapes(svgPathNode: string): THREE.Shape[] {
    //const layer3Height =
    // moduleInfo.editorData.minWallWidth + moduleInfo.editorData.textDepth;
    //const yTranslate = layer3Height / 2 + 5 - moduleInfo.editorData.textDepth;
    const loader = new SVGLoader();
    const data = loader.parse(svgPathNode);
    //get path for each character
    const paths = data.paths;
    //console.log(paths);
    const shapes: THREE.Shape[] = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const shapesTemp = path.toShapes(true);
      shapes.push(...shapesTemp);
    }

    /**
     * each continuous non whitespace character or continuous component of a character
     * (like i is 2 because of the i dot) in our string has its own array of
     * {x: xval, y: yval} objects
     */
    console.log(shapes);

    return shapes;
  }

  public extractFlatCoordinates(shapeData: {
    shape: THREE.Vec2[];
    holes: THREE.Vec2[][];
  }): d3.Delaunay.Point[] {
    const coordArr: d3.Delaunay.Point[] = [];
    for (const coord of [...shapeData.shape, ...shapeData.holes.flat()]) {
      const currentCoord: d3.Delaunay.Point = [coord.x, coord.y];
      coordArr.push(currentCoord);
    }

    return coordArr;
  }

  public generateVoronoiFromText(
    shapes: { shape: THREE.Vec2[]; holes: THREE.Vec2[][] }[],
    moduleInfo: TextModule,
  ) {
    //console.log(this.svgGroup);
    const zoomableGroup = this.svgGroup.select('g');
    for (const shape of shapes) {
      const char = this.extractFlatCoordinates(shape);
      const delaunay = d3.Delaunay.from(char);
      const vBounds = this.getVoronoiBounds(char);
      const voronoi = delaunay.voronoi(vBounds);
      const svgPath = voronoi.render();
      //console.log(svgPath);
      const svgPaths = CommandHandler.splitPath(svgPath, vBounds, shape);
      svgPaths.forEach((path) => {
        //  console.log(path);
        zoomableGroup
          .append('path')
          .attr('d', path)
          .style('stroke', CommandHandler.getRandomColor())
          .style('stroke-width', 0.05);
      });
      /*const voronoiPoints = CommandHandler.simplifyPoints(
        this.parsePathData(svgPaths.join()),
      );
      this.calculate3DText(voronoiPoints, [
        ...CommandHandler.simplifyPoints(shape.shape),
        ...CommandHandler.simplifyPoints(shape.holes.flat()),
      ]);*/
    }
    //console.log(moduleInfo.data);
    zoomableGroup
      .append('path')
      .attr('d', moduleInfo.data[5])
      .style('stroke', 'white')
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

  public parsePathData(pathData: string): PathPosition[] {
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
