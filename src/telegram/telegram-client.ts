export interface TelegramClient {
  sendMessage(chatId: number, text: string): Promise<void>;
}

export class TelegramHttpClient implements TelegramClient {
  public constructor(private readonly botToken: string) {}

  public async sendMessage(chatId: number, text: string): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API responded with status ${response.status}.`);
    }
  }
}

export class DisabledTelegramClient implements TelegramClient {
  public async sendMessage(): Promise<void> {}
}
