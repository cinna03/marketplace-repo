/**
 * Pull public-domain Met paintings that already have an image and centimetre
 * measurements, using the same acceptance rules as the shop. Writes the id
 * list, the phone catalogue, and the shop colour/subject guides.
 *
 * The two non-public-domain Monets stay out. The original eleven keep the
 * guides already written by hand. New guides are a shop filing: subject from
 * the title and museum tags, colour from the thumbnail's average, not a
 * reading of the paint.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { mapMetObject, rejectionReason, type MetObject } from '../src/catalog/met/map-met-object';

const require = createRequire('/tmp/imgdecode/package.json');
const jpeg = require('jpeg-js') as {
  decode: (data: Buffer, opts: { useTArray: boolean; formatAsRGBA: boolean }) => { width: number; height: number; data: Uint8Array };
};
const { PNG } = require('pngjs') as { PNG: { sync: { read: (data: Buffer) => { width: number; height: number; data: Uint8Array } } } };

const BASE = 'https://collectionapi.metmuseum.org/public/collection/v1/';
const HEADERS = {
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};
const TARGET = 500;
const ARTIST_CAP = 12;
const EXCLUDED = new Set([437127, 437133]);
const STARTER = [10065, 436535, 436532, 436528, 436524, 437881, 435809, 437394, 436575, 12127, 11417];

const HAND_COLOUR: Record<string, string> = {
  '436535': 'gold', '436532': 'blue', '436528': 'green', '436524': 'earth',
  '437881': 'red', '435809': 'dark', '437394': 'pale', '436575': 'gold',
  '12127': 'earth', '11417': 'blue', '10065': 'red',
};
const HAND_SUBJECT: Record<string, string> = {
  '437394': 'figure', '436528': 'flowers', '12127': 'figure', '10065': 'figure',
  '436532': 'figure', '436524': 'flowers', '435809': 'landscape', '436575': 'landscape',
  '11417': 'figure', '436535': 'landscape', '437881': 'figure',
};

type Tagged = MetObject & { tags?: { term?: string | null }[] | null };

type Row = {
  source: 'met';
  sourceId: string;
  title: string;
  artist: string;
  date: string;
  creditLine: string;
  mediumDescription: string;
  medium: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  imageUrl: string;
  thumbnailUrl: string;
  priceAmount: string;
  currency: 'USD';
  colourGuide: string;
  subjectGuide: string;
};

const STATE_PATH = '/tmp/met-harvest-state.json';

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (response.status === 404) return null;
      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        await delay(900 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.log('retry', url, error instanceof Error ? error.message : error);
      await delay(1000 * (attempt + 1));
    }
  }
  console.log('gave up', url);
  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function candidateIds(): Promise<number[]> {
  const ordered: number[] = [...STARTER];
  const seen = new Set<number>(STARTER);
  function add(id: number) {
    if (EXCLUDED.has(id) || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  }
  // The old /search route was retired. Department lists still return every id.
  // European Paintings first, then Modern Art and the Lehman collection.
  for (const departmentId of [11]) {
    const page = (await getJson(`${BASE}objects?departmentIds=${departmentId}`)) as { objectIDs?: number[] };
    for (const id of page.objectIDs ?? []) add(id);
    console.log('department', departmentId, page.objectIDs?.length ?? 0);
  }
  console.log('unique candidates', ordered.length);
  return ordered;
}

function subjectFrom(title: string, tags: string[]): string {
  const text = `${title} ${tags.join(' ')}`.toLowerCase();
  if (/flower|bouquet|sunflower|iris|blossom|still life|fruit|vase/.test(text)) return 'flowers';
  if (/landscape|seascape|harbor|harbour|mountain|river|forest|meadow|cityscape|view of|countryside/.test(text)) return 'landscape';
  if (/portrait|self-portrait|figure|woman|lady|gentleman|bather|nude|family|child/.test(text)) return 'figure';
  return 'picture';
}

function bucket(red: number, green: number, blue: number): string {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  const chroma = max - min;
  if (light < 55) return 'dark';
  if (chroma < 28 && light > 170) return 'pale';
  if (chroma < 28) return 'earth';
  let hue = 0;
  if (chroma > 0) {
    if (max === red) hue = ((green - blue) / chroma) % 6;
    else if (max === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  if (hue < 40 || hue >= 345) return light > 140 ? 'earth' : 'red';
  if (hue < 70) return 'gold';
  if (hue < 170) return 'green';
  if (hue < 260) return 'blue';
  return 'red';
}

async function colourFrom(url: string): Promise<string> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(url, { headers: HEADERS });
    if (response.ok) break;
    if (response.status !== 403 && response.status !== 429 && response.status < 500) return 'earth';
    await delay(700 * (attempt + 1));
  }
  if (!response?.ok) return 'earth';
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') ?? '';
  let width = 0;
  let height = 0;
  let data: Uint8Array;
  if (type.includes('png') || bytes[0] === 0x89) {
    const png = PNG.sync.read(bytes);
    width = png.width;
    height = png.height;
    data = png.data;
  } else {
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    width = decoded.width;
    height = decoded.height;
    data = decoded.data;
  }
  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const index = (y * width + x) * 4;
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      count += 1;
    }
  }
  if (!count) return 'earth';
  return bucket(red / count, green / count, blue / count);
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R | null>, onDone: (done: number) => void, stop?: () => boolean): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  let done = 0;
  async function run() {
    while (cursor < items.length && !stop?.()) {
      const index = cursor++;
      const value = await worker(items[index]);
      done += 1;
      if (value) results.push(value);
      if (done % 40 === 0) onDone(done);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => run()));
  return results;
}

function remember(accepted: Row[]) {
  writeFileSync(STATE_PATH, JSON.stringify(accepted));
}

async function main() {
  const ids = await candidateIds();
  const perArtist = new Map<string, number>();
  const accepted: Row[] = existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, 'utf8')) as Row[]) : [];
  const have = new Set(accepted.map((row) => row.sourceId));
  for (const row of accepted) {
    const artist = row.artist || 'Unknown artist';
    perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
  }
  console.log('resumed', accepted.length);

  await mapPool(ids, 2, async (objectId) => {
    if (have.has(String(objectId)) || accepted.length >= TARGET + 20) return null;
    await delay(250);
    let artwork: Tagged | null = null;
    try {
      artwork = (await getJson(`${BASE}objects/${objectId}`)) as Tagged | null;
    } catch (error) {
      console.log('skip', objectId, error instanceof Error ? error.message : error);
      return null;
    }
    if (!artwork) return null;
    const reason = rejectionReason(artwork);
    if (reason) return null;
    const draft = mapMetObject(artwork);
    if (!draft) return null;
    if (draft.widthCm < 8 || draft.heightCm < 8 || draft.widthCm > 800 || draft.heightCm > 800) return null;
    const artist = draft.artist || 'Unknown artist';
    const count = perArtist.get(artist) ?? 0;
    if (count >= ARTIST_CAP && !STARTER.includes(objectId)) return null;
    perArtist.set(artist, count + 1);
    const tags = (artwork.tags ?? []).map((tag) => tag.term ?? '').filter(Boolean);
    accepted.push({
      source: 'met',
      sourceId: draft.sourceId,
      title: draft.title,
      artist: draft.artist,
      date: draft.objectDate,
      creditLine: draft.creditLine,
      mediumDescription: draft.mediumDescription,
      medium: draft.medium,
      widthCm: draft.widthCm,
      heightCm: draft.heightCm,
      depthCm: draft.depthCm,
      imageUrl: draft.imageUrl,
      thumbnailUrl: draft.thumbnailUrl,
      priceAmount: draft.priceAmount.toString(),
      currency: 'USD',
      colourGuide: HAND_COLOUR[draft.sourceId] ?? '',
      subjectGuide: HAND_SUBJECT[draft.sourceId] ?? subjectFrom(draft.title, tags),
    });
    have.add(draft.sourceId);
    if (accepted.length % 25 === 0) remember(accepted);
    return draft.sourceId;
  }, (done) => console.log('checked', done, 'accepted', accepted.length), () => accepted.length >= TARGET + 20);

  remember(accepted);
  console.log('accepted before colour', accepted.length);
  if (accepted.length < TARGET) {
    throw new Error(`Only ${accepted.length} paintings passed. Need ${TARGET}.`);
  }
  const starterRows = accepted.filter((row) => STARTER.includes(Number(row.sourceId)));
  const rest = accepted.filter((row) => !STARTER.includes(Number(row.sourceId)));
  rest.sort((left, right) => left.title.localeCompare(right.title));
  const chosen = [...starterRows, ...rest].slice(0, TARGET);

  let coloured = 0;
  await mapPool(chosen.filter((row) => !row.colourGuide), 2, async (row) => {
    await delay(200);
    try {
      row.colourGuide = await colourFrom(row.thumbnailUrl);
    } catch (error) {
      row.colourGuide = 'earth';
      console.log('colour failed', row.sourceId, error instanceof Error ? error.message : error);
    }
    coloured += 1;
    if (coloured % 25 === 0) {
      remember(chosen);
      console.log('coloured', coloured);
    }
    return row.sourceId;
  }, () => undefined);

  const phone = '/Users/cikirezi/cinnarios/Assets/StreamingAssets/shop';
  const list = JSON.stringify(chosen);
  writeFileSync(`${phone}/catalog-list.json`, list);
  writeFileSync(`${phone}/catalog.json`, JSON.stringify({ artworks: chosen }));
  const idList = chosen.map((row) => row.sourceId).join(',\n  ');
  writeFileSync(
    '/Users/cikirezi/marketplace-repo/apps/api/src/catalog/curated-met-ids.ts',
    `/** Public-domain Met paintings with an image and centimetre measurements. 437127 and 437133 stay out. */\nexport const CURATED_MET_OBJECT_IDS = [\n  ${idList},\n] as const;\n`,
  );
  const colour: Record<string, string> = {};
  const subject: Record<string, string> = {};
  for (const row of chosen) {
    colour[row.sourceId] = row.colourGuide || 'earth';
    subject[row.sourceId] = row.subjectGuide || 'picture';
  }
  const guides = `window.SHOP_GUIDES = ${JSON.stringify({ colour, subject })};\n`;
  writeFileSync('/Users/cikirezi/marketplace-repo/apps/web/guides.js', guides);
  writeFileSync(`${phone}/guides.js`, guides);
  console.log('wrote', chosen.length);

  const prisma = new PrismaClient();
  try {
    for (const row of chosen) {
      const data = {
        title: row.title,
        artist: row.artist,
        objectDate: row.date,
        creditLine: row.creditLine,
        mediumDescription: row.mediumDescription,
        medium: row.medium as 'canvas' | 'wood_panel' | 'paper' | 'other',
        widthCm: row.widthCm,
        heightCm: row.heightCm,
        depthCm: row.depthCm,
        imageUrl: row.imageUrl,
        thumbnailUrl: row.thumbnailUrl,
        priceAmount: BigInt(row.priceAmount),
        currency: row.currency,
        syncedAt: new Date(),
      };
      await prisma.catalogArtwork.upsert({
        where: { source_sourceId: { source: 'met', sourceId: row.sourceId } },
        update: data,
        create: { source: 'met', sourceId: row.sourceId, ...data },
      });
    }
    console.log('database updated');
  } catch (error) {
    console.log('database skipped', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
