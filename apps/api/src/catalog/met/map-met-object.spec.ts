import { mapMetObject, MetObject, rejectionReason } from './map-met-object';

function painting(overrides: Partial<MetObject> = {}): MetObject {
  return {
    objectID: 436535,
    isPublicDomain: true,
    primaryImage: 'https://images.metmuseum.org/full.jpg',
    primaryImageSmall: 'https://images.metmuseum.org/small.jpg',
    title: 'Wheat Field with Cypresses',
    artistDisplayName: 'Vincent van Gogh',
    objectDate: '1889',
    medium: 'Oil on canvas',
    classification: 'Paintings',
    creditLine: 'Purchase, The Annenberg Foundation Gift, 1993',
    measurements: [
      { elementName: 'Frame', elementMeasurements: { Height: 100, Width: 120, Depth: 8 } },
      { elementName: 'Overall', elementMeasurements: { Height: 73, Width: 93.4 } },
    ],
    ...overrides,
  };
}

describe('mapMetObject', () => {
  it('uses the painting size, ignores the frame, and prices the canvas', () => {
    const mapped = mapMetObject(painting());
    expect(mapped).toMatchObject({
      sourceId: '436535',
      medium: 'canvas',
      widthCm: 93.4,
      heightCm: 73,
      depthCm: 2,
      creditLine: 'The Metropolitan Museum of Art, New York, Purchase, The Annenberg Foundation Gift, 1993',
      currency: 'USD',
    });
    expect(mapped?.priceAmount).toBeGreaterThan(0n);
  });

  it('rejects a work that is not a public-domain painting', () => {
    expect(rejectionReason(painting({ isPublicDomain: false }))).toBe('not in the public domain');
    expect(rejectionReason(painting({ classification: 'Sculpture', objectName: 'Statue' }))).toBe(
      'not classified as a painting',
    );
  });
});
