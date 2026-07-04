import type { World } from '../data/schema';
import { CanvasPanel } from './CanvasPanel';

/**
 * The in-world knowledge panel: paged lore about the race/world, star facts,
 * and a "return to beach" button.
 */
export class InfoPanel extends CanvasPanel {
  private page = 0;

  constructor(private world: World) {
    super(1.35, 1.05, 1200);
    this.render();
  }

  private get pageCount(): number {
    return 1 + this.world.race.lore.length;
  }

  private render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.clear();
    const world = this.world;
    this.drawTitle(world.panel?.title ?? world.name);

    let y = 150;
    const x = 48;
    const maxW = w - 96;
    if (this.page === 0) {
      const s = world.star;
      const facts: string[] = [];
      if (world.panel?.showStarFacts !== false) {
        facts.push(`Gwiazda: ${s.name} (${s.constellation ?? '—'})`);
        facts.push(`Odległość: ${s.distanceLy} lat świetlnych`);
        if (s.spectral) facts.push(`Typ widmowy: ${s.spectral}`);
      }
      const r = world.race;
      facts.push(`Rasa: ${r.name}`);
      if (r.dimension) facts.push(`Wymiar: ${r.dimension}`);
      for (const f of facts) {
        y = this.drawText(f, x, y, maxW, '500 36px system-ui, sans-serif', 52);
      }
      if (r.appearance) {
        y += 16;
        y = this.drawText(r.appearance, x, y, maxW, 'italic 400 32px system-ui, sans-serif', 44, '#a9c4dd');
      }
      if (r.traits?.length) {
        y += 16;
        for (const t of r.traits) {
          y = this.drawText(`•  ${t}`, x, y, maxW, '400 32px system-ui, sans-serif', 44);
        }
      }
    } else {
      const section = world.race.lore[this.page - 1];
      y = this.drawText(section.heading, x, y, maxW, '600 40px system-ui, sans-serif', 54, '#9fd8ff');
      y += 10;
      y = this.drawText(section.text, x, y, maxW);
      if (this.page === this.pageCount - 1 && world.race.sources?.length) {
        y += 14;
        y = this.drawText(
          `Źródła: ${world.race.sources.join(' · ')}`,
          x,
          y,
          maxW,
          'italic 400 26px system-ui, sans-serif',
          36,
          '#7f99b5',
        );
      }
    }

    const by = h - 120;
    this.buttons = [
      { id: 'prev', x: 48, y: by, w: 110, h: 76, label: '◀' },
      { id: 'next', x: 174, y: by, w: 110, h: 76, label: '▶' },
      {
        id: 'return',
        x: w - 460,
        y: by,
        w: 412,
        h: 76,
        label: 'Powrót na plażę',
        accent: true,
      },
    ];
    this.drawButtons();
    this.ctx.fillStyle = '#7f99b5';
    this.ctx.font = '400 28px system-ui, sans-serif';
    this.ctx.fillText(`${this.page + 1} / ${this.pageCount}`, 320, by + 24);
    this.commit();
  }

  /** Handles a button id from hit(); returns 'return' when leaving. */
  press(buttonId: string): 'return' | null {
    if (buttonId === 'prev') {
      this.page = (this.page - 1 + this.pageCount) % this.pageCount;
      this.render();
    } else if (buttonId === 'next') {
      this.page = (this.page + 1) % this.pageCount;
      this.render();
    } else if (buttonId === 'return') return 'return';
    return null;
  }
}
