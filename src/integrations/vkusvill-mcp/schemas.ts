import { z } from 'zod';

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();

const priceSchema = z.object({
  current: nullableNumber,
  currency: nullableString,
  old: nullableNumber,
});

const weightSchema = z
  .object({
    value: nullableNumber,
    unit: nullableString,
  })
  .nullable();

const ratingSchema = z.object({
  average: nullableNumber,
  count: z.number().int().nullable(),
});

const propertiesSchema = z
  .array(
    z.object({
      name: z.string(),
      value: z.string().nullable(),
    }),
  )
  .default([]);

export const productItemSchema = z.object({
  id: z.number().int(),
  xml_id: z.number().int(),
  name: z.string(),
  slug: z.string().nullable().optional(),
  description: z.string().nullable(),
  price: priceSchema,
  unit: nullableString,
  weight: weightSchema.optional(),
  rating: ratingSchema,
  url: nullableString,
  properties: propertiesSchema.optional(),
});

export const productSearchEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    meta: z.object({
      q: z.string(),
      page: z.number().int(),
      total: z.number().int(),
      has_more: z.boolean(),
    }),
    items: z.array(productItemSchema),
  }),
});

export const productDetailsEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: productItemSchema,
});

export const cartLinkEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    link: z.string().url(),
  }),
});
