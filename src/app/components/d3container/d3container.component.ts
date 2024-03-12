import {
  AfterViewInit,
  Component,
  OnInit,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormGroup,
  FormBuilder,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import * as d3 from 'd3';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import opentype from 'opentype.js';
import { EditorData } from '../../interfaces/editor-data';
import { TrackerModule } from '../../interfaces/tracker-module';
import * as _ from 'lodash';

@Component({
  selector: 'app-d3container',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatExpansionModule,
    MatButtonModule,
  ],
  templateUrl: './d3container.component.html',
  styleUrl: './d3container.component.scss',
})
export class D3containerComponent implements OnInit, AfterViewInit {
  @Output() moduleAdded: EventEmitter<TrackerModule[]> = new EventEmitter<
    TrackerModule[]
  >();
  private lineColor: string = '#badbed';
  private fb!: FormBuilder;
  public printOptionsForm!: FormGroup;
  public editorData!: EditorData;
  public settings!: object;
  public sliderRadius!: number;
  public segmentLength!: number;
  public knobWidth!: number;
  public plateWidth!: number;
  public plateHeight!: number;
  public dialViewBoxDimensions!: number;
  public sliderWidthViewBox!: number; //should always be same regardless
  public sliderLengthViewBoxAdd!: number; //add this to length * segmentLength
  public modulesList: TrackerModule[] = [];
  public boundingBox = {
    minX: Number.MAX_SAFE_INTEGER,
    minY: Number.MAX_SAFE_INTEGER,
    maxX: 0,
    maxY: 0,
  };
  constructor() {
    this.fb = new FormBuilder();
  }
  ngOnInit() {
    this.createForm();
    this.updateDerivedVars();
    this.printOptionsForm.get('magnetDiameter')?.valueChanges.subscribe(() => {
      this.updateDerivedVars();
    });
    this.printOptionsForm.get('magnetHeight')?.valueChanges.subscribe(() => {
      this.updateDerivedVars();
    });
    this.printOptionsForm.get('partGapWidth')?.valueChanges.subscribe(() => {
      this.updateDerivedVars();
    });
    this.printOptionsForm.get('minWallWidth')?.valueChanges.subscribe(() => {
      this.updateDerivedVars();
    });
    this.printOptionsForm.get('textDepth')?.valueChanges.subscribe(() => {
      this.updateDerivedVars();
    });
    this.printOptionsForm.get('bedDimensionX')?.valueChanges.subscribe(() => {
      this.updateDerivedVars();
    });
    this.printOptionsForm.get('bedDimensionY')?.valueChanges.subscribe(() => {
      this.updateDerivedVars();
    });
  }

  ngAfterViewInit() {
    this.initSVGEditorCanvas();
    console.log(this.boundingBox);
  }

  private addModule(module: TrackerModule) {
    this.modulesList.push(module);
    this.moduleAdded.emit(this.modulesList);
  }

  public checkExtremes(
    minXIn: number,
    minYIn: number,
    maxXIn: number,
    maxYIn: number,
  ) {
    if (this.boundingBox.minX > minXIn) {
      this.boundingBox.minX = minXIn;
    }
    if (this.boundingBox.minY > minYIn) {
      this.boundingBox.minY = minYIn;
    }
    if (this.boundingBox.maxX < maxXIn) {
      this.boundingBox.maxX = maxXIn;
    }
    if (this.boundingBox.maxY < maxYIn) {
      this.boundingBox.maxY = maxYIn;
    }
  }

  public parseTransform(transformString: string) {
    const result = {
      rotate: { a: 0 },
      translate: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
    };

    // Extract rotate value
    const rotateMatch = transformString.match(/rotate\((\d+)\)/);
    if (rotateMatch) {
      result.rotate.a = parseFloat(rotateMatch[1]);
    }

    // Extract translate values
    const translateMatch = transformString.match(
      /translate\((-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)\)/,
    );
    if (translateMatch) {
      result.translate.x = parseFloat(translateMatch[1]);
      result.translate.y = parseFloat(translateMatch[2]);
    }

    // Extract scale values (optional)
    const scaleMatch = transformString.match(
      /scale\((-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)\)/,
    );
    if (scaleMatch) {
      result.scale.x = parseFloat(scaleMatch[1]);
      result.scale.y = parseFloat(scaleMatch[2]);
    }

    return result;
  }

