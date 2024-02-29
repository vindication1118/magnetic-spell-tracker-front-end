import { TestBed } from '@angular/core/testing';

import { CsgPreviewService } from './csg-preview.service';

describe('CsgPreviewService', () => {
  let service: CsgPreviewService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CsgPreviewService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
