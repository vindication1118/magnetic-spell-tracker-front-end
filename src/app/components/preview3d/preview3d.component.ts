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
import { TrackerModule } from '../../interfaces/tracker-module';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { CSG } from '../../utils/CSGMesh';
import { StlFilenames } from '../../interfaces/stl-filenames';
import JSZip from 'jszip';
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

  private modulesList: TrackerModule[] = [
    {
      type: 1,
      data: [20, 20],
    },
    {
      type: 1,
      data: [60, 20],
    },
    {
      type: 1,
      data: [100, 20],
    },
    {
      type: 0,
      data: [6, 0, 10, 90],
    },
    {
      type: 0,
      data: [5, 0, 21.1, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 32.2, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 43.300000000000004, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 54.400000000000006, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 65.5, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 76.60000000000001, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 87.70000000000002, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 98.80000000000001, 96.3],
    },
    {
      type: 0,
      data: [5, 0, 109.9, 96.3],
    },
    {
      type: 0,
      data: [3, 0, 121.00000000000001, 108.9],
    },
    {
      type: 3,
      data: [
        0,
        60,
        10,
        '<path d="M60.20800 4.16000L61.65600 4.16000L62.88800 8.69600L62.90400 8.69600L64.18400 4.16000L65.59200 4.16000L63.62400 10L62.18400 10L60.20800 4.16000ZM67.88000 5.04000L66.52800 5.04000L66.52800 4L67.88000 4L67.88000 5.04000ZM67.88000 10L66.52800 10L66.52800 5.84000L67.88000 5.84000L67.88000 10ZM71.85600 10L70.47200 8.24000L70.45600 8.24000L70.45600 10L69.17600 10L69.17600 4L70.45600 4L70.45600 7.41600L70.47200 7.41600L71.81600 5.84000L73.29600 5.84000L71.51200 7.82400L73.33600 10L71.85600 10ZM75.91200 4.48000L75.91200 6L77.27200 6L77.27200 6.90400L75.91200 6.90400L75.91200 8.40000Q75.91200 8.83200 76.01600 8.97600Q76.12000 9.12000 76.39200 9.12000L76.39200 9.12000Q76.73600 9.12000 77.11200 8.99200L77.11200 8.99200L77.25600 9.92000Q76.68800 10.08000 76.08800 10.08000L76.08800 10.08000Q75.32000 10.08000 74.96400 9.73600Q74.60800 9.39200 74.60800 8.61600L74.60800 8.61600L74.60800 6.90400L73.75200 6.90400L73.75200 6L74.60800 6L74.60800 4.48000L75.91200 4.48000ZM78.53600 6.34000Q79.10400 5.76000 80.10400 5.76000Q81.10400 5.76000 81.66800 6.34000Q82.23200 6.92000 82.23200 7.92000Q82.23200 8.92000 81.66800 9.50000Q81.10400 10.08000 80.10400 10.08000Q79.10400 10.08000 78.53600 9.50000Q77.96800 8.92000 77.96800 7.92000Q77.96800 6.92000 78.53600 6.34000ZM80.10400 9.14400L80.10400 9.14400Q80.96800 9.14400 80.96800 7.92000Q80.96800 6.69600 80.10400 6.69600L80.10400 6.69600Q79.23200 6.69600 79.23200 7.92000Q79.23200 9.14400 80.10400 9.14400ZM83.00800 10L83.00800 5.84000L84.22400 5.84000L84.23200 6.64000L84.24800 6.64000Q84.94400 5.76000 86.15200 5.76000L86.15200 5.76000L86.15200 6.78400Q85.25600 6.78400 84.78400 7.16800Q84.31200 7.55200 84.31200 8.21600L84.31200 8.21600L84.31200 10L83.00800 10Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        60,
        30,
        '<path d="M60.60800 24.16000L62.00800 24.16000L62.00800 28.87200L64.47200 28.87200L64.47200 30L60.60800 30L60.60800 24.16000ZM66.96000 25.04000L65.60800 25.04000L65.60800 24L66.96000 24L66.96000 25.04000ZM66.96000 30L65.60800 30L65.60800 25.84000L66.96000 25.84000L66.96000 30ZM69.01600 26.90400L68.05600 26.90400L68.05600 26L69.01600 26L69.01600 25.74400Q69.01600 24.92800 69.44400 24.50400Q69.87200 24.08000 70.67200 24.08000L70.67200 24.08000Q71.18400 24.08000 71.65600 24.20000L71.65600 24.20000L71.47200 25.16000Q71.18400 25.04000 70.88000 25.04000L70.88000 25.04000Q70.56800 25.04000 70.44400 25.19200Q70.32000 25.34400 70.32000 25.74400L70.32000 25.74400L70.32000 26L71.57600 26L71.57600 26.90400L70.32000 26.90400L70.32000 30L69.01600 30L69.01600 26.90400ZM73.33600 27.55200L73.33600 27.55200L74.98400 27.55200Q74.97600 26.63200 74.16800 26.63200L74.16800 26.63200Q73.80000 26.63200 73.58400 26.86800Q73.36800 27.10400 73.33600 27.55200ZM76.14400 28.34400L73.34400 28.34400Q73.40000 28.73600 73.67600 28.95600Q73.95200 29.17600 74.39200 29.17600L74.39200 29.17600Q74.98400 29.17600 75.55200 28.88800L75.55200 28.88800L75.83200 29.76000Q75.12000 30.08000 74.27200 30.08000L74.27200 30.08000Q73.28000 30.08000 72.67600 29.49600Q72.07200 28.91200 72.07200 27.92000L72.07200 27.92000Q72.07200 26.92000 72.63200 26.34000Q73.19200 25.76000 74.13600 25.76000L74.13600 25.76000Q75.10400 25.76000 75.64000 26.31600Q76.17600 26.87200 76.17600 27.90400L76.17600 27.90400Q76.17600 28.15200 76.14400 28.34400L76.14400 28.34400ZM79.36000 24.16000L84.00000 24.16000L84.00000 25.28800L82.37600 25.28800L82.37600 30L80.98400 30L80.98400 25.28800L79.36000 25.28800L79.36000 24.16000ZM84.50400 26.34000Q85.07200 25.76000 86.07200 25.76000Q87.07200 25.76000 87.63600 26.34000Q88.20000 26.92000 88.20000 27.92000Q88.20000 28.92000 87.63600 29.50000Q87.07200 30.08000 86.07200 30.08000Q85.07200 30.08000 84.50400 29.50000Q83.93600 28.92000 83.93600 27.92000Q83.93600 26.92000 84.50400 26.34000ZM86.07200 29.14400L86.07200 29.14400Q86.93600 29.14400 86.93600 27.92000Q86.93600 26.69600 86.07200 26.69600L86.07200 26.69600Q85.20000 26.69600 85.20000 27.92000Q85.20000 29.14400 86.07200 29.14400ZM90.85600 24.48000L90.85600 26L92.21600 26L92.21600 26.90400L90.85600 26.90400L90.85600 28.40000Q90.85600 28.83200 90.96000 28.97600Q91.06400 29.12000 91.33600 29.12000L91.33600 29.12000Q91.68000 29.12000 92.05600 28.99200L92.05600 28.99200L92.20000 29.92000Q91.63200 30.08000 91.03200 30.08000L91.03200 30.08000Q90.26400 30.08000 89.90800 29.73600Q89.55200 29.39200 89.55200 28.61600L89.55200 28.61600L89.55200 26.90400L88.69600 26.90400L88.69600 26L89.55200 26L89.55200 24.48000L90.85600 24.48000ZM94.99200 25.76000L94.99200 25.76000Q95.99200 25.76000 96.42000 26.14000Q96.84800 26.52000 96.84800 27.38400L96.84800 27.38400L96.84800 28.88000Q96.84800 29.45600 96.96800 30L96.96800 30L95.75200 30Q95.68800 29.64000 95.67200 29.41600L95.67200 29.41600L95.65600 29.41600Q95.44000 29.72000 95.07600 29.90000Q94.71200 30.08000 94.31200 30.08000L94.31200 30.08000Q93.71200 30.08000 93.35200 29.74400Q92.99200 29.40800 92.99200 28.82400L92.99200 28.82400Q92.99200 28.13600 93.58000 27.72000Q94.16800 27.30400 95.27200 27.30400L95.27200 27.30400L95.56800 27.30400L95.56800 27.28800Q95.56800 26.93600 95.42800 26.80000Q95.28800 26.66400 94.93600 26.66400L94.93600 26.66400Q94.12000 26.66400 93.37600 27.02400L93.37600 27.02400L93.20800 26.12000Q94.01600 25.76000 94.99200 25.76000ZM94.16000 28.70400L94.16000 28.70400Q94.16000 28.92000 94.29200 29.04000Q94.42400 29.16000 94.64800 29.16000L94.64800 29.16000Q95.04800 29.16000 95.30800 28.91200Q95.56800 28.66400 95.56800 28.28000L95.56800 28.28000L95.56800 28.08800L95.27200 28.08800Q94.72800 28.08800 94.44400 28.25600Q94.16000 28.42400 94.16000 28.70400ZM99.49600 30L98.14400 30L98.14400 24L99.49600 24L99.49600 30Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        10,
        88,
        '<path d="M13.44800 83.17600L13.44800 83.17600Q12.60800 83.17600 12.12400 83.68000Q11.64000 84.18400 11.64000 85.08000L11.64000 85.08000Q11.64000 85.96000 12.14400 86.47200Q12.64800 86.98400 13.44800 86.98400L13.44800 86.98400Q14.14400 86.98400 14.82400 86.54400L14.82400 86.54400L15.20800 87.53600Q14.40800 88.08000 13.31200 88.08000L13.31200 88.08000Q11.92000 88.08000 11.08400 87.27200Q10.24800 86.46400 10.24800 85.08000L10.24800 85.08000Q10.24800 83.68000 11.06000 82.88000Q11.87200 82.08000 13.31200 82.08000L13.31200 82.08000Q14.40800 82.08000 15.20800 82.62400L15.20800 82.62400L14.82400 83.61600Q14.14400 83.17600 13.44800 83.17600Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        21.1,
        88,
        '<path d="M24.76400 88L23.35600 88L23.35600 83.73600L23.34000 83.73600L22.04400 84.93600L21.62000 83.78400L23.35600 82.16000L24.76400 82.16000L24.76400 88Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        32.2,
        88,
        '<path d="M32.82400 88L32.82400 86.90400Q34.40000 85.69600 34.90000 85.10000Q35.40000 84.50400 35.40000 83.94400L35.40000 83.94400Q35.40000 83.20800 34.58400 83.20800L34.58400 83.20800Q33.92800 83.20800 33.03200 83.78400L33.03200 83.78400L32.68800 82.69600Q33.09600 82.42400 33.67600 82.25200Q34.25600 82.08000 34.78400 82.08000L34.78400 82.08000Q35.75200 82.08000 36.27200 82.54000Q36.79200 83 36.79200 83.81600L36.79200 83.81600Q36.79200 84.52000 36.34800 85.16400Q35.90400 85.80800 34.60800 86.88800L34.60800 86.88800L34.60800 86.90400L36.82400 86.90400L36.82400 88L32.82400 88Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        43.300000000000004,
        88,
        '<path d="M43.90000 83.25600L43.90000 82.16000L47.79600 82.16000L47.79600 83.25600L46.23600 84.54400L46.23600 84.56000L46.34000 84.56000Q47.03600 84.56000 47.45600 84.99200Q47.87600 85.42400 47.87600 86.16000L47.87600 86.16000Q47.87600 87.08800 47.30800 87.58400Q46.74000 88.08000 45.67600 88.08000L45.67600 88.08000Q44.66000 88.08000 43.82000 87.62400L43.82000 87.62400L44.15600 86.58400Q44.96400 87 45.56400 87L45.56400 87Q46.02800 87 46.28400 86.78400Q46.54000 86.56800 46.54000 86.18400L46.54000 86.18400Q46.54000 85.79200 46.23200 85.62800Q45.92400 85.46400 45.08400 85.46400L45.08400 85.46400L44.68400 85.46400L44.68400 84.55200L46.16400 83.27200L46.16400 83.25600L43.90000 83.25600Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        54.400000000000006,
        88,
        '<path d="M55.68800 85.81600L57.08800 85.81600L57.08800 83.80800L57.07200 83.80800L55.68800 85.80000L55.68800 85.81600ZM58.39200 82.16000L58.39200 85.81600L59.23200 85.81600L59.23200 86.88000L58.39200 86.88000L58.39200 88L57.08800 88L57.08800 86.88000L54.48800 86.88000L54.48800 85.81600L57.08800 82.16000L58.39200 82.16000Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        65.5,
        88,
        '<path d="M69.90800 82.16000L69.90800 83.25600L67.58000 83.25600L67.52400 84.34400L67.54000 84.34400Q67.90800 84.18400 68.30800 84.18400L68.30800 84.18400Q69.20400 84.18400 69.69200 84.66400Q70.18000 85.14400 70.18000 86.01600L70.18000 86.01600Q70.18000 88.08000 67.72400 88.08000L67.72400 88.08000Q66.82800 88.08000 66.04400 87.74400L66.04400 87.74400L66.32400 86.66400Q67.11600 87 67.66800 87L67.66800 87Q68.84400 87 68.84400 86.01600L68.84400 86.01600Q68.84400 85.21600 68.04400 85.21600L68.04400 85.21600Q67.69200 85.21600 67.34800 85.52000L67.34800 85.52000L66.18800 85.52000L66.34800 82.16000L69.90800 82.16000Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        76.60000000000001,
        88,
        '<path d="M80.27200 82.08000L80.27200 82.08000L80.51200 83.17600Q79.67200 83.20000 79.16800 83.49200Q78.66400 83.78400 78.40800 84.36800L78.40800 84.36800L78.41600 84.37600Q78.92800 84.06400 79.54400 84.06400L79.54400 84.06400Q80.47200 84.06400 80.96800 84.55600Q81.46400 85.04800 81.46400 86L81.46400 86Q81.46400 86.94400 80.84400 87.51200Q80.22400 88.08000 79.21600 88.08000L79.21600 88.08000Q78.16800 88.08000 77.56400 87.48000Q76.96000 86.88000 76.96000 85.74400L76.96000 85.74400Q76.96000 84.07200 77.84800 83.09200Q78.73600 82.11200 80.27200 82.08000ZM79.21600 87.09600L79.21600 87.09600Q79.66400 87.09600 79.91200 86.81600Q80.16000 86.53600 80.16000 86L80.16000 86Q80.16000 85.52000 79.91200 85.25200Q79.66400 84.98400 79.21600 84.98400L79.21600 84.98400Q78.78400 84.98400 78.52800 85.25600Q78.27200 85.52800 78.27200 86L78.27200 86Q78.27200 86.52800 78.52400 86.81200Q78.77600 87.09600 79.21600 87.09600Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        109.9,
        88,
        '<path d="M111.34000 88.08000L111.10000 86.98400Q111.98800 86.95200 112.50800 86.66800Q113.02800 86.38400 113.28400 85.79200L113.28400 85.79200L113.27600 85.78400Q112.76400 86.09600 112.14800 86.09600L112.14800 86.09600Q111.22000 86.09600 110.72400 85.59600Q110.22800 85.09600 110.22800 84.12000L110.22800 84.12000Q110.22800 83.21600 110.85200 82.64800Q111.47600 82.08000 112.48400 82.08000L112.48400 82.08000Q113.54000 82.08000 114.13600 82.68000Q114.73200 83.28000 114.73200 84.37600L114.73200 84.37600Q114.73200 86.09600 113.82000 87.07200Q112.90800 88.04800 111.34000 88.08000L111.34000 88.08000ZM112.48400 83.06400L112.48400 83.06400Q112.03600 83.06400 111.78400 83.34000Q111.53200 83.61600 111.53200 84.12000Q111.53200 84.62400 111.78800 84.90000Q112.04400 85.17600 112.48400 85.17600L112.48400 85.17600Q112.91600 85.17600 113.16800 84.90000Q113.42000 84.62400 113.42000 84.12000Q113.42000 83.61600 113.17200 83.34000Q112.92400 83.06400 112.48400 83.06400Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        87.70000000000002,
        88,
        '<path d="M88.26000 83.25600L88.26000 82.16000L92.36400 82.16000L92.36400 83.25600Q91.69200 84.37600 91.20400 85.46400Q90.71600 86.55200 90.23600 88L90.23600 88L88.78000 88Q89.73200 85.40800 91.07600 83.28800L91.07600 83.28800L91.07600 83.25600L88.26000 83.25600Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        98.80000000000001,
        88,
        '<path d="M99.82400 82.50000Q100.39200 82.08000 101.40000 82.08000Q102.40800 82.08000 102.97600 82.50000Q103.54400 82.92000 103.54400 83.57600L103.54400 83.57600Q103.54400 84.33600 102.55200 84.84000L102.55200 84.84000L102.55200 84.85600Q103.72000 85.33600 103.72000 86.40000L103.72000 86.40000Q103.72000 87.16800 103.10800 87.62400Q102.49600 88.08000 101.40000 88.08000Q100.30400 88.08000 99.69200 87.62400Q99.08000 87.16800 99.08000 86.40000L99.08000 86.40000Q99.08000 85.52000 100.19200 85.00800L100.19200 85.00800L100.19200 84.99200Q99.25600 84.47200 99.25600 83.57600L99.25600 83.57600Q99.25600 82.92000 99.82400 82.50000ZM101.45600 84.49600L101.45600 84.49600Q101.89600 84.33600 102.08000 84.14400Q102.26400 83.95200 102.26400 83.70400L102.26400 83.70400Q102.26400 83.40800 102.03200 83.22000Q101.80000 83.03200 101.40000 83.03200L101.40000 83.03200Q101.00800 83.03200 100.78000 83.22000Q100.55200 83.40800 100.55200 83.70400L100.55200 83.70400Q100.55200 83.96000 100.75600 84.15200Q100.96000 84.34400 101.45600 84.49600ZM101.26400 85.42400L101.26400 85.42400Q100.78400 85.61600 100.59200 85.83200Q100.40000 86.04800 100.40000 86.33600L100.40000 86.33600Q100.40000 86.68000 100.68000 86.90400Q100.96000 87.12800 101.40000 87.12800Q101.84000 87.12800 102.11600 86.90400Q102.39200 86.68000 102.39200 86.33600L102.39200 86.33600Q102.39200 86.01600 102.16800 85.82400Q101.94400 85.63200 101.26400 85.42400Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        121.00000000000001,
        88,
        '<path d="M124.66400 88L123.25600 88L123.25600 83.73600L123.24000 83.73600L121.94400 84.93600L121.52000 83.78400L123.25600 82.16000L124.66400 82.16000L124.66400 88ZM127.05200 82.78400Q127.62400 82.08000 128.80000 82.08000Q129.97600 82.08000 130.54800 82.78400Q131.12000 83.48800 131.12000 85.08000Q131.12000 86.67200 130.54800 87.37600Q129.97600 88.08000 128.80000 88.08000Q127.62400 88.08000 127.05200 87.37600Q126.48000 86.67200 126.48000 85.08000Q126.48000 83.48800 127.05200 82.78400ZM128.09200 86.60800Q128.32000 87.04800 128.80000 87.04800Q129.28000 87.04800 129.50800 86.60800Q129.73600 86.16800 129.73600 85.08000Q129.73600 83.99200 129.50800 83.55200Q129.28000 83.11200 128.80000 83.11200Q128.32000 83.11200 128.09200 83.55200Q127.86400 83.99200 127.86400 85.08000Q127.86400 86.16800 128.09200 86.60800Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        5,
        95.5300000190735,
        '<path d="M7.20400 92.61000L7.20400 93.15800L6.04000 93.15800L6.01200 93.70200L6.02000 93.70200Q6.20400 93.62200 6.40400 93.62200L6.40400 93.62200Q6.85200 93.62200 7.09600 93.86200Q7.34000 94.10200 7.34000 94.53800L7.34000 94.53800Q7.34000 95.57000 6.11200 95.57000L6.11200 95.57000Q5.66400 95.57000 5.27200 95.40200L5.27200 95.40200L5.41200 94.86200Q5.80800 95.03000 6.08400 95.03000L6.08400 95.03000Q6.67200 95.03000 6.67200 94.53800L6.67200 94.53800Q6.67200 94.13800 6.27200 94.13800L6.27200 94.13800Q6.09600 94.13800 5.92400 94.29000L5.92400 94.29000L5.34400 94.29000L5.42400 92.61000L7.20400 92.61000Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        40,
        78,
        '<path d="M44.51200 72.46400L44.26400 73.52000Q43.50400 73.14400 42.66400 73.14400L42.66400 73.14400Q42.24800 73.14400 42.03200 73.30400Q41.81600 73.46400 41.81600 73.73600L41.81600 73.73600Q41.81600 74.18400 42.48800 74.37600L42.48800 74.37600Q43.68000 74.70400 44.16400 75.16000Q44.64800 75.61600 44.64800 76.33600L44.64800 76.33600Q44.64800 77.18400 44.07200 77.63200Q43.49600 78.08000 42.36800 78.08000L42.36800 78.08000Q41.86400 78.08000 41.32000 77.92400Q40.77600 77.76800 40.40800 77.52000L40.40800 77.52000L40.72800 76.45600Q41.54400 77.01600 42.42400 77.01600L42.42400 77.01600Q42.84000 77.01600 43.05200 76.84400Q43.26400 76.67200 43.26400 76.36000L43.26400 76.36000Q43.26400 76.10400 43.09200 75.94400Q42.92000 75.78400 42.48800 75.65600L42.48800 75.65600Q41.39200 75.33600 40.91200 74.87600Q40.43200 74.41600 40.43200 73.73600L40.43200 73.73600Q40.43200 72.97600 41.00400 72.52800Q41.57600 72.08000 42.60800 72.08000L42.60800 72.08000Q43.70400 72.08000 44.51200 72.46400L44.51200 72.46400ZM48.41600 75.92000L48.41600 75.92000Q48.41600 75.33600 48.20000 75.04000Q47.98400 74.74400 47.60000 74.74400L47.60000 74.74400Q47.23200 74.74400 47.00800 75.04400Q46.78400 75.34400 46.78400 75.88000L46.78400 75.88000L46.78400 75.96000Q46.78400 76.50400 47.00800 76.80000Q47.23200 77.09600 47.60000 77.09600L47.60000 77.09600Q47.96000 77.09600 48.18800 76.78800Q48.41600 76.48000 48.41600 75.92000ZM49.64000 75.92000L49.64000 75.92000Q49.64000 76.93600 49.17600 77.50800Q48.71200 78.08000 47.98400 78.08000Q47.25600 78.08000 46.80000 77.50400L46.80000 77.50400L46.78400 77.50400L46.78400 79.76000L45.50400 79.76000L45.50400 73.84000L46.68800 73.84000L46.72000 74.41600L46.73600 74.41600Q47.24000 73.76000 47.98400 73.76000L47.98400 73.76000Q48.74400 73.76000 49.19200 74.32000Q49.64000 74.88000 49.64000 75.92000ZM51.52000 75.55200L51.52000 75.55200L53.16800 75.55200Q53.16000 74.63200 52.35200 74.63200L52.35200 74.63200Q51.98400 74.63200 51.76800 74.86800Q51.55200 75.10400 51.52000 75.55200ZM54.32800 76.34400L51.52800 76.34400Q51.58400 76.73600 51.86000 76.95600Q52.13600 77.17600 52.57600 77.17600L52.57600 77.17600Q53.16800 77.17600 53.73600 76.88800L53.73600 76.88800L54.01600 77.76000Q53.30400 78.08000 52.45600 78.08000L52.45600 78.08000Q51.46400 78.08000 50.86000 77.49600Q50.25600 76.91200 50.25600 75.92000L50.25600 75.92000Q50.25600 74.92000 50.81600 74.34000Q51.37600 73.76000 52.32000 73.76000L52.32000 73.76000Q53.28800 73.76000 53.82400 74.31600Q54.36000 74.87200 54.36000 75.90400L54.36000 75.90400Q54.36000 76.15200 54.32800 76.34400L54.32800 76.34400ZM56.72800 78L55.37600 78L55.37600 72L56.72800 72L56.72800 78ZM59.37600 78L58.02400 78L58.02400 72L59.37600 72L59.37600 78ZM67.10400 72.46400L66.85600 73.52000Q66.09600 73.14400 65.25600 73.14400L65.25600 73.14400Q64.84000 73.14400 64.62400 73.30400Q64.40800 73.46400 64.40800 73.73600L64.40800 73.73600Q64.40800 74.18400 65.08000 74.37600L65.08000 74.37600Q66.27200 74.70400 66.75600 75.16000Q67.24000 75.61600 67.24000 76.33600L67.24000 76.33600Q67.24000 77.18400 66.66400 77.63200Q66.08800 78.08000 64.96000 78.08000L64.96000 78.08000Q64.45600 78.08000 63.91200 77.92400Q63.36800 77.76800 63 77.52000L63 77.52000L63.32000 76.45600Q64.13600 77.01600 65.01600 77.01600L65.01600 77.01600Q65.43200 77.01600 65.64400 76.84400Q65.85600 76.67200 65.85600 76.36000L65.85600 76.36000Q65.85600 76.10400 65.68400 75.94400Q65.51200 75.78400 65.08000 75.65600L65.08000 75.65600Q63.98400 75.33600 63.50400 74.87600Q63.02400 74.41600 63.02400 73.73600L63.02400 73.73600Q63.02400 72.97600 63.59600 72.52800Q64.16800 72.08000 65.20000 72.08000L65.20000 72.08000Q66.29600 72.08000 67.10400 72.46400L67.10400 72.46400ZM69.72800 78L68.37600 78L68.37600 72L69.72800 72L69.72800 78ZM71.27200 74.34000Q71.84000 73.76000 72.84000 73.76000Q73.84000 73.76000 74.40400 74.34000Q74.96800 74.92000 74.96800 75.92000Q74.96800 76.92000 74.40400 77.50000Q73.84000 78.08000 72.84000 78.08000Q71.84000 78.08000 71.27200 77.50000Q70.70400 76.92000 70.70400 75.92000Q70.70400 74.92000 71.27200 74.34000ZM72.84000 77.14400L72.84000 77.14400Q73.70400 77.14400 73.70400 75.92000Q73.70400 74.69600 72.84000 74.69600L72.84000 74.69600Q71.96800 74.69600 71.96800 75.92000Q71.96800 77.14400 72.84000 77.14400ZM77.62400 72.48000L77.62400 74L78.98400 74L78.98400 74.90400L77.62400 74.90400L77.62400 76.40000Q77.62400 76.83200 77.72800 76.97600Q77.83200 77.12000 78.10400 77.12000L78.10400 77.12000Q78.44800 77.12000 78.82400 76.99200L78.82400 76.99200L78.96800 77.92000Q78.40000 78.08000 77.80000 78.08000L77.80000 78.08000Q77.03200 78.08000 76.67600 77.73600Q76.32000 77.39200 76.32000 76.61600L76.32000 76.61600L76.32000 74.90400L75.46400 74.90400L75.46400 74L76.32000 74L76.32000 72.48000L77.62400 72.48000ZM83.32000 74.05600L83.08000 74.96800Q82.40000 74.68800 81.74400 74.68800L81.74400 74.68800Q81.37600 74.68800 81.22800 74.77200Q81.08000 74.85600 81.08000 75.02400L81.08000 75.02400Q81.08000 75.18400 81.21200 75.27600Q81.34400 75.36800 81.68000 75.41600L81.68000 75.41600Q82.61600 75.53600 83.02000 75.87200Q83.42400 76.20800 83.42400 76.80000Q83.42400 77.39200 82.96400 77.73600Q82.50400 78.08000 81.64000 78.08000L81.64000 78.08000Q80.62400 78.08000 79.80000 77.68000L79.80000 77.68000L80.04000 76.75200Q80.72800 77.14400 81.53600 77.14400L81.53600 77.14400Q82.14400 77.14400 82.14400 76.77600L82.14400 76.77600Q82.14400 76.61600 82.02800 76.53600Q81.91200 76.45600 81.54400 76.40000L81.54400 76.40000Q80.62400 76.25600 80.22400 75.91600Q79.82400 75.57600 79.82400 75L79.82400 75Q79.82400 74.43200 80.28400 74.09600Q80.74400 73.76000 81.64000 73.76000L81.64000 73.76000Q82.51200 73.76000 83.32000 74.05600L83.32000 74.05600Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        5,
        127.05000000000001,
        '<path d="M5.42600 124.44200Q5.71200 124.09000 6.30000 124.09000Q6.88800 124.09000 7.17400 124.44200Q7.46000 124.79400 7.46000 125.59000Q7.46000 126.38600 7.17400 126.73800Q6.88800 127.09000 6.30000 127.09000Q5.71200 127.09000 5.42600 126.73800Q5.14000 126.38600 5.14000 125.59000Q5.14000 124.79400 5.42600 124.44200ZM5.94600 126.35400Q6.06000 126.57400 6.30000 126.57400Q6.54000 126.57400 6.65400 126.35400Q6.76800 126.13400 6.76800 125.59000Q6.76800 125.04600 6.65400 124.82600Q6.54000 124.60600 6.30000 124.60600Q6.06000 124.60600 5.94600 124.82600Q5.83200 125.04600 5.83200 125.59000Q5.83200 126.13400 5.94600 126.35400Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        5,
        108.13000001907349,
        '<path d="M5.30000 105.75800L5.30000 105.21000L7.24800 105.21000L7.24800 105.75800L6.46800 106.40200L6.46800 106.41000L6.52000 106.41000Q6.86800 106.41000 7.07800 106.62600Q7.28800 106.84200 7.28800 107.21000L7.28800 107.21000Q7.28800 107.67400 7.00400 107.92200Q6.72000 108.17000 6.18800 108.17000L6.18800 108.17000Q5.68000 108.17000 5.26000 107.94200L5.26000 107.94200L5.42800 107.42200Q5.83200 107.63000 6.13200 107.63000L6.13200 107.63000Q6.36400 107.63000 6.49200 107.52200Q6.62000 107.41400 6.62000 107.22200L6.62000 107.22200Q6.62000 107.02600 6.46600 106.94400Q6.31200 106.86200 5.89200 106.86200L5.89200 106.86200L5.69200 106.86200L5.69200 106.40600L6.43200 105.76600L6.43200 105.75800L5.30000 105.75800Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        5,
        101.81000003814698,
        '<path d="M5.64400 100.71800L6.34400 100.71800L6.34400 99.71400L6.33600 99.71400L5.64400 100.71000L5.64400 100.71800ZM6.99600 98.89000L6.99600 100.71800L7.41600 100.71800L7.41600 101.25000L6.99600 101.25000L6.99600 101.81000L6.34400 101.81000L6.34400 101.25000L5.04400 101.25000L5.04400 100.71800L6.34400 98.89000L6.99600 98.89000Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        5,
        114.4300000190735,
        '<path d="M5.31200 114.43000L5.31200 113.88200Q6.10000 113.27800 6.35000 112.98000Q6.60000 112.68200 6.60000 112.40200L6.60000 112.40200Q6.60000 112.03400 6.19200 112.03400L6.19200 112.03400Q5.86400 112.03400 5.41600 112.32200L5.41600 112.32200L5.24400 111.77800Q5.44800 111.64200 5.73800 111.55600Q6.02800 111.47000 6.29200 111.47000L6.29200 111.47000Q6.77600 111.47000 7.03600 111.70000Q7.29600 111.93000 7.29600 112.33800L7.29600 112.33800Q7.29600 112.69000 7.07400 113.01200Q6.85200 113.33400 6.20400 113.87400L6.20400 113.87400L6.20400 113.88200L7.31200 113.88200L7.31200 114.43000L5.31200 114.43000Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
    {
      type: 3,
      data: [
        0,
        5,
        120.71000003814699,
        '<path d="M6.83200 120.71000L6.12800 120.71000L6.12800 118.57800L6.12000 118.57800L5.47200 119.17800L5.26000 118.60200L6.12800 117.79000L6.83200 117.79000L6.83200 120.71000Z" style="stroke: rgb(186, 219, 237); stroke-width: 0.25px; fill: rgb(186, 219, 237);"></path>',
      ],
    },
  ];
  constructor(private ngZone: NgZone) {}

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
    const lightAmbient = new THREE.AmbientLight(0x222222); // soft white light
    this.scene.add(lightAmbient);
    this.lightDirected = new THREE.DirectionalLight(0xffffff, 1.0);
    this.scene.add(this.lightDirected);
    const targetObj = new THREE.Object3D();
    const bbox = this.editorData.boundingBox;
    targetObj.position.set(
      (1 * (bbox.maxX - bbox.minX)) / 2,
      0,
      (1 * (bbox.maxY - bbox.minY)) / 2,
    );
    this.scene.add(targetObj);
    this.lightDirected.target = targetObj;
    this.lightDirected.position.set(0, -1000, 0);
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
    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(new URL('./3d.worker', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }) => {
        this.scene.add(this.objectLoader.parse(data));
      };
      worker.postMessage({
        eD: this.editorData,
        mL: this.modulesList,
      });
    } else {
      // Web workers are not supported in this environment.
      this.tracker.addBaseLayer1().then((layer1) => {
        this.scene.add(layer1);
      });
      this.tracker.createLayer2().then((layer2) => {
        for (const mesh of layer2) {
          this.scene.add(mesh);
        }
      });
    }
    this.createLayer3().then((layer3) => {
      this.scene.add(layer3);
    });
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
    this.ngZone.runOutsideAngular(() => {
      (function render() {
        component.frameID = requestAnimationFrame(render);
        //component.animateCube();
        component.controls.update();
        component.updateLighting(component.lightDirected, component.camera);
        component.renderer.render(component.scene, component.camera);
      })();
    });
  }

  ngOnInit(): void {
    window.addEventListener('resize', () => this.onWindowResize());
    this.tracker = new SpellTracker(this.editorData, this.modulesList);
  }

  ngAfterViewInit() {
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
  public oldoutputSTL() {
    const result = this.exporter.parse(this.scene, this.exporterOptions);
    const blob = new Blob([result], { type: 'text/plain' });
    saveAs(blob, 'my-test.stl');
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
    this.scene.children.forEach((child: THREE.Object3D, index: number) => {
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

  public createLayer3(): Promise<THREE.Mesh> {
    return new Promise((resolve) => {
      //create top layer, thick enough for min wall plus text thickness, then add slider tracks and holes for dial knob and number window
      const length =
        this.editorData.boundingBox.maxX +
        20 -
        this.editorData.boundingBox.minX +
        20;
      //base should consist of bottom layer, holes for magnets, and path for track/dials
      //dial thickness will be magnetHeight + (gapWidth + minWall) * 2 for slider base track
      //but also add textDepth
      //plus 1 for wiggle room
      const height = this.editorData.minWallWidth + this.editorData.textDepth;
      //this.layer1Height = height;
      const depth =
        this.editorData.boundingBox.maxY +
        20 -
        this.editorData.boundingBox.minY +
        20;
      const geometry = new THREE.BoxGeometry(length, height, depth);
      const material = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
      });
      //material.setValues({ opacity: 0.5, transparent: true });
      const layer3Base = new THREE.Mesh(geometry, material);
      layer3Base.position.set(length / 2, -height / 2 + 5, depth / 2); //top should be at 0
      layer3Base.updateMatrix();
      //this.scene.add(layer3Base);
      let layer3CSG = CSG.fromMesh(layer3Base);
      for (const module of this.modulesList) {
        if (module['type'] === 0) {
          const slider = this.addSliderLayer3(
            Number(module['data'][0]),
            Number(module['data'][1]),
            Number(module['data'][2]),
            Number(module['data'][3]),
          );
          layer3CSG = layer3CSG.subtract(slider);
        } else if (module['type'] === 1) {
          const dialWindow = this.addDialWindowLayer3(
            Number(module['data'][0]),
            -height / 2 + 5 + 1,
            Number(module['data'][1]),
          );
          layer3CSG = layer3CSG.subtract(dialWindow);
          const knobHole = this.addDialKnobLayer3(
            Number(module['data'][0]),
            -height / 2 + 5 + 1,
            Number(module['data'][1]),
          );
          layer3CSG = layer3CSG.subtract(knobHole);
          //this.scene.add(dialCircle);
        } else if (module['type'] === 2) {
          continue;
        } else if (module['type'] === 3) {
          const csgObj = this.addTextLayer3(
            module['data'][3] as unknown as string,
          );
          layer3CSG = layer3CSG.union(csgObj);
        }
      }
      const layer3 = CSG.toMesh(layer3CSG, layer3Base.matrix, material);
      layer3.name = 'layer3';
      //this.scene.add(layer3);
      resolve(layer3);
    });
  }

  /**Need to maintain a new slider Length and width but translate based on Layer 1's numbers */
  public addSliderLayer3(
    length: number,
    rotation: number,
    translateX: number,
    translateY: number,
  ) {
    const l = length * this.editorData.derivedVals.segmentLength + 2; //extra 1 on each end
    const w =
      this.editorData.derivedVals.sliderRadius * 2 +
      2 +
      2 * this.editorData.partGapWidth; //extra 1 on each end
    //window with rounded end caps - union cube and cylinders at either end
    const rectLength = this.editorData.derivedVals.segmentLength * (length - 1);
    const r =
      this.editorData.derivedVals.knobWidth / 2 + this.editorData.partGapWidth;
    const height = this.editorData.minWallWidth + this.editorData.textDepth + 2;
    const endGeometry = new THREE.CylinderGeometry(r, r, height, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xfffff0 });
    const tY = -height / 2 + 5 + 1;
    let newX, newZ, mCSG;
    if (rotation === 0) {
      //vertical
      newX = translateX + w / 2;
      newZ = translateY + l / 2;
      //newX = translateX + r + 1 + this.editorData.partGapWidth;
      //newZ = translateY + rectLength / 2 + 1 + this.editorData.partGapWidth;
      const firstCylZ = newZ - rectLength / 2;
      const midGeometry = new THREE.BoxGeometry(2 * r, height, rectLength);
      const midMesh = new THREE.Mesh(midGeometry, material);
      midMesh.position.set(newX, tY, newZ);
      midMesh.updateMatrix();
      const topMesh = new THREE.Mesh(endGeometry, material);
      topMesh.position.set(newX, tY, firstCylZ);
      topMesh.updateMatrix();
      const bottomMesh = new THREE.Mesh(endGeometry, material);
      bottomMesh.position.set(newX, tY, firstCylZ + rectLength);
      bottomMesh.updateMatrix();
      mCSG = CSG.fromMesh(midMesh);
      const tCSG = CSG.fromMesh(topMesh);
      const bCSG = CSG.fromMesh(bottomMesh);
      mCSG = mCSG.union(tCSG);
      mCSG = mCSG.union(bCSG);
      //sliderLayer3 = CSG.toMesh(mCSG, midMesh.matrix, material);
    } else {
      newX = translateX + l / 2;
      newZ = translateY + w / 2;
      const firstCylX = newX - rectLength / 2;
      const midGeometry = new THREE.BoxGeometry(rectLength, height, 2 * r);
      const midMesh = new THREE.Mesh(midGeometry, material);
      midMesh.position.set(newX, tY, newZ);
      midMesh.updateMatrix();
      const leftMesh = new THREE.Mesh(endGeometry, material);
      leftMesh.position.set(firstCylX, tY, newZ);
      leftMesh.updateMatrix();
      const rightMesh = new THREE.Mesh(endGeometry, material);
      rightMesh.position.set(firstCylX + rectLength, tY, newZ);
      rightMesh.updateMatrix();
      mCSG = CSG.fromMesh(midMesh);
      const rCSG = CSG.fromMesh(rightMesh);
      const lCSG = CSG.fromMesh(leftMesh);
      mCSG = mCSG.union(rCSG);
      mCSG = mCSG.union(lCSG);
      //sliderLayer3 = CSG.toMesh(mCSG, midMesh.matrix, material);
    }
    return mCSG;
  }

  public addDialWindowLayer3(tX: number, tY: number, tZ: number) {
    const l = this.editorData.derivedVals.knobWidth + 3,
      w = this.editorData.derivedVals.knobWidth + 1,
      h = this.editorData.minWallWidth + this.editorData.textDepth + 2;
    //hole for dial knob, window for dial numerals
    const newR = this.editorData.derivedVals.knobWidth + l / 2;

    const theta = Math.PI / 2;
    const newXVal =
      tX + this.editorData.derivedVals.plateWidth / 2 + newR * Math.cos(theta);
    const newZVal =
      tZ + this.editorData.derivedVals.plateWidth / 2 + newR * Math.sin(theta);
    const geometry = new THREE.BoxGeometry(w, h, l);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const divotBox = new THREE.Mesh(geometry, material);
    divotBox.position.set(newXVal, tY, newZVal);
    divotBox.updateMatrix();
    return CSG.fromMesh(divotBox);
  }

  public addDialKnobLayer3(tX: number, tY: number, tZ: number) {
    const r =
        this.editorData.derivedVals.knobWidth / 2 +
        this.editorData.partGapWidth,
      h = this.editorData.minWallWidth + this.editorData.textDepth + 2;
    const geometry = new THREE.CylinderGeometry(r, r, h, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const knobHole = new THREE.Mesh(geometry, material);
    knobHole.position.set(
      tX + this.editorData.derivedVals.plateWidth / 2,
      tY,
      tZ + this.editorData.derivedVals.plateWidth / 2,
    );
    knobHole.updateMatrix();
    return CSG.fromMesh(knobHole);
  }

  public addTextLayer3(svgPathNode: string): CSG {
    const layer3Height =
      this.editorData.minWallWidth + this.editorData.textDepth;
    const yTranslate = layer3Height / 2 + 5 - this.editorData.textDepth;
    //boolean difference rectangle, union text
    //console.log('Test 1');
    const loader = new SVGLoader();
    const data = loader.parse(svgPathNode);
    const paths = data.paths;
    //console.log('Test 2');

    const shapes = [];

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      const shapesTemp = path.toShapes(true);
      shapes.push(...shapesTemp);
    }

    // Assuming you want to extrude the shape
    const extrudeSettings = {
      steps: 2,
      depth: this.editorData.textDepth * 2,
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
    const textCSG = CSG.fromMesh(mesh);
    return textCSG;

    // Add the mesh to your scene

    //this.scene.add(mesh);
  }
}