  public initSVGEditorCanvas() {
    // TODO: once backend exists, check if new, if not load and append
    //xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    const svgGroup = d3
      .select('#svgContainer')
      .append('svg')
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      .attr('viewBox', '0 0 200 200')
      .attr('width', '100%')
      .attr('height', '100%');
    const linesGroup = svgGroup.append('g').attr('id', 'linesGroup');
    for (
      let i = 0;
      i <= this.printOptionsForm.controls['bedDimensionX'].value;
      i += 5
    ) {
      let strokeWidth: number;
      if (i % 100 === 0) {
        strokeWidth = 0.6;
      } else if (i % 20 === 0) {
        strokeWidth = 0.4;
      } else {
        strokeWidth = 0.2;
      }
      linesGroup
        .append('line')
        .attr('x1', i)
        .attr('y1', 0)
        .attr('x2', i)
        .attr('y2', this.printOptionsForm.controls['bedDimensionY'].value)
        .attr('class', 'gridLine')
        .style('opacity', 0.2)
        .style('stroke', 'white')
        .style('stroke-width', strokeWidth);
    }
    for (
      let i = 0;
      i <= this.printOptionsForm.controls['bedDimensionY'].value;
      i += 5
    ) {
      let strokeWidth: number;
      if (i % 100 === 0) {
        strokeWidth = 0.6;
      } else if (i % 20 === 0) {
        strokeWidth = 0.4;
      } else {
        strokeWidth = 0.2;
      }
      linesGroup
        .append('line')
        .attr('x1', 0)
        .attr('y1', i)
        .attr('x2', this.printOptionsForm.controls['bedDimensionX'].value)
        .attr('y2', i)
        .attr('class', 'gridLine')
        .style('opacity', 0.2)
        .style('stroke', 'white')
        .style('stroke-width', strokeWidth);
    }
    console.log(this.segmentLength);

    this.addNumberDialInstance(20, 20);
    this.addNumberDialInstance(60, 20);
    this.addNumberDialInstance(100, 20);
    //this.addText(0, 60, 10, 'Life Total', 8);
    this.addPathText(0, 60, 10, 'Viktor', 8);
    this.addPathText(0, 60, 30, 'Life Total', 8);
    /*this.addSlider(2, 90, 20, 10);
    this.addSlider(3, 90, 20, 20);
    this.addSlider(4, 90, 20, 30);
    this.addSlider(5, 90, 20, 40);
    this.addSlider(2, 0, 100, 20);
    this.addSlider(3, 0, 110, 20);
    this.addSlider(4, 0, 120, 20);
    this.addSlider(5, 0, 130, 20); */
    this.proceduralPathfinder2eSpellSlots(10, 90);
    //this.proceduralDND5eSpellSlots(50, 150);

    const res = this.parseTransform(`rotate(-10 50 100)
    translate(-36 45.5)
    skewX(40)
    scale(1 0.5)`);
    console.log(res);
    console.log(this.modulesList);
  }

  private proceduralSliderGrid(
    label: string,
    grid: { labels: string[]; maxSlots: number[] },
    tx: number,
    ty: number,
  ) {
    const tXDist =
      this.sliderRadius * 2 +
      2 +
      2 * this.printOptionsForm.controls['partGapWidth'].value +
      this.printOptionsForm.controls['minWallWidth'].value;
    const largestSlotNumber = Math.max(...grid.maxSlots);
    for (const [i, value] of grid.labels.entries()) {
      this.addSlider(
        grid.maxSlots[i] + 1,
        0,
        tx + i * tXDist,
        ty + this.segmentLength * (largestSlotNumber - grid.maxSlots[i]),
      );
      this.addPathText(0, tx + i * tXDist, ty - 2, value, 8);
    }
    const startingPoint = ty + this.sliderRadius + 0.4;
    for (let i = largestSlotNumber; i >= 0; i--) {
      this.addPathText(
        0,
        tx - 5,
        startingPoint + (largestSlotNumber - i) * this.segmentLength,
        i + '',
        4,
        true,
      );
    }
    this.addPathText(0, tx + 30, ty - 12, label, 8);
  }

