import { z } from 'zod';
import { JOURNEY_KINDS } from './confidence';

const countryCode = z.string().regex(/^[A-Z]{2}$/);

export const updateCollectorSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    city: z.string().trim().min(1).max(120).nullable(),
    countryCode: countryCode.nullable(),
  })
  .partial();

export const createArtistSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(2000).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  countryCode: countryCode.optional(),
  website: z.string().trim().url().max(300).optional(),
});

export const updateArtistSchema = createArtistSchema.partial();

const artworkKinds = [
  'artwork_viewed',
  'dimensions_checked',
  'credit_reviewed',
  'viewed_in_room',
  'checkout_started',
  'checkout_abandoned',
  'purchase_completed',
] as const;

export const journeyEventSchema = z
  .object({
    kind: z.enum(JOURNEY_KINDS),
    sourceId: z.string().regex(/^\d{1,12}$/).optional(),
    sessionId: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    if ((artworkKinds as readonly string[]).includes(value.kind) && !value.sourceId) {
      context.addIssue({ code: 'custom', path: ['sourceId'], message: 'This event needs the Met object id.' });
    }
  });
