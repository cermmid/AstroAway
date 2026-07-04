export interface NamedStar {
  name: string;
  hyg: number;
  raRad: number;
  decRad: number;
  mag: number;
  con: string;
}

/**
 * Compiled HYG catalog: stars.bin is a Float32Array of
 * [raRad, decRad, mag, colorIndex] per star, brightest first.
 */
export class StarCatalog {
  private constructor(
    readonly data: Float32Array,
    readonly named: NamedStar[],
  ) {}

  static async load(baseUrl = 'data/'): Promise<StarCatalog> {
    const [bin, index] = await Promise.all([
      fetch(`${baseUrl}stars.bin`).then((r) => r.arrayBuffer()),
      fetch(`${baseUrl}stars-index.json`).then((r) => r.json()),
    ]);
    return new StarCatalog(new Float32Array(bin), index.named as NamedStar[]);
  }

  get count(): number {
    return this.data.length / 4;
  }

  findNamed(name: string): NamedStar | undefined {
    return this.named.find((n) => n.name === name);
  }
}
