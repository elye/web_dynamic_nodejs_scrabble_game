import { Tile } from './TileBag';

export type PremiumType = 'TW' | 'DW' | 'TL' | 'DL' | null;

export interface BoardCell {
  tile: Tile | null;
  premium: PremiumType;
  row: number;
  col: number;
}

export interface PlacedTile {
  tile: Tile;
  row: number;
  col: number;
}

export interface WordFound {
  word: string;
  tiles: { tile: Tile; row: number; col: number; isNew: boolean }[];
  startRow: number;
  startCol: number;
  direction: 'horizontal' | 'vertical';
}

// Standard Scrabble premium square layout
const PREMIUM_LAYOUT: { [key: string]: PremiumType } = {};

function initPremiumLayout(): void {
  // Triple Word scores
  const twPositions = [
    [0,0],[0,7],[0,14],
    [7,0],[7,14],
    [14,0],[14,7],[14,14],
  ];
  
  // Double Word scores
  const dwPositions = [
    [1,1],[2,2],[3,3],[4,4],
    [1,13],[2,12],[3,11],[4,10],
    [13,1],[12,2],[11,3],[10,4],
    [13,13],[12,12],[11,11],[10,10],
    [7,7], // center star
  ];
  
  // Triple Letter scores
  const tlPositions = [
    [1,5],[1,9],
    [5,1],[5,5],[5,9],[5,13],
    [9,1],[9,5],[9,9],[9,13],
    [13,5],[13,9],
  ];
  
  // Double Letter scores
  const dlPositions = [
    [0,3],[0,11],
    [2,6],[2,8],
    [3,0],[3,7],[3,14],
    [6,2],[6,6],[6,8],[6,12],
    [7,3],[7,11],
    [8,2],[8,6],[8,8],[8,12],
    [11,0],[11,7],[11,14],
    [12,6],[12,8],
    [14,3],[14,11],
  ];
  
  for (const [r, c] of twPositions) PREMIUM_LAYOUT[`${r},${c}`] = 'TW';
  for (const [r, c] of dwPositions) PREMIUM_LAYOUT[`${r},${c}`] = 'DW';
  for (const [r, c] of tlPositions) PREMIUM_LAYOUT[`${r},${c}`] = 'TL';
  for (const [r, c] of dlPositions) PREMIUM_LAYOUT[`${r},${c}`] = 'DL';
}

initPremiumLayout();

export class Board {
  cells: BoardCell[][];
  
  constructor() {
    this.cells = [];
    for (let r = 0; r < 15; r++) {
      this.cells[r] = [];
      for (let c = 0; c < 15; c++) {
        this.cells[r][c] = {
          tile: null,
          premium: PREMIUM_LAYOUT[`${r},${c}`] || null,
          row: r,
          col: c,
        };
      }
    }
  }

  getCell(row: number, col: number): BoardCell | null {
    if (row < 0 || row > 14 || col < 0 || col > 14) return null;
    return this.cells[row][col];
  }

  placeTile(tile: Tile, row: number, col: number): boolean {
    if (row < 0 || row > 14 || col < 0 || col > 14) return false;
    if (this.cells[row][col].tile !== null) return false;
    this.cells[row][col].tile = tile;
    return true;
  }

  removeTile(row: number, col: number): Tile | null {
    if (row < 0 || row > 14 || col < 0 || col > 14) return null;
    const tile = this.cells[row][col].tile;
    this.cells[row][col].tile = null;
    return tile;
  }

