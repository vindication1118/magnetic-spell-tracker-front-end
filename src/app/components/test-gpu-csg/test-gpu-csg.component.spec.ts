import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestGpuCsgComponent } from './test-gpu-csg.component';

describe('TestGpuCsgComponent', () => {
  let component: TestGpuCsgComponent;
  let fixture: ComponentFixture<TestGpuCsgComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestGpuCsgComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestGpuCsgComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
