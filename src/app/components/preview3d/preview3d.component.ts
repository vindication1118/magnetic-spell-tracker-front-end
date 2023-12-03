import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { CSG } from '../../utils/CSGMesh';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { saveAs } from 'file-saver';
import {MatButtonModule} from '@angular/material/button';
@Component({
  selector: 'app-preview3d',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './preview3d.component.html',
  styleUrl: './preview3d.component.scss'
})

export class Preview3dComponent implements OnInit, AfterViewInit {
  
  @ViewChild('canvas')
  private canvasRef!: ElementRef;

  //* Cube Properties

  @Input() public rotationSpeedX: number = 0.05;

  @Input() public rotationSpeedY: number = 0.01;

  @Input() public size: number = 200;

  @Input() public texture: string = "/assets/texture.jpg";


  //* Stage Properties

  @Input() public cameraZ: number = 400;

  @Input() public fieldOfView: number = 1;

  @Input('nearClipping') public nearClippingPlane: number = 1;

  @Input('farClipping') public farClippingPlane: number = 1000;

  //? Helper Properties (Private Properties);

  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private exporter: STLExporter = new STLExporter();
  private exporterOptions = { binary: true};

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }
  private loader = new THREE.TextureLoader();
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private material = new THREE.MeshBasicMaterial({ map: this.loader.load(this.texture) });

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
    var light1 = new THREE.SpotLight(0xffffff, 100)
light1.position.set(2.5, 5, 5)
light1.angle = Math.PI / 4
light1.penumbra = 0.5
light1.castShadow = true
light1.shadow.mapSize.width = 1024
light1.shadow.mapSize.height = 1024
light1.shadow.camera.near = 0.5
light1.shadow.camera.far = 20
this.scene.add(light1)

var light2 = new THREE.SpotLight(0xffffff, 100)
light2.position.set(-2.5, 5, 5)
light2.angle = Math.PI / 4
light2.penumbra = 0.5
light2.castShadow = true
light2.shadow.mapSize.width = 1024
light2.shadow.mapSize.height = 1024
light2.shadow.camera.near = 0.5
light2.shadow.camera.far = 20
this.scene.add(light2)
    //this.scene.add(this.cube);
        //create a cube and sphere and intersect them
        const cubeMesh = new THREE.Mesh(
          new THREE.BoxGeometry(2, 2, 2),
          new THREE.MeshStandardMaterial({ color: 0xff0000 })
      )
      const sphereMesh = new THREE.Mesh(
          new THREE.SphereGeometry(1.45, 64, 64),
          new THREE.MeshStandardMaterial({ color: 0x0000ff })
      )
      cubeMesh.position.set(-5, 0, -6)
      this.scene.add(cubeMesh)
      sphereMesh.position.set(-2, 0, -6)
      this.scene.add(sphereMesh)
  
      const cubeCSG = CSG.fromMesh(cubeMesh, 0)
      const sphereCSG = CSG.fromMesh(sphereMesh, 1)
  
      const cubeSphereIntersectCSG = cubeCSG.intersect(sphereCSG)
      const cubeSphereIntersectMesh = CSG.toMesh(
          cubeSphereIntersectCSG,
          new THREE.Matrix4(),
          [cubeMesh.material, sphereMesh.material]
      )
      cubeSphereIntersectMesh.position.set(-2.5, 0, -3)
      this.scene.add(cubeSphereIntersectMesh)
    //*Camera
    let aspectRatio = this.getAspectRatio();
    this.camera = new THREE.PerspectiveCamera(
      this.fieldOfView,
      aspectRatio,
      this.nearClippingPlane,
      this.farClippingPlane
    )
    this.camera.position.x = 0.5
this.camera.position.y = 2
this.camera.position.z = 400
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
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)

    let component: Preview3dComponent = this;
    (function render() {
      requestAnimationFrame(render);
      //component.animateCube();
      component.controls.update()
      component.renderer.render(component.scene, component.camera);
    }());
  }

  constructor() { }

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
  public outputSTL(){
    const result = this.exporter.parse(this.scene, this.exporterOptions);
    const blob = new Blob( [result], {type: 'text/plain'});
    saveAs(blob, 'my-test.stl');
  }
}
