import { setTimeout as delay } from 'node:timers/promises';

import { env } from '../../config/env.js';
import {
  parseCartLinkResponse,
  parseProductDetailsResponse,
  parseProductSearchResponse,
} from './parsers.js';
import type {
  CartLinkItemInput,
  CartLinkResult,
  ProductDetails,
  ProductSearchParams,
  ProductSearchResult,
} from './types.js';

export interface VkusvillMcpTransport {
  call(method: string, payload: Record<string, unknown>, timeoutMs: number): Promise<string>;
}

export class VkusvillMcpClient {
  public constructor(private readonly transport: VkusvillMcpTransport) {}

  public async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    return this.withRetry(async () => {
      const response = await this.transport.call(
        'vkusvill_products_search',
        {
          q: params.query,
          sort: params.sort ?? 'popularity',
          page: params.page ?? 1,
        },
        env.VKUSVILL_MCP_TIMEOUT_MS,
      );

      return parseProductSearchResponse(response);
    });
  }

  public async getProductDetails(id: number): Promise<ProductDetails> {
    return this.withRetry(async () => {
      const response = await this.transport.call(
        'vkusvill_product_details',
        { id },
        env.VKUSVILL_MCP_TIMEOUT_MS,
      );

      return parseProductDetailsResponse(response);
    });
  }

  public async createCartLink(items: CartLinkItemInput[]): Promise<CartLinkResult> {
    return this.withRetry(async () => {
      const response = await this.transport.call(
        'vkusvill_cart_link_create',
        {
          products: items.map((item) => ({
            xml_id: item.xmlId,
            q: item.quantity,
          })),
        },
        env.VKUSVILL_MCP_TIMEOUT_MS,
      );

      return parseCartLinkResponse(response);
    });
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = env.VKUSVILL_MCP_RETRY_COUNT + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt >= maxAttempts) {
          break;
        }

        await delay(250 * attempt);
      }
    }

    throw lastError;
  }
}
