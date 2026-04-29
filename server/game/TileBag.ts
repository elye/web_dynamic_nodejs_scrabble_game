import { v4 as uuidv4 } from 'uuid';

export interface Tile {
  id: string;
  letter: string;
  points: number;
  isBlank: boolean;
  chosenLetter?: string;
}

const TILE_DISTRIBUTION: { letter: string; count: number; points: number }[] = [
  { letter: 'A', count: 9, points: 1 },
  { letter: 'B', count: 2, points: 3 },
  { letter: 'C', count: 2, points: 3 },
  { letter: 'D', count: 4, points: 2 },
  { letter: 'E', count: 12, points: 1 },
  { letter: 'F', count: 2, points: 4 },
  { letter: 'G', count: 3, points: 2 },
  { letter: 'H', count: 2, points: 4 },
  { letter: 'I', count: 9, points: 1 },
  { letter: 'J', count: 1, points: 8 },
  { letter: 'K', count: 1, points: 5 },
  { letter: 'L', count: 4, points: 1 },
  { letter: 'M', count: 2, points: 3 },
  { letter: 'N', count: 6, points: 1 },
  { letter: 'O', count: 8, points: 1 },
  { letter: 'P', count: 2, points: 3 },
  { letter: 'Q', count: 1, points: 10 },
  { letter: 'R', count: 6, points: 1 },
  { letter: 'S', count: 4, points: 1 },
  { letter: 'T', count: 6, points: 1 },
  { letter: 'U', count: 4, points: 1 },
  { letter: 'V', count: 2, points: 4 },
  { letter: 'W', count: 2, points: 4 },
  { letter: 'X', count: 1, points: 8 },
  { letter: 'Y', count: 2, points: 4 },
  { letter: 'Z', count: 1, points: 10 },
  { letter: '', count: 2, points: 0 },
];

export class TileBag {
  private tiles: Tile[] = [];

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    this.tiles = [];
    for (const dist of TILE_DISTRIBUTION) {
      for (let i = 0; i < dist.count; i++) {
        this.tiles.push({
          id: uuidv4(),
          letter: dist.letter,
          points: dist.points,
          isBlank: dist.letter === '',
        });
      }
    }
    this.shuffle();
  }

  private shuffle(): void {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  draw(count: number): Tile[] {
    const drawn = this.tiles.splice(0, Math.min(count, this.tiles.length));
    return drawn;
  }

  returnTiles(tiles: Tile[]): void {
    for (const tile of tiles) {
      if (tile.isBlank) {
        tile.chosenLetter = undefined;
      }
    }
    this.tiles.push(...tiles);
    this.shuffle();
  }

  remaining(): number {
    return this.tiles.length;
  }

  isEmpty(): boolean {
    return this.tiles.length === 0;
  }
}

export function getTilePoints(letter: string): number {
  const dist = TILE_DISTRIBUTION.find(d => d.letter === letter.toUpperCase());
  return dist ? dist.points : 0;
}
