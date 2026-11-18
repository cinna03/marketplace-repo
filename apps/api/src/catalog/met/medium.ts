export type PaintingMediumName = 'canvas' | 'wood_panel' | 'paper' | 'other';

const WOOD_WORDS = ['wood', 'panel', 'oak', 'poplar', 'walnut', 'linden', 'lime'];

export function parseMedium(medium: string | null | undefined): PaintingMediumName {
  if (!medium?.trim()) return 'other';
  const text = medium.toLowerCase();
  if (text.includes('canvas')) return 'canvas';
  if (WOOD_WORDS.some((word) => text.includes(word))) return 'wood_panel';
  if (text.includes('paper') || text.includes('watercolor') || text.includes('vellum') || text.includes('parchment')) {
    return 'paper';
  }
  return 'other';
}

export function defaultDepthCm(medium: PaintingMediumName): number {
  if (medium === 'wood_panel') return 1;
  if (medium === 'paper') return 0.1;
  return 2;
}
