export interface TelegramClient {
  sendMessage(chatId: number, text: string): Promise<void>;
}

export interface TelegramWebhookInfo {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate?: number;
  lastErrorMessage?: string;
}

export interface TelegramWebhookAdminClient {
  setWebhook(params: { url: string; secretToken?: string }): Promise<void>;
  getWebhookInfo(): Promise<TelegramWebhookInfo>;
  deleteWebhook(): Promise<void>;
}

type FetchLike = typeof fetch;

export class TelegramHttpClient implements TelegramClient, TelegramWebhookAdminClient {
  public constructor(
    private readonly botToken: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  public async sendMessage(chatId: number, text: string): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text,
    });
  }

  public async setWebhook(params: { url: string; secretToken?: string }): Promise<void> {
    const payload =
      params.secretToken == null
        ? {
            url: params.url,
          }
        : {
            url: params.url,
            secret_token: params.secretToken,
          };

    await this.call('setWebhook', payload);
  }

  public async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    const result = await this.call<{
      has_custom_certificate: boolean;
      last_error_date?: number;
      last_error_message?: string;
      pending_update_count: number;
      url: string;
    }>('getWebhookInfo');

    return {
      url: result.url,
      hasCustomCertificate: result.has_custom_certificate,
      pendingUpdateCount: result.pending_update_count,
      ...(result.last_error_date == null ? {} : { lastErrorDate: result.last_error_date }),
      ...(result.last_error_message == null ? {} : { lastErrorMessage: result.last_error_message }),
    };
  }

  public async deleteWebhook(): Promise<void> {
    await this.call('deleteWebhook');
  }

  private async call<T = true>(method: string, payload?: Record<string, unknown>): Promise<T> {
    const response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.botToken}/${method}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload ?? {}),
      },
    );

    if (!response.ok) {
      throw new Error(`Telegram API responded with status ${response.status} for ${method}.`);
    }

    const body = (await response.json()) as
      | {
          ok: true;
          result: T;
        }
      | {
          ok: false;
          description?: string;
        };

    if (!body.ok) {
      throw new Error(body.description ?? `Telegram API request ${method} failed.`);
    }

    return body.result;
  }
}

export class DisabledTelegramClient implements TelegramClient {
  public async sendMessage(): Promise<void> {}
}
