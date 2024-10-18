import { Routes } from '@angular/router';
import { EditorComponent } from './components/editor/editor.component';
import { TestGpuCsgComponent } from './components/test-gpu-csg/test-gpu-csg.component';
import { HomepageComponent } from './components/homepage/homepage.component';

export const routes: Routes = [
  { path: '', component: HomepageComponent },
  { path: 'editor', component: EditorComponent },
  { path: 'testgpu', component: TestGpuCsgComponent },
];
