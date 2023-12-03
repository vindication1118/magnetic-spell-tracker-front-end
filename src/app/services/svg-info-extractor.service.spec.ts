import { TestBed } from '@angular/core/testing';

import { SvgInfoExtractorService } from './svg-info-extractor.service';

describe('SvgInfoExtractorService', () => {
  let service: SvgInfoExtractorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SvgInfoExtractorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
