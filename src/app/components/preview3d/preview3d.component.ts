import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  Input,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
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
//import fontDataBold from 'three/examples/fonts/droid/droid_sans_bold.typeface.json';
@Component({
  selector: 'app-preview3d',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './preview3d.component.html',
  styleUrl: './preview3d.component.scss',
})
export class Preview3dComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas')
  private canvasRef!: ElementRef;
  private frameID: number | null = null;

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
  private exporter: STLExporter = new STLExporter();
  private exporterOptions = { binary: true };
  private tracker!: SpellTracker;
  private lightDirected!: THREE.DirectionalLight;

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }
  private loader = new THREE.TextureLoader();
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private material = new THREE.MeshBasicMaterial();
  private objectLoader = new THREE.ObjectLoader();
  private cube: THREE.Mesh = new THREE.Mesh(this.geometry, this.material);

  private renderer!: THREE.WebGLRenderer;

  private scene!: THREE.Scene;
  private layer1Height!: number;
  private composer!: EffectComposer;

  // SSAO pass
  private ssaoPass!: SSAOPass;

  constructor(private ngZone: NgZone) { }

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
        console.log("Adding new object");
        this.scene.add(this.objectLoader.parse(data));
      };
      worker.postMessage({
        eD: this.editorData,
        mL: this.modulesList,
      });
    } else {
      // Web workers are not supported in this environment.
      console.log("Web workers not allowed!");
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
    this.tracker = new SpellTracker(this.editorData, this.modulesList);
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
    const shapes = [];
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
    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.position.y = yTranslate;
    mesh.updateMatrix();
    const meshJSON = mesh.toJSON();
    return meshJSON;
  }
}
