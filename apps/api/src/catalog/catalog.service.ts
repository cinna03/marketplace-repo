import { Injectable } from '@nestjs/common';
import { CatalogArtwork } from '@prisma/client';
import { ApiError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CURATED_MET_OBJECT_IDS } from './curated-met-ids';
import { CatalogDraft, mapMetObject, rejectionReason } from './met/map-met-object';
import { MetCollectionClient } from './met/met-client';

const CATALOG_CACHE_MS = 10 * 60 * 1000;

export type CatalogView = {
  source: 'met';
  sourceId: string;
  title: string;
  artist: string;
  date: string;
  creditLine: string;
  mediumDescription: string;
  medium: CatalogArtwork['medium'];
  widthCm: number;
  heightCm: number;
  depthCm: number;
  imageUrl: string;
  thumbnailUrl: string;
  priceAmount: string;
  currency: string;
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly met: MetCollectionClient,
  ) {}

  /**
   * The catalogue changes only when it is synced, so one copy is kept in memory for ten
   * minutes instead of reading 500 rows from the database on every page.
   */
  private cached: { at: number; list: CatalogView[]; byId: Map<string, CatalogView> } | null = null;

  async list(): Promise<CatalogView[]> {
    return (await this.snapshot()).list;
  }

  async getBySourceId(sourceId: string): Promise<CatalogView> {
    const hit = (await this.snapshot()).byId.get(sourceId);
    if (hit) return hit;
    const row = await this.prisma.catalogArtwork.findUnique({
      where: { source_sourceId: { source: 'met', sourceId } },
    });
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Artwork not found.');
    return present(row);
  }

  private async snapshot() {
    if (this.cached && Date.now() - this.cached.at < CATALOG_CACHE_MS) return this.cached;
    const rows = await this.prisma.catalogArtwork.findMany({ orderBy: { title: 'asc' } });
    const list = rows.map(present);
    this.cached = { at: Date.now(), list, byId: new Map(list.map((view) => [view.sourceId, view])) };
    return this.cached;
  }

  async syncCurated(): Promise<{ imported: string[]; skipped: { id: number; reason: string }[] }> {
    const imported: string[] = [];
    const skipped: { id: number; reason: string }[] = [];

    for (const objectId of CURATED_MET_OBJECT_IDS) {
      const artwork = await this.met.getObject(objectId);
      if (!artwork) {
        skipped.push({ id: objectId, reason: 'not found' });
        continue;
      }
      const reason = rejectionReason(artwork);
      const draft = reason ? null : mapMetObject(artwork);
      if (!draft) {
        skipped.push({ id: objectId, reason: reason ?? 'filtered' });
        continue;
      }
      await this.upsert(draft);
      imported.push(draft.sourceId);
    }

    this.cached = null;
    return { imported, skipped };
  }

  private upsert(draft: CatalogDraft) {
    const data = {
      title: draft.title,
      artist: draft.artist,
      objectDate: draft.objectDate,
      creditLine: draft.creditLine,
      mediumDescription: draft.mediumDescription,
      medium: draft.medium,
      widthCm: draft.widthCm,
      heightCm: draft.heightCm,
      depthCm: draft.depthCm,
      imageUrl: draft.imageUrl,
      thumbnailUrl: draft.thumbnailUrl,
      priceAmount: draft.priceAmount,
      currency: draft.currency,
      syncedAt: new Date(),
    };
    return this.prisma.catalogArtwork.upsert({
      where: { source_sourceId: { source: 'met', sourceId: draft.sourceId } },
      update: data,
      create: { source: 'met', sourceId: draft.sourceId, ...data },
    });
  }
}

function present(row: CatalogArtwork): CatalogView {
  return {
    source: 'met',
    sourceId: row.sourceId,
    title: row.title,
    artist: row.artist,
    date: row.objectDate,
    creditLine: row.creditLine,
    mediumDescription: row.mediumDescription,
    medium: row.medium,
    widthCm: Number(row.widthCm),
    heightCm: Number(row.heightCm),
    depthCm: Number(row.depthCm),
    imageUrl: row.imageUrl,
    thumbnailUrl: row.thumbnailUrl,
    priceAmount: row.priceAmount.toString(),
    currency: row.currency.trim(),
  };
}
