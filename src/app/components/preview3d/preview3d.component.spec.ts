import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Preview3dComponent } from './preview3d.component';

describe('Preview3dComponent', () => {
  let component: Preview3dComponent;
  let fixture: ComponentFixture<Preview3dComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Preview3dComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(Preview3dComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
