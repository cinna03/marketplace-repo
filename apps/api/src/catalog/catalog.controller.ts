import { Controller, Get, Param } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('catalog/artworks')
  list() {
    return this.catalog.list();
  }

  @Get('catalog/artworks/:sourceId')
  get(@Param('sourceId') sourceId: string) {
    return this.catalog.getBySourceId(sourceId);
  }

  /** Same physical record the Unity AR app turns into a PaintingSpec. */
  @Get('integrations/ar/artworks/:sourceId')
  viewInRoom(@Param('sourceId') sourceId: string) {
    return this.catalog.getBySourceId(sourceId);
  }
}
