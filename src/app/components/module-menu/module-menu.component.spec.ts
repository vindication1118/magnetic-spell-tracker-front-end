import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModuleMenuComponent } from './module-menu.component';

describe('ModuleMenuComponent', () => {
  let component: ModuleMenuComponent;
  let fixture: ComponentFixture<ModuleMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleMenuComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ModuleMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
