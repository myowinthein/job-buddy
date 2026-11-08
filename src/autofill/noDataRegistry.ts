export interface NoDataEntry {
  element: HTMLElement;
  fieldPath: string;
  confidence: number;
  identity: string;
}

/**
 * The matched-but-empty fields from the latest run, with the one
 * document-level visibilitychange listener that silently re-fills them when
 * the tab becomes visible again (for example after the user added the missing
 * data in the options page). Entries keep enough state to re-resolve the
 * profile path without re-running the scanner, mapper or confidence scoring.
 * `listen` and `stop` are idempotent, so the same handler is never added twice.
 */
export class NoDataRegistry {
  entries: NoDataEntry[] = [];
  private handler: (() => void) | null = null;

  constructor(private readonly onVisible: () => void) {}

  add(entry: NoDataEntry): void {
    this.entries.push(entry);
  }

  keepWhere(keep: (entry: NoDataEntry) => boolean): void {
    this.entries = this.entries.filter(keep);
  }

  /** Forgets every entry but leaves the listener, for a new scan that may track fields again. */
  reset(): void {
    this.entries = [];
  }

  /** Forgets every entry and stops listening. */
  clear(): void {
    this.reset();
    this.stop();
  }

  /** Stops listening once no entry is left to re-fill. */
  settle(): void {
    if (this.entries.length === 0) this.stop();
  }

  listen(): void {
    if (this.handler) return;
    this.handler = () => {
      if (document.visibilityState === 'visible') this.onVisible();
    };
    document.addEventListener('visibilitychange', this.handler);
  }

  stop(): void {
    if (!this.handler) return;
    document.removeEventListener('visibilitychange', this.handler);
    this.handler = null;
  }
}