  isEmpty(): boolean {
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (this.cells[r][c].tile !== null) return false;
      }
    }
    return true;
  }

  hasAdjacentTile(row: number, col: number, excludePositions: Set<string>): boolean {
    const directions = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of directions) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15) {
        if (this.cells[nr][nc].tile !== null && !excludePositions.has(`${nr},${nc}`)) {
          return true;
        }
      }
    }
    return false;
  }

  validatePlacement(placements: PlacedTile[]): { valid: boolean; error?: string } {
    if (placements.length === 0) {
      return { valid: false, error: 'No tiles placed' };
    }

    // Check all cells are empty
    for (const p of placements) {
      if (p.row < 0 || p.row > 14 || p.col < 0 || p.col > 14) {
        return { valid: false, error: 'Tile placement out of bounds' };
      }
      if (this.cells[p.row][p.col].tile !== null) {
        return { valid: false, error: 'Cell already occupied' };
      }
    }

    // Check all tiles are in same row or same column
    const rows = new Set(placements.map(p => p.row));
    const cols = new Set(placements.map(p => p.col));
    const isHorizontal = rows.size === 1;
    const isVertical = cols.size === 1;

    if (!isHorizontal && !isVertical) {
      return { valid: false, error: 'Tiles must be placed in a single row or column' };
    }

    // Check tiles are contiguous (considering existing tiles)
    const placedSet = new Set(placements.map(p => `${p.row},${p.col}`));
    
    if (isHorizontal) {
      const row = placements[0].row;
      const minCol = Math.min(...placements.map(p => p.col));
      const maxCol = Math.max(...placements.map(p => p.col));
      for (let c = minCol; c <= maxCol; c++) {
        if (!placedSet.has(`${row},${c}`) && this.cells[row][c].tile === null) {
          return { valid: false, error: 'Tiles must form a contiguous line' };
        }
      }
    } else {
      const col = placements[0].col;
      const minRow = Math.min(...placements.map(p => p.row));
      const maxRow = Math.max(...placements.map(p => p.row));
      for (let r = minRow; r <= maxRow; r++) {
        if (!placedSet.has(`${r},${col}`) && this.cells[r][col].tile === null) {
          return { valid: false, error: 'Tiles must form a contiguous line' };
        }
      }
    }

    // First move must cover center
    if (this.isEmpty()) {
      if (!placedSet.has('7,7')) {
        return { valid: false, error: 'First word must cover the center square' };
      }
      if (placements.length < 2) {
        return { valid: false, error: 'First word must be at least 2 letters' };
      }
      return { valid: true };
    }

    // Subsequent moves must connect to existing tiles
    let connects = false;
    for (const p of placements) {
      if (this.hasAdjacentTile(p.row, p.col, placedSet)) {
        connects = true;
        break;
      }
    }

    if (!connects) {
      return { valid: false, error: 'Word must connect to existing tiles' };
    }

    return { valid: true };
  }

  findWordsFormed(placements: PlacedTile[]): WordFound[] {
    // Temporarily place tiles
    for (const p of placements) {
      this.cells[p.row][p.col].tile = p.tile;
    }

    const placedSet = new Set(placements.map(p => `${p.row},${p.col}`));
    const words: WordFound[] = [];

    const rows = new Set(placements.map(p => p.row));
    const cols = new Set(placements.map(p => p.col));
    const isHorizontal = rows.size === 1 || placements.length === 1;

    // Find the main word
    if (placements.length === 1) {
      // Single tile: check both directions
      const hWord = this.extractWord(placements[0].row, placements[0].col, 'horizontal', placedSet);
      const vWord = this.extractWord(placements[0].row, placements[0].col, 'vertical', placedSet);
      if (hWord && hWord.word.length > 1) words.push(hWord);
      if (vWord && vWord.word.length > 1) words.push(vWord);
    } else {
      // Multi-tile: find main word in the placement direction
      const direction = rows.size === 1 ? 'horizontal' : 'vertical';
      const mainWord = this.extractWord(placements[0].row, placements[0].col, direction, placedSet);
      if (mainWord && mainWord.word.length > 1) words.push(mainWord);

      // Find cross-words
      const crossDirection = direction === 'horizontal' ? 'vertical' : 'horizontal';
      for (const p of placements) {
        const crossWord = this.extractWord(p.row, p.col, crossDirection, placedSet);
        if (crossWord && crossWord.word.length > 1) words.push(crossWord);
      }
    }

    // Remove temporarily placed tiles
    for (const p of placements) {
      this.cells[p.row][p.col].tile = null;
    }

    return words;
  }

  private extractWord(
    row: number, col: number, direction: 'horizontal' | 'vertical',
    newTilePositions: Set<string>
  ): WordFound | null {
    const dr = direction === 'vertical' ? 1 : 0;
    const dc = direction === 'horizontal' ? 1 : 0;

    // Find start of word
    let sr = row, sc = col;
    while (sr - dr >= 0 && sc - dc >= 0 && this.cells[sr - dr][sc - dc].tile !== null) {
      sr -= dr;
      sc -= dc;
    }

    // Collect word
    const tiles: { tile: Tile; row: number; col: number; isNew: boolean }[] = [];
    let r = sr, c = sc;
    let word = '';
    while (r >= 0 && r < 15 && c >= 0 && c < 15 && this.cells[r][c].tile !== null) {
      const tile = this.cells[r][c].tile!;
      const letter = tile.isBlank ? (tile.chosenLetter || '?') : tile.letter;
      word += letter;
      tiles.push({
        tile,
        row: r,
        col: c,
        isNew: newTilePositions.has(`${r},${c}`),
      });
      r += dr;
      c += dc;
    }

    if (word.length <= 1) return null;

    return { word, tiles, startRow: sr, startCol: sc, direction };
  }

  commitTiles(placements: PlacedTile[]): void {
    for (const p of placements) {
      this.cells[p.row][p.col].tile = p.tile;
    }
  }

  toJSON(): (any | null)[][] {
    return this.cells.map(row =>
      row.map(cell => ({
        tile: cell.tile ? {
          id: cell.tile.id,
          letter: cell.tile.letter,
          points: cell.tile.points,
          isBlank: cell.tile.isBlank,
          chosenLetter: cell.tile.chosenLetter,
        } : null,
        premium: cell.premium,
      }))
    );
  }
}

export function getPremiumAt(row: number, col: number): PremiumType {
  return PREMIUM_LAYOUT[`${row},${col}`] || null;
}
