import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Preview3dComponent } from '../preview3d/preview3d.component';
import { D3containerComponent } from '../d3container/d3container.component';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, Preview3dComponent, D3containerComponent],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
})
export class EditorComponent {}
