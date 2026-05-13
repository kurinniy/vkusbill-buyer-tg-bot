import {
  cartLinkEnvelopeSchema,
  productDetailsEnvelopeSchema,
  type productItemSchema,
  productSearchEnvelopeSchema,
} from './schemas.js';
import type {
  CartLinkResult,
  ProductDetails,
  ProductSearchResult,
  ProductSearchResultItem,
} from './types.js';

function extractProperty(
  item: ReturnType<typeof productItemSchema.parse>,
  propertyName: string,
): string | null {
  const match = item.properties?.find((property) => property.name === propertyName);
  return match?.value ?? null;
}

function normalizeProductItem(
  item: ReturnType<typeof productItemSchema.parse>,
): ProductSearchResultItem {
  return {
    id: item.id,
    xmlId: item.xml_id,
    name: item.name,
    description: item.description,
    priceCurrent: item.price.current,
    priceOld: item.price.old,
    currency: item.price.currency,
    unit: item.unit,
    weightValue: item.weight?.value ?? null,
    weightUnit: item.weight?.unit ?? null,
    ratingAverage: item.rating.average,
    ratingCount: item.rating.count,
    url: item.url,
  };
}

export function parseProductSearchResponse(raw: string): ProductSearchResult {
  const parsed = productSearchEnvelopeSchema.parse(JSON.parse(raw));

  return {
    query: parsed.data.meta.q,
    page: parsed.data.meta.page,
    total: parsed.data.meta.total,
    hasMore: parsed.data.meta.has_more,
    items: parsed.data.items.map(normalizeProductItem),
  };
}

export function parseProductDetailsResponse(raw: string): ProductDetails {
  const parsed = productDetailsEnvelopeSchema.parse(JSON.parse(raw));
  const normalized = normalizeProductItem(parsed.data);

  return {
    ...normalized,
    slug: parsed.data.slug ?? null,
    composition: extractProperty(parsed.data, 'Состав'),
    nutrition: extractProperty(parsed.data, 'Пищевая и энергетическая ценность в 100 г'),
  };
}

export function parseCartLinkResponse(raw: string): CartLinkResult {
  const parsed = cartLinkEnvelopeSchema.parse(JSON.parse(raw));

  return {
    link: parsed.data.link,
  };
}
