import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { CSG } from '../../utils/CSGMesh';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// import Stats from 'three/examples/jsm/libs/stats.module';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { saveAs } from 'file-saver';
import { MatButtonModule } from '@angular/material/button';
import { EditorData } from '../../interfaces/editor-data';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import fontData from 'three/examples/fonts/droid/droid_sans_regular.typeface.json';
import fontDataBold from 'three/examples/fonts/droid/droid_sans_bold.typeface.json';
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

  //* Cube Properties

  @Input() public rotationSpeedX: number = 0.05;

  @Input() public rotationSpeedY: number = 0.01;

  @Input() public size: number = 200;

  @Input() public texture: string = '/assets/texture.jpg';

  //* Stage Properties

  @Input() public cameraZ: number = 8000;

  @Input() public fieldOfView: number = 1;

  @Input() public nearClippingPlane: number = 0.1;

  @Input() public farClippingPlane: number = 20000;

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
      minX: 20,
      minY: 20,
      maxX: 141.8,
      maxY: 141.8,
    },
  };

  //? Helper Properties (Private Properties);

  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private exporter: STLExporter = new STLExporter();
  private exporterOptions = { binary: true };

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }
  private loader = new THREE.TextureLoader();
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private material = new THREE.MeshBasicMaterial();

  private cube: THREE.Mesh = new THREE.Mesh(this.geometry, this.material);

  private renderer!: THREE.WebGLRenderer;

  private scene!: THREE.Scene;

  /**
   *Animate the cube
   *
   * @private
   * @memberof EditorComponent
   */
  private animateCube() {
    this.cube.rotation.x += this.rotationSpeedX;
    this.cube.rotation.y += this.rotationSpeedY;
  }

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

    /*const light1 = new THREE.SpotLight(0xffffff, 100);
    light1.position.set(2.5, 5, 5);
    light1.angle = Math.PI / 4;
    light1.penumbra = 0.5;
    light1.castShadow = true;
    light1.shadow.mapSize.width = 1024;
    light1.shadow.mapSize.height = 1024;
    light1.shadow.camera.near = 0.5;
    light1.shadow.camera.far = 20;
    this.scene.add(light1);

    const light2 = new THREE.SpotLight(0xffffff, 100);
    light2.position.set(-2.5, 5, 5);
    light2.angle = Math.PI / 4;
    light2.penumbra = 0.5;
    light2.castShadow = true;
    light2.shadow.mapSize.width = 1024;
    light2.shadow.mapSize.height = 1024;
    light2.shadow.camera.near = 0.5;
    light2.shadow.camera.far = 20;
    this.scene.add(light2); */
    const light3 = new THREE.AmbientLight(0x404040); // soft white light
    this.scene.add(light3);
    const light4 = new THREE.DirectionalLight(0xffffff, 0.5);
    this.scene.add(light4);
    //this.scene.add(this.cube);
    //create a cube and sphere and intersect them
    this.addBase();
    const cubeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    const sphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 64, 64),
      new THREE.MeshStandardMaterial({ color: 0x0000ff }),
    );
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
    this.scene.add(zMarker);
    cubeMesh.position.set(-5, 0, -6);
    //this.scene.add(cubeMesh);
    sphereMesh.position.set(-2, 0, -6);
    //this.scene.add(sphereMesh);

    const cubeCSG = CSG.fromMesh(cubeMesh, 0);
    const sphereCSG = CSG.fromMesh(sphereMesh, 1);

    const cubeSphereIntersectCSG = cubeCSG.intersect(sphereCSG);
    const cubeSphereIntersectMesh = CSG.toMesh(
      cubeSphereIntersectCSG,
      new THREE.Matrix4(),
      [cubeMesh.material, sphereMesh.material],
    );
    cubeSphereIntersectMesh.position.set(-2.5, 0, -3);
    this.scene.add(cubeSphereIntersectMesh);
    //*Camera
    const aspectRatio = this.getAspectRatio();
    this.camera = new THREE.PerspectiveCamera(
      this.fieldOfView,
      aspectRatio,
      this.nearClippingPlane,
      this.farClippingPlane,
    );
    this.camera.position.x = 0.5;
    this.camera.position.y = 8000;
    this.camera.position.z = 8000;
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
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    //eslint-disable-next-line
    const component: Preview3dComponent = this;
    (function render() {
      requestAnimationFrame(render);
      //component.animateCube();
      component.controls.update();
      component.renderer.render(component.scene, component.camera);
    })();
  }

  constructor() {}

  ngOnInit(): void {
    window.addEventListener('resize', () => this.onWindowResize());
  }

  ngAfterViewInit() {
    this.createScene();
    this.startRenderingLoop();
  }
  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  public outputSTL() {
    const result = this.exporter.parse(this.scene, this.exporterOptions);
    const blob = new Blob([result], { type: 'text/plain' });
    saveAs(blob, 'my-test.stl');
  }

  private addBase() {
    const modulesList = [
      { type: 0, data: [2, 0, 20, 20] },
      { type: 0, data: [3, 0, 40, 20] },
      { type: 0, data: [4, 90, 20, 60] },
      { type: 1, data: [100, 100] },
      { type: 1, data: [100, 20] },
      {
        type: 2,
        data: [
          90,
          60,
          60,
          'this is some text',
          61.60463928222656,
          9.04780632019,
        ],
      },
    ];
    const length =
      this.editorData.boundingBox.maxX - this.editorData.boundingBox.minX + 20;
    //base should consist of bottom layer, holes for magnets, and path for track/dials
    //dial thickness will be magnetHeight + gapWidth + minWall
    //plus 1 for wiggle room
    const height =
      (this.editorData.magnetHeight +
        this.editorData.partGapWidth +
        this.editorData.minWallWidth) *
        2 +
      1;
    const depth =
      this.editorData.boundingBox.maxY - this.editorData.boundingBox.minY + 20;
    const geometry = new THREE.BoxGeometry(length, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(length / 2, -height / 2, depth / 2); //top should be at 0
    this.scene.add(cube);
    for (const module of modulesList) {
      if (module['type'] === 0) {
        const trackCube = this.addTrack(
          Number(module['data'][0]),
          Number(module['data'][1]),
          Number(module['data'][2]),
          Number(module['data'][3]),
        );
        this.scene.add(trackCube);
      } else if (module['type'] === 1) {
        const dialCircle = this.addDialCircle(
          Number(module['data'][0]),
          Number(module['data'][1]),
        );
        this.scene.add(dialCircle);
      } else if (module['type'] === 2) {
        this.addText(
          Number(module['data'][0]),
          Number(module['data'][1]),
          Number(module['data'][2]),
          module['data'][3] + '',
          Number(module['data'][4]),
          Number(module['data'][5]),
        );
      }
    }
  }

  private addTrack(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
  ) {
    const l = length * this.editorData.derivedVals.segmentLength + 2;
    const w = this.editorData.derivedVals.sliderRadius * 2 + 2;
    const h =
      this.editorData.magnetHeight +
      this.editorData.partGapWidth +
      this.editorData.minWallWidth +
      1;
    let tL, tD, newX, newZ;
    if (rotation === 0) {
      //vertical
      tL = w;
      tD = l;
      newX = translateX + w / 2;
      newZ = translateY + l / 2;
    } else {
      tL = l;
      tD = w;
      newX = translateX + l / 2;
      newZ = translateY + w / 2;
    }
    const geometry = new THREE.BoxGeometry(tL, h, tD);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const trackCube = new THREE.Mesh(geometry, material);
    trackCube.position.set(newX, -h / 2 + 1, newZ);
    return trackCube;
  }

  private addDialCircle(translationX: number, translationY: number) {
    const r = this.editorData.derivedVals.plateWidth / 2;
    const h =
      this.editorData.magnetHeight +
      this.editorData.partGapWidth +
      this.editorData.minWallWidth +
      1;
    const newX = translationX + r;
    const newZ = translationY + r;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const dialCircle = new THREE.Mesh(geometry, material);
    dialCircle.position.set(newX, -h / 2 + 1, newZ);
    return dialCircle;
  }

  private addText(
    rotation: number,
    translationX: number,
    translationY: number,
    inputText: string,
    width: number,
    height: number,
  ) {
    const h =
      this.editorData.magnetHeight +
      this.editorData.partGapWidth +
      this.editorData.minWallWidth +
      1;
    const loader = new FontLoader();
    const loadedFont = loader.parse(fontData);
    const geometry = new TextGeometry(inputText, {
      font: loadedFont,
      size: 8,
      height: h,
      curveSegments: 12,
      bevelEnabled: false,
    });
    //const box = new THREE.Box3();
    const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const myText = new THREE.Mesh(geometry, material);
    myText.geometry.computeBoundingBox();
    const bbox = myText.geometry.boundingBox;
    console.log(bbox);
    let xWidth, yWidth, zWidth;
    if (bbox) {
      xWidth = bbox?.max.x - bbox?.min.x;
      yWidth = bbox?.max.y - bbox?.min.y;
      zWidth = bbox?.max.z - bbox?.min.z;
    } else {
      xWidth = 1;
      yWidth = 1;
      zWidth = 1;
    }
    console.log(xWidth + ', ' + yWidth + ', ' + zWidth);
    const boxGeo = new THREE.BoxGeometry(xWidth, yWidth, zWidth);
    const boxmaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    const bboxBox = new THREE.Mesh(boxGeo, boxmaterial);
    this.scene.add(bboxBox);
    const xScale = width / xWidth;
    const yScale = height / yWidth;
    myText.scale.set(xScale, yScale, 1);
    //top of text is in the +y direction to start, readable from +z axis. Baseline left, rear most point is the origin.(matches an svg text or tspan element)
    myText.rotation.x = -(90 * Math.PI) / 180; // make text readable from above
    myText.rotation.z = -(rotation * Math.PI) / 180; //match text rotation from svg
    myText.position.set(translationX, -h / 2 + 1, translationY);
    this.scene.add(myText);
  }

  //reusable params: magnet extrusion heights and y positions per layer
  /*
    {
      all: {
        magExtHeight: magnetHeight + 1
      }
      l1: {
        layerBottomY: 0,
        magExtY: someValue
      },
      l2: {
        layerBottomY: layer1Thickness + 2,
        magExtY: someValue related to magThick plus extra height

      },
      l3: {
        layerBottomY: layer1Thickness + 2 + layer2Thickness + 2,
        textbottomY: layerTop - text thickness?
      }
    }
  */
  private createLayer1(){
    //start with base, add rectangles with attached cylinders, do boolean difference
  }

  private addLayer1Slider(){

  }

  private addLayer1Dial(){

  }

  //No text

  private createLayer2(){
    //create slider pieces and dials, with engraved text and magnet holes underneath

  }

  //cylinder and rectangle for each slider, ezpz
  private addLayer2Slider(){

  }

  private addLayer2Dial(){
    //small tall cylinder, large flat cylinder, boolean difference magnet cylinders, engrave text
  }

  private createLayer3(){
    //create top layer, thick enough for min wall plus text thickness, then add slider tracks and holes for dial knob and number window

  }

  private addLayer3Slider(){
    //window with rounded end caps
  }

  private addLayer3Dial(){
    //hole for dial knob, window for dial numerals

  }

  private addLayer3Text(){
    //boolean difference rectangle, union text
  }

  //private addMagneticCylinder(length, width, translateX, translateY) {}
}
