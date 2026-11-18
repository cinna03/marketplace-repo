import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MetCollectionClient } from './met/met-client';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, MetCollectionClient],
  exports: [CatalogService],
})
export class CatalogModule {}
