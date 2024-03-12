import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Preview3dComponent } from '../preview3d/preview3d.component';
import { D3containerComponent } from '../d3container/d3container.component';
import { MatButtonModule } from '@angular/material/button';
import { TrackerModule } from '../../interfaces/tracker-module';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [
    CommonModule,
    Preview3dComponent,
    D3containerComponent,
    MatButtonModule,
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
})
export class EditorComponent {
  public previewVisible: boolean = false;
  public trackerModuleList!: TrackerModule[];

  public hidePreview(e: TrackerModule[]) {
    this.previewVisible = false;
    this.trackerModuleList = e;
  }

  public showPreview() {
    this.previewVisible = true;
  }
}
