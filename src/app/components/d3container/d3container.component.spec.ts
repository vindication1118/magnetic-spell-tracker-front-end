import { ComponentFixture, TestBed } from '@angular/core/testing';

import { D3containerComponent } from './d3container.component';

describe('D3containerComponent', () => {
  let component: D3containerComponent;
  let fixture: ComponentFixture<D3containerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [D3containerComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(D3containerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
