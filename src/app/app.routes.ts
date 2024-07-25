import { Routes } from '@angular/router';
//import { provideRouter } from '@angular/router';
import { EditorComponent } from './components/editor/editor.component';
import { TestGpuCsgComponent } from './components/test-gpu-csg/test-gpu-csg.component';

export const routes: Routes = [
  { path: 'editor', component: EditorComponent },
  { path: 'testgpu', component: TestGpuCsgComponent },
];
