export type ProductSearchSort = 'popularity' | 'rating' | 'price_asc' | 'price_desc' | 'new';

export interface ProductSearchParams {
  query: string;
  sort?: ProductSearchSort;
  page?: number;
}

export interface ProductSearchResultItem {
  id: number;
  xmlId: number;
  name: string;
  description: string | null;
  priceCurrent: number | null;
  priceOld: number | null;
  currency: string | null;
  unit: string | null;
  weightValue: number | null;
  weightUnit: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  url: string | null;
}

export interface ProductSearchResult {
  query: string;
  page: number;
  total: number;
  hasMore: boolean;
  items: ProductSearchResultItem[];
}

export interface ProductDetails extends ProductSearchResultItem {
  slug: string | null;
  composition: string | null;
  nutrition: string | null;
}

export interface CartLinkItemInput {
  xmlId: number;
  quantity: number;
}

export interface CartLinkResult {
  link: string;
}
