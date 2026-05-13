export interface TelegramUpdateDeduplicator {
  shouldProcess(updateId: number): boolean;
}

export class InMemoryTelegramUpdateDeduplicator implements TelegramUpdateDeduplicator {
  private readonly seenIds = new Set<number>();
  private readonly order: number[] = [];

  public constructor(private readonly maxSize = 1000) {}

  public shouldProcess(updateId: number): boolean {
    if (this.seenIds.has(updateId)) {
      return false;
    }

    this.seenIds.add(updateId);
    this.order.push(updateId);
    this.evictOverflow();

    return true;
  }

  private evictOverflow(): void {
    while (this.order.length > this.maxSize) {
      const oldestId = this.order.shift();

      if (oldestId != null) {
        this.seenIds.delete(oldestId);
      }
    }
  }
}
