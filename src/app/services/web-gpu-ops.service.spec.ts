import { TestBed } from '@angular/core/testing';

import { WebGpuOpsService } from './web-gpu-ops.service';

describe('WebGpuOpsService', () => {
  let service: WebGpuOpsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebGpuOpsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
