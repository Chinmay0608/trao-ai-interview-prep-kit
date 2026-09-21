export interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom?: string;
  anchorText?: string;
  pageTitle?: string;
  priority: number;
}

/**
 * Priority queue for best-first crawling.
 * Always pops the item with the highest priority score.
 * Uses canonical URL ascending as a deterministic tie-breaker.
 */
export class UrlQueue {
  private items: QueueItem[] = [];
  private queuedUrls = new Set<string>();

  public push(item: QueueItem): void {
    if (this.queuedUrls.has(item.url)) {
      return;
    }
    this.queuedUrls.add(item.url);

    // Insert while maintaining sorted order (or push and sort)
    this.items.push(item);
    this.items.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.url.localeCompare(b.url);
    });
  }

  public pop(): QueueItem | undefined {
    return this.items.shift();
  }

  public peek(): QueueItem | undefined {
    return this.items[0];
  }

  public has(url: string): boolean {
    return this.queuedUrls.has(url);
  }

  public size(): number {
    return this.items.length;
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }
}