  private proceduralPathfinder2eSpellSlots(tx: number, ty: number) {
    const label = 'Spell Slots';
    const xLabels = ['C', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const slots = [5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2];
    this.proceduralSliderGrid(
      label,
      { labels: xLabels, maxSlots: slots },
      tx,
      ty,
    );
  }

  private proceduralDND5eSpellSlots(tx: number, ty: number) {
    const label = 'Spell Slots';
    const xLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const slots = [4, 3, 3, 3, 3, 2, 2, 1, 1];
    this.proceduralSliderGrid(
      label,
      { labels: xLabels, maxSlots: slots },
      tx,
      ty,
    );
  }

  //eventually pull saved file and update this value here
  private createForm() {
    this.printOptionsForm = this.fb.group({
      magnetDiameter: [2, [Validators.required]],
      magnetHeight: [1, [Validators.required]],
      partGapWidth: [0.15, [Validators.required]],
      minWallWidth: [1.5, [Validators.required]],
      textPrintOpt: [1, [Validators.required]],
      bedDimensionX: [200, [Validators.required]],
      bedDimensionY: [200, [Validators.required]],
      textDepth: [0.5, [Validators.required]],
      // plasticSaver: [ 1, [Validators.required]] TODO: add option for non rectangular print to save plastic
    });
  }
  public updateViewBox() {
    //const x = this.printOptionsForm.controls['bedDimensionX'].value;
    //const y = this.printOptionsForm.controls['bedDimensionY'].value;
  }

  public updateDerivedVars() {
    this.sliderRadius =
      this.printOptionsForm.controls['magnetDiameter'].value / 2 +
      this.printOptionsForm.controls['partGapWidth'].value +
      2 +
      0.5; // knob radius 2 + magnet Radius + gap,
    // trough width = knob radius plus 1 (divided by 2 for arc)
    this.segmentLength =
      this.printOptionsForm.controls['magnetDiameter'].value +
      this.printOptionsForm.controls['partGapWidth'].value * 2 +
      4;
    this.knobWidth =
      4 +
      this.printOptionsForm.controls['magnetDiameter'].value +
      this.printOptionsForm.controls['partGapWidth'].value * 2;
    this.plateWidth = 6 * this.knobWidth;
    this.dialViewBoxDimensions = this.plateWidth + 4;
    this.sliderWidthViewBox = this.sliderRadius * 2 + 0.6;
    this.sliderLengthViewBoxAdd = 1.6;
    this.plateHeight =
      this.printOptionsForm.controls['magnetDiameter'].value +
      this.printOptionsForm.controls['minWallWidth'].value +
      this.printOptionsForm.controls['textDepth'].value;
    console.log(this.sliderRadius * 2 - this.knobWidth); //should be 1
    this.setEditorData();
  }

  private setEditorData() {
    this.editorData = {
      magnetDiameter: this.printOptionsForm.controls['magnetDiameter'].value,
      magnetHeight: this.printOptionsForm.controls['magnetHeight'].value,
      partGapWidth: this.printOptionsForm.controls['partGapWidth'].value,
      minWallWidth: this.printOptionsForm.controls['minWallWidth'].value,
      textPrintOpt: this.printOptionsForm.controls['partGapWidth'].value, //deprecated?
      textDepth: this.printOptionsForm.controls['textDepth'].value,
      bedDimensionX: this.printOptionsForm.controls['bedDimensionX'].value,
      bedDimensionY: this.printOptionsForm.controls['bedDimensionY'].value,
      derivedVals: {
        sliderRadius: this.sliderRadius,
        segmentLength: this.segmentLength,
        knobWidth: this.knobWidth,
        plateWidth: this.plateWidth,
        plateHeight: this.plateHeight,
      },
      boundingBox: {
        minX: this.boundingBox.minX,
        minY: this.boundingBox.minY,
        maxX: this.boundingBox.maxX,
        maxY: this.boundingBox.maxY,
      },
    };
  }

  // emit update - editor component will update input value for threejs component
  // maybe set an acceptable range between 0 and 1 mm then on geometry recalc
  // mostly keep it the same with just bigger boolean cylinders
  public updatePartGapWidth() {}
  // recalculate everything in svg, enforce collision prevention top
  // to bottom, left to right then emit
  public updateMagnetDiameter() {}
  //just emit
  public updateMagnetHeight() {}

  public addSlider(
    length: number,
    rotation: number,
    translationX: number,
    translationY: number,
  ) {
    //for now just horizontal/vertical 0 and 90
    const x = this.sliderRadius + 0.4;
    const y = this.sliderRadius + 0.4;
    let viewX, viewY;
    if (rotation === 0) {
      viewX = this.sliderWidthViewBox;
      viewY = length * this.segmentLength + this.sliderLengthViewBoxAdd;
    } else {
      viewX = length * this.segmentLength + this.sliderLengthViewBoxAdd;
      viewY = this.sliderWidthViewBox;
    }
    const sliderID = 'slider-' + length + '-' + rotation;
    const svgSelection = d3.select('#svgContainer svg');
    if (svgSelection.select('#' + sliderID + ' symbol').empty()) {
      svgSelection
        .append('symbol')
        .attr('id', sliderID)
        .attr('viewBox', '0 0 ' + viewX + ' ' + viewY)
        .attr('width', viewX)
        .attr('height', viewY);
      if (rotation === 0) {
        this.addTopCap(sliderID, 0, x, y);
        this.addBottomCap(
          sliderID,
          0,
          x,
          y + this.segmentLength * (length - 1),
        );
        for (let i = 1; i < length - 1; i++) {
          this.addVerticalMid(sliderID, 0, x, y + this.segmentLength * i);
        }
      } else {
        this.addLeftCap(sliderID, 0, x, y);
        this.addRightCap(sliderID, 0, x + this.segmentLength * (length - 1), y);
        for (let i = 1; i < length - 1; i++) {
          this.addHorizontalMid(sliderID, 0, x + this.segmentLength * i, y);
        }
      }
    }
    svgSelection
      .append('use')
      .attr('href', '#' + sliderID)
      .attr('id', sliderID)
      .attr('viewBox', '0 0 ' + viewX + ' ' + viewY)
      .attr('width', viewX)
      .attr('height', viewY)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      );
    this.checkExtremes(
      translationX,
      translationY,
      translationX + viewX,
      translationY + viewY,
    );
    this.addModule({
      type: 0,
      data: [length, rotation, translationX, translationY],
      editorData: _.cloneDeep(this.editorData),
    });
    //this.addTopCap(sliderID, 180, x, length * segmentLength + y - segmentLength);
    // return selection
  }

