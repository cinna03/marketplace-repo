import { z } from 'zod';

export const addCartItemSchema = z.object({
  sourceId: z.string().regex(/^\d{1,12}$/),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(10),
});

export const checkoutSchema = z.object({
  addressId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});
