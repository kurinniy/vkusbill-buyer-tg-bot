export type FetchHeaders = {
  authorization?: string;
} & Record<string, string>;

export type FetchLike = (
  input: string,
  init?: {
    body?: string;
    headers?: FetchHeaders;
    method?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export class VkusvillMcpHttpTransport {
  public constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  public async call(
    method: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<string> {
    const response = await this.fetchImpl(this.baseUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.apiKey == null ? {} : { authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        method,
        payload,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Vkusvill MCP gateway responded with status ${response.status} for method ${method}.`,
      );
    }

    return response.text();
  }
}