  // Make a group, add half circle of radius R, add tangent lines extending the ends by length R
  private addTopCap(
    sliderID: string,
    rotation: number,
    translationX: number,
    translationY: number,
  ) {
    // lower case n shape is 0, args increments of 90
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2,
          outerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius: this.sliderRadius,
          outerRadius: this.sliderRadius + 0.2,
          startAngle: -Math.PI / 2, //0 is straight up
          endAngle: Math.PI / 2,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', -0.1 + translationX - this.sliderRadius)
      .attr('y1', translationY)
      .attr('x2', -0.1 + translationX - this.sliderRadius)
      .attr('y2', this.segmentLength / 2 + translationY)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', 0.1 + translationX + this.sliderRadius)
      .attr('y1', translationY)
      .attr('x2', 0.1 + this.sliderRadius + translationX)
      .attr('y2', this.segmentLength / 2 + translationY)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
  }

  private addLeftCap(
    sliderID: string,
    rotation: number,
    translationX: number,
    translationY: number,
  ) {
    // lower case n shape is 0, args increments of 90
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2,
          outerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius: this.sliderRadius,
          outerRadius: this.sliderRadius + 0.2,
          startAngle: Math.PI, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', translationX + this.segmentLength / 2)
      .attr('y1', translationY - this.sliderRadius - 0.1)
      .attr('x2', translationX)
      .attr('y2', translationY - this.sliderRadius - 0.1)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', translationX + this.segmentLength / 2)
      .attr('y1', translationY + this.sliderRadius + 0.1)
      .attr('x2', translationX)
      .attr('y2', translationY + this.sliderRadius + 0.1)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
  }

