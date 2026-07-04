import type { KnowledgeIndex, World } from './schema';
import { validateWorld } from './schema';

/** Loads and serves the data-driven catalog of worlds/races. */
export class KnowledgeBase {
  private worlds = new Map<string, World>();

  static async load(baseUrl = 'data/'): Promise<KnowledgeBase> {
    const kb = new KnowledgeBase();
    const index: KnowledgeIndex = await (await fetch(`${baseUrl}index.json`)).json();
    const files = await Promise.all(
      index.worlds.map(async (path) => (await fetch(`${baseUrl}${path}`)).json()),
    );
    for (const raw of files) {
      const errors = validateWorld(raw);
      if (errors.length) {
        console.error(`Invalid world file skipped:`, errors, raw);
        continue;
      }
      const world = raw as World;
      kb.worlds.set(world.id, world);
    }
    return kb;
  }

  getWorld(id: string): World | undefined {
    return this.worlds.get(id);
  }

  /** Worlds selectable from the beach sky. */
  getDestinations(): World[] {
    return [...this.worlds.values()];
  }
}
