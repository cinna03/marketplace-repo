import { priceCentsFor } from './area-pricing';
import { defaultDepthCm, parseMedium } from './medium';
import { MetMeasurement, selectPaintingSize } from './measurements';

const MET_CREDIT_PREFIX = 'The Metropolitan Museum of Art, New York, ';

export type MetObject = {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage?: string | null;
  primaryImageSmall?: string | null;
  title?: string | null;
  artistDisplayName?: string | null;
  objectDate?: string | null;
  medium?: string | null;
  classification?: string | null;
  objectName?: string | null;
  creditLine?: string | null;
  measurements?: MetMeasurement[] | null;
};

export type CatalogDraft = {
  sourceId: string;
  title: string;
  artist: string;
  objectDate: string;
  creditLine: string;
  mediumDescription: string;
  medium: ReturnType<typeof parseMedium>;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  imageUrl: string;
  thumbnailUrl: string;
  priceAmount: bigint;
  currency: 'USD';
};

export function rejectionReason(artwork: MetObject): string | null {
  if (!artwork.isPublicDomain) return 'not in the public domain';
  const kind = `${artwork.classification ?? ''} ${artwork.objectName ?? ''}`;
  if (!kind.toLowerCase().includes('painting')) return 'not classified as a painting';
  if (!artwork.primaryImage?.trim()) return 'no image available';
  if (!selectPaintingSize(artwork.measurements)) return 'no usable width and height';
  if (!artwork.title?.trim()) return 'missing title';
  return null;
}

export function mapMetObject(artwork: MetObject): CatalogDraft | null {
  if (rejectionReason(artwork)) return null;
  const size = selectPaintingSize(artwork.measurements);
  if (!size?.Width || !size.Height) return null;

  const medium = parseMedium(artwork.medium);
  const depthCm = size.Depth && size.Depth > 0 ? size.Depth : defaultDepthCm(medium);
  const imageUrl = artwork.primaryImage!.trim();

  return {
    sourceId: String(artwork.objectID),
    title: artwork.title!.trim(),
    artist: artwork.artistDisplayName?.trim() ?? '',
    objectDate: artwork.objectDate?.trim() ?? '',
    creditLine: MET_CREDIT_PREFIX + (artwork.creditLine?.trim() ?? ''),
    mediumDescription: artwork.medium?.trim() ?? '',
    medium,
    widthCm: size.Width,
    heightCm: size.Height,
    depthCm,
    imageUrl,
    thumbnailUrl: artwork.primaryImageSmall?.trim() || imageUrl,
    priceAmount: priceCentsFor(size.Width, size.Height),
    currency: 'USD',
  };
}