  private addBottomCap(
    sliderID: string,
    rotation: number,
    translationX: number,
    translationY: number,
  ) {
    // lower case n shape is 0, args increments of 90
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2,
          outerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius: this.sliderRadius,
          outerRadius: this.sliderRadius + 0.2,
          startAngle: Math.PI / 2, //0 is straight up
          endAngle: (3 * Math.PI) / 2,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', -0.1 + translationX - this.sliderRadius)
      .attr('y1', translationY)
      .attr('x2', -0.1 + translationX - this.sliderRadius)
      .attr('y2', translationY - this.segmentLength / 2)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', 0.1 + translationX + this.sliderRadius)
      .attr('y1', translationY)
      .attr('x2', 0.1 + this.sliderRadius + translationX)
      .attr('y2', translationY - this.segmentLength / 2)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
  }

  private addRightCap(
    sliderID: string,
    rotation: number,
    translationX: number,
    translationY: number,
  ) {
    // lower case n shape is 0, args increments of 90
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2,
          outerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius: this.sliderRadius,
          outerRadius: this.sliderRadius + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', translationX - this.segmentLength / 2)
      .attr('y1', translationY - this.sliderRadius - 0.1)
      .attr('x2', translationX)
      .attr('y2', translationY - this.sliderRadius - 0.1)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', translationX - this.segmentLength / 2)
      .attr('y1', translationY + this.sliderRadius + 0.1)
      .attr('x2', translationX)
      .attr('y2', translationY + this.sliderRadius + 0.1)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
  }

  private addHorizontalMid(
    sliderID: string,
    rotation: number,
    translationX: number,
    translationY: number,
  ) {
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2,
          outerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', translationX - this.segmentLength / 2)
      .attr('y1', translationY - this.sliderRadius - 0.1)
      .attr('x2', translationX + this.segmentLength / 2)
      .attr('y2', translationY - this.sliderRadius - 0.1)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', translationX - this.segmentLength / 2)
      .attr('y1', translationY + this.sliderRadius + 0.1)
      .attr('x2', translationX + this.segmentLength / 2)
      .attr('y2', translationY + this.sliderRadius + 0.1)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
  }

