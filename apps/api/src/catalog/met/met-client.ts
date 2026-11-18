import { MetObject } from './map-met-object';

const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/';

export class MetCollectionClient {
  async getObject(objectId: number): Promise<MetObject | null> {
    const response = await fetch(`${BASE_URL}objects/${objectId}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'marketplace-catalog' },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Met object ${objectId} returned ${response.status}`);
    }
    return (await response.json()) as MetObject;
  }
}
