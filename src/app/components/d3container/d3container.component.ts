import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormGroup, FormBuilder, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import * as d3 from 'd3';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatButtonModule} from '@angular/material/button';
@Component({
  selector: 'app-d3container',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCardModule,
  MatExpansionModule, MatButtonModule],
  templateUrl: './d3container.component.html',
  styleUrl: './d3container.component.scss'
})
export class D3containerComponent implements OnInit {
  private fb!: FormBuilder;
  public printOptionsForm!: FormGroup;
  constructor(){
    this.fb = new FormBuilder;
  }
  ngOnInit(){
    this.createForm();
    this.initSVGEditorCanvas();
  }

  public initSVGEditorCanvas(){
    // TODO: once backend exists, check if new, if not load and append
    d3.select('#svgContainer').append('svg').attr('viewBox', '0 0 200 200').attr('width', '100%').attr('height', '100%');

  }
  //eventually pull saved file and update this value here
  private createForm(){
    this.printOptionsForm = this.fb.group({
      magnetDiameter: [2, [Validators.required]],
      magnetHeight: [1, [Validators.required]],
      magnetGapWidth: [0.15, [Validators.required]],
      minWallWidth: [ 1.5, [Validators.required]],
      textPrintOpt: [1, [Validators.required]],
      bedDimensionX: [ 200, [Validators.required]],
      bedDimensionY: [ 200, [Validators.required]]
      // plasticSaver: [ 1, [Validators.required]] TODO: add option for non rectangular print to save plastic 
    })
  }
  public updateViewBox(){
    const x = this.printOptionsForm.controls['bedDimensionX'].value;
    const y = this.printOptionsForm.controls['bedDimensionY'].value;
  }

  // emit update - editor component will update input value for threejs component 
  // maybe set an acceptable range between 0 and 1 mm then on geometry recalc
  // mostly keep it the same with just bigger boolean cylinders
  public updateMagnetGapWidth(){

  }
  // recalculate everything in svg, enforce collision prevention top
  // to bottom, left to right 
  public updateMagnetDiameter(){

  }

  public addSlider(length: number, rotation: number) { //for now just horizontal/vertical 0 and 90
    const svgSelection = d3.select('#svgContainer svg');
    // return selection
  }
  public addSpinner(options: string[]) {
    const angleDiff = 360 / options.length;
    const svgSelection = d3.select('#svgContainer svg');
    
    // return selection
  }

}