  private addVerticalMid(
    sliderID: string,
    rotation: number,
    translationX: number,
    translationY: number,
  ) {
    d3.select('symbol[id=' + sliderID + ']')
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .attr(
        'd',
        d3.arc()({
          innerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2,
          outerRadius:
            this.printOptionsForm.controls['magnetDiameter'].value / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', -0.1 + translationX - this.sliderRadius)
      .attr('y1', translationY + this.segmentLength / 2)
      .attr('x2', -0.1 + translationX - this.sliderRadius)
      .attr('y2', translationY - this.segmentLength / 2)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
    d3.select('symbol[id=' + sliderID + ']')
      .append('line')
      .attr('x1', 0.1 + translationX + this.sliderRadius)
      .attr('y1', translationY + this.segmentLength / 2)
      .attr('x2', 0.1 + this.sliderRadius + translationX)
      .attr('y2', translationY - this.segmentLength / 2)
      .style('stroke', this.lineColor)
      .style('stroke-width', '0.25px');
  }

  //Dial with numbers 0-9
  public addNumberDialSymbol() {
    const angleDiffRads = (2 * Math.PI) / 10;
    const angleDiffDeg = 360 / 10;

    const originX = (this.plateWidth + 4) / 2;
    const originY = (this.plateWidth + 4) / 2; // + 4 adds a bubble of 2 on each side
    const svgGroup = d3.select('#svgContainer svg');

    svgGroup
      .append('symbol')
      .attr('id', 'numberDial')
      .attr(
        'viewbox',
        '0 0 ' + this.dialViewBoxDimensions + ' ' + this.dialViewBoxDimensions,
      )
      .attr('width', this.dialViewBoxDimensions)
      .attr('height', this.dialViewBoxDimensions);
    const symbolGroup = d3.select('symbol[id=numberDial]');
    const dialGroup = symbolGroup.append('g').attr('id', 'dial');
    dialGroup
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'd',
        d3.arc()({
          innerRadius: this.knobWidth / 2,
          outerRadius: this.knobWidth / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    dialGroup
      .append('path')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.1)
      .style('fill', this.lineColor)
      .attr(
        'd',
        d3.arc()({
          innerRadius: this.plateWidth / 2,
          outerRadius: this.plateWidth / 2 + 0.2,
          startAngle: 0, //0 is straight up
          endAngle: 2 * Math.PI,
        }),
      );
    /*dialGroup.append('path').attr('id', 'superSpecificNumberPath').style('stroke', this.lineColor).style('stroke-width', 0.1).style('fill', this.lineColor).attr('transform','translate(' + originX + ', ' + originY + ')').attr('d', d3.arc()({
      innerRadius: plateWidth / 2 - 3,
      outerRadius: plateWidth / 2 - 3 + 0.2,
      startAngle: 0, //0 is straight up
      endAngle: 2 * Math.PI
    }));*/
    //dialGroup.append('textPath').text('0123456789').attr('xlink:href', '#superSpecificNumberPath').attr('lengthAdjust', 'spacingAndGlyphs').style('stroke', this.lineColor); test
    for (let i = 0; i <= 9; i++) {
      const theta = angleDiffRads * i + Math.PI / 2 + angleDiffRads, //want 0 at bottom, but Math.sin/Math.cos uses 0 degrees/radians whereas CSS uses up
        thetaDeg = angleDiffDeg * i + angleDiffDeg,
        textRadius = 2 * this.knobWidth - 1.5;
      const xVal = textRadius * Math.cos(theta);
      const yVal = textRadius * Math.sin(theta);
      const magXVal =
        (this.plateWidth / 2 -
          (1.5 + this.printOptionsForm.controls['magnetDiameter'].value / 2)) *
        Math.cos(theta); //x and y are circle center, want to set mag edge minWallWidth inside dial edge
      const magYVal =
        (this.plateWidth / 2 -
          (1.5 + this.printOptionsForm.controls['magnetDiameter'].value / 2)) *
        Math.sin(theta); //x and y are circle center
      dialGroup
        .append('text')
        .attr('x', xVal)
        .attr('y', yVal)
        .attr('dy', '.35em')
        .attr('text-anchor', 'middle')
        .attr(
          'transform',
          'rotate(' + thetaDeg + ', ' + xVal + ', ' + yVal + ')',
        )
        .text(i + '')
        .style('stroke', this.lineColor)
        .attr('font-size', '8px')
        .attr('stroke-width', 0.2)
        .attr('fill', this.lineColor);

      const circleGroup = dialGroup
        .append('path')
        .style('stroke', this.lineColor)
        .style('stroke-width', 0.1)
        .style('fill', this.lineColor)
        .attr(
          'd',
          d3.arc()({
            //.attr('transform','translate(' + xVal + ', ' + yVal + ')')
            innerRadius:
              this.printOptionsForm.controls['magnetDiameter'].value / 2,
            outerRadius:
              this.printOptionsForm.controls['magnetDiameter'].value / 2 + 0.2,
            startAngle: 0, //0 is straight up
            endAngle: 2 * Math.PI,
          }),
        );
      circleGroup.attr(
        'transform',
        'translate(' + magXVal + ', ' + magYVal + ')',
      );
    }
    d3.select('symbol[id=numberDial]')
      .append('g')
      .attr('id', 'window')
      .append('rect')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.25)
      .attr('x', originX - this.knobWidth / 2 - 0.5)
      .attr('y', originY + this.knobWidth)
      .attr('width', this.knobWidth + 1)
      .attr('height', this.knobWidth + 3)
      .style('fill', 'none');
    dialGroup
      .attr('transform', 'rotate(18, 0, 0)')
      .attr('transform', 'translate(' + originX + ', ' + originY + ')');
  }

  public addNumberDialInstance(translationX: number, translationY: number) {
    if (d3.select('symbol[id=numberDial').empty()) {
      this.addNumberDialSymbol();
    }
    d3.select('#svgContainer svg')
      .append('use')
      .attr('href', '#numberDial')
      .attr(
        'viewbox',
        '0 0 ' + this.dialViewBoxDimensions + ' ' + this.dialViewBoxDimensions,
      )
      .attr('width', this.dialViewBoxDimensions)
      .attr('height', this.dialViewBoxDimensions)
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      );
    this.checkExtremes(
      translationX,
      translationY,
      translationX + this.dialViewBoxDimensions,
      translationY + this.dialViewBoxDimensions,
    );
    this.addModule({
      type: 1,
      data: [translationX, translationY],
      editorData: _.cloneDeep(this.editorData),
    });
  }

  public getFontSize(
    inputText: string,
    fontSize: number,
  ): { x: number; y: number; width: number; height: number } {
    const tbbox = { x: 0, y: 0, width: 0, height: 0 };
    const textGroup = d3
      .select('#svgContainer svg')
      .append('text')
      .attr('text-anchor', 'left')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.25)
      .style('fill', this.lineColor)
      .style('font-size', fontSize + 'px')
      .style('opacity', 0)
      .attr('text-anchor', 'start')
      .attr('alignment-baseline', 'middle')
      .style('font-family', 'Droid Sans, Open Sans, Arial, Roboto')
      .text(inputText);
    const tGNode = textGroup.node();
    if (tGNode) {
      const textBBox = tGNode.getBBox();
      tbbox.x = textBBox.x;
      tbbox.y = textBBox.y;
      tbbox.width = textBBox.width;
      tbbox.height = textBBox.height;
    }
    textGroup.remove();
    return tbbox;
  }

  public getPathFontSize(
    inputText: string,
    fontSize: number,
  ): Promise<{ x: number; y: number; width: number; height: number }> {
    return new Promise((resolve) => {
      const tbbox = { x: 0, y: 0, width: 0, height: 0 };
      const buffer = fetch(
        '../../../assets/Fonts/M_PLUS_1p/MPLUS1p-ExtraBold.ttf',
      ).then((res) => res.arrayBuffer());
      // case 2: from filesystem (node)
      //const buffer = fs.promises.readFile('./my.woff');
      // case 3: from an <input type=file id=myfile>
      //const buffer = document.getElementById('myfile').files[0].arrayBuffer(); - maybe allow this later?

      // if not running in async context:
      buffer
        .then((data) => {
          const font = opentype.parse(data);
          const path = font.getPath(inputText, 0, 0, fontSize);
          const svgPath = path.toPathData(5);

          const textGroup = d3
            .select('#svgContainer svg')
            .append('path')
            .attr('d', svgPath)
            .style('stroke', this.lineColor)
            .style('stroke-width', 0.25)
            .style('fill', this.lineColor)
            .style('opacity', 0);

          const tGNode = textGroup.node();
          if (tGNode) {
            const textBBox = tGNode.getBBox();
            tbbox.x = textBBox.x;
            tbbox.y = textBBox.y;
            tbbox.width = textBBox.width;
            tbbox.height = textBBox.height;
          }
          textGroup.remove();
          resolve(tbbox);
        })
        .catch(() => {
          resolve(tbbox);
        })
        .finally(() => {
          resolve(tbbox);
        });
    });
  }

  /** It appears that text translate is bottom Left corner of text. Text height is the distance of roughly
   * (exactly?) 3 equal segments with the top two segments being standard lower and upper case letters, and the
   * bottom segment being lower case qypgj. So for numbers that we want centered we add height / 3 to the
   * y translate value. Is it perfect? Probably not, but it's really close.
   */
  public addText(
    rotation: number,
    translationX: number,
    translationY: number,
    inputText: string,
    fontSize: number,
    yTranslateCentered?: boolean,
  ) {
    const testBBox = this.getFontSize(inputText, fontSize);
    const testHeight =
      typeof yTranslateCentered !== 'undefined'
        ? translationY + testBBox.height / 3
        : translationY;
    const textGroup = d3
      .select('#svgContainer svg')
      .append('text')
      .attr('x', translationX)
      .attr('y', testHeight)
      .attr('text-anchor', 'left')
      .style('stroke', this.lineColor)
      .style('stroke-width', 0.25)
      .style('fill', this.lineColor)
      .style('font-size', fontSize + 'px')
      .attr('text-anchor', 'start')
      .attr('alignment-baseline', 'middle')
      .attr('transform', 'rotate(' + rotation + ')')
      .style('font-family', 'Droid Sans, Open Sans, Arial, Roboto')
      .text(inputText);
    /*d3.select('#svgContainer svg')
      .append('path')
      .attr(
        'd',
        d3.arc()({
          innerRadius: 0.5,
          outerRadius: 0.6,
          startAngle: 0,
          endAngle: 2 * Math.PI,
        }),
      )
      .attr(
        'transform',
        'translate(' + translationX + ', ' + translationY + ')',
      )
      .style('stroke', '#ff0000')
      .style('stroke-width', 0.25)
      .style('fill', '#ff0000'); */
    const tGNode = textGroup.node();
    if (tGNode) {
      const textBBox = tGNode.getBBox();
      this.checkExtremes(
        textBBox.left,
        textBBox.top,
        textBBox.right,
        textBBox.bottom,
      );
      //console.log(textBBox);
      this.addModule({
        type: 2,
        data: [
          rotation,
          translationX,
          translationY,
          inputText,
          textBBox.width,
          textBBox.height,
        ],
        editorData: _.cloneDeep(this.editorData),
      });
    }
  }

  public addPathText(
    rotation: number,
    translationX: number,
    translationY: number,
    inputText: string,
    fontSize: number,
    yTranslateCentered?: boolean,
  ) {
    // case 1: from an URL
    const buffer = fetch(
      '../../../assets/Fonts/M_PLUS_1p/MPLUS1p-ExtraBold.ttf',
    ).then((res) => res.arrayBuffer());
    // case 2: from filesystem (node)
    //const buffer = fs.promises.readFile('./my.woff');
    // case 3: from an <input type=file id=myfile>
    //const buffer = document.getElementById('myfile').files[0].arrayBuffer(); - maybe allow this later?
    const testBBox = this.getPathFontSize(inputText, fontSize);
    testBBox.then((bbox) => {
      const testHeight =
        typeof yTranslateCentered !== 'undefined'
          ? translationY + bbox.height / 2
          : translationY;
      buffer.then((data) => {
        const font = opentype.parse(data);
        const path = font.getPath(
          inputText,
          translationX,
          testHeight,
          fontSize,
        );
        const svgPath = path.toPathData(5);

        const textGroup = d3
          .select('#svgContainer svg')
          .append('path')
          .attr('d', svgPath)
          .style('stroke', this.lineColor)
          .style('stroke-width', 0.25)
          .style('fill', this.lineColor);
        const textGroupNode = textGroup.node()?.outerHTML;
        //console.log(textGroupNode);
        this.addModule({
          type: 3,
          data: [rotation, translationX, testHeight, textGroupNode!],
          editorData: _.cloneDeep(this.editorData),
        });
      });
      this.checkExtremes(
        bbox.x,
        bbox.y,
        bbox.x + bbox.width,
        bbox.y + bbox.height,
      );
    });
  }
}
