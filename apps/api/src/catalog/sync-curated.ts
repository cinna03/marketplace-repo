import { PrismaClient } from '@prisma/client';
import { CURATED_MET_OBJECT_IDS } from './curated-met-ids';
import { mapMetObject, rejectionReason } from './met/map-met-object';
import { MetCollectionClient } from './met/met-client';

const prisma = new PrismaClient();
const met = new MetCollectionClient();

async function main() {
  const imported: string[] = [];
  const skipped: { id: number; reason: string }[] = [];

  for (const objectId of CURATED_MET_OBJECT_IDS) {
    const artwork = await met.getObject(objectId);
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
    await prisma.catalogArtwork.upsert({
      where: { source_sourceId: { source: 'met', sourceId: draft.sourceId } },
      update: draftFields(draft),
      create: { source: 'met', sourceId: draft.sourceId, ...draftFields(draft) },
    });
    imported.push(`${draft.sourceId} ${draft.title}`);
  }

  console.log(JSON.stringify({ imported, skipped }, null, 2));
}

function draftFields(draft: NonNullable<ReturnType<typeof mapMetObject>>) {
  return {
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
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
