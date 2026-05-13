import { env } from '../../config/env.js';
import { VkusvillMcpHttpTransport } from './http-transport.js';

export function createVkusvillMcpHttpTransport(): VkusvillMcpHttpTransport | null {
  if (env.VKUSVILL_MCP_BASE_URL == null) {
    return null;
  }

  return new VkusvillMcpHttpTransport(env.VKUSVILL_MCP_BASE_URL, env.VKUSVILL_MCP_API_KEY);
}
