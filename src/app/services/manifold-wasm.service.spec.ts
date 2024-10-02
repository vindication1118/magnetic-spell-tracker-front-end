import { TestBed } from '@angular/core/testing';

import { ManifoldWasmService } from './manifold-wasm.service';

describe('ManifoldWasmService', () => {
  let service: ManifoldWasmService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ManifoldWasmService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
