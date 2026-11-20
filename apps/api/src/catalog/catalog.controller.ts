import { Controller, Get, Header, Param } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // Browsers may reuse the catalogue for five minutes; it only changes when the shop syncs it.
  @Get('catalog/artworks')
  @Header('Cache-Control', 'public, max-age=300')
  list() {
    return this.catalog.list();
  }

  @Get('catalog/artworks/:sourceId')
  @Header('Cache-Control', 'public, max-age=300')
  get(@Param('sourceId') sourceId: string) {
    return this.catalog.getBySourceId(sourceId);
  }

  /** Same physical record the Unity AR app turns into a PaintingSpec. */
  @Get('integrations/ar/artworks/:sourceId')
  viewInRoom(@Param('sourceId') sourceId: string) {
    return this.catalog.getBySourceId(sourceId);
  }
}
