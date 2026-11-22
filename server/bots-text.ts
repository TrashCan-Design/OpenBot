import { botSafetyDigest } from "./bot-safety-digest.ts";
import type { BotRecord } from "./store.ts";

export class BotsText {
  private readonly persisted: (bot: BotRecord) => unknown;
  private bots: readonly BotRecord[] = [];
  private texts: string[] = [];
  private digests: string[] = [];
  private known = false;
  private readonly named = new Set<string>();

  constructor(persisted: (bot: BotRecord) => unknown) {
    this.persisted = persisted;
  }

  /** `id`'s record or one of its threads changed: the next narrowed text serializes it again. */
  name(id: string): void {
    this.named.add(id);
  }

  forget(): void {
    this.known = false;
  }

  canNarrow(bots: readonly BotRecord[]): boolean {
    if (!this.known || bots.length !== this.bots.length) return false;
    for (let i = 0; i < bots.length; i++) if (bots[i] !== this.bots[i]) return false;
    return true;
  }

  /** JSON.stringify of the persisted list, byte for byte. `narrow` (after canNarrow) serializes only the named bots;
   * `commit` once the text is on disk makes it the last write. */
  build(bots: readonly BotRecord[], narrow: boolean): { text: string; commit: () => void } {
    const texts: string[] = narrow ? this.texts.slice() : [];
    const digests: string[] = [];
    for (let i = 0; i < bots.length; i++) {
      digests[i] = botSafetyDigest(bots[i]!);
      if (!narrow || this.named.has(bots[i]!.id) || digests[i] !== this.digests[i]) texts[i] = JSON.stringify(this.persisted(bots[i]!));
    }
    const named = [...this.named];
    return {
      text: `[${texts.join(",")}]`,
      commit: () => {
        this.bots = bots.slice();
        this.texts = texts;
        this.digests = digests;
        this.known = true;
        for (const id of named) this.named.delete(id);
      },
    };
  }
}
