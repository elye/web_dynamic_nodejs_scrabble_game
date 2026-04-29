import { Tile } from './TileBag';
import { Board, PlacedTile } from './Board';
import { Validator, TrieNode } from './Validator';
import { calculateTurnScore } from './Scoring';

interface AIMove {
  placements: PlacedTile[];
  score: number;
  words: string[];
}

export class AI {
  private validator: Validator;
  private trie: TrieNode | null = null;

  constructor(validator: Validator) {
    this.validator = validator;
  }

  async findMove(
    board: Board,
    rack: Tile[],
    difficulty: 'easy' | 'medium' | 'hard'
  ): Promise<AIMove | null> {
    // Simulate thinking delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    const moves = this.generateAllMoves(board, rack);
    
    if (moves.length === 0) return null;

    // Sort by score
    moves.sort((a, b) => b.score - a.score);

    switch (difficulty) {
      case 'easy':
        // Pick a random move from the bottom 30%
        const easyPool = moves.slice(Math.floor(moves.length * 0.7));
        // Also filter for short words
        const shortMoves = easyPool.filter(m => m.placements.length <= 3);
        const easyMoves = shortMoves.length > 0 ? shortMoves : easyPool;
        return easyMoves[Math.floor(Math.random() * easyMoves.length)];

      case 'medium':
        // Pick from the top 50%
        const mediumPool = moves.slice(0, Math.ceil(moves.length * 0.5));
        return mediumPool[Math.floor(Math.random() * Math.min(5, mediumPool.length))];

      case 'hard':
        // Pick the best move
        return moves[0];

      default:
        return moves[0];
    }
  }

  private generateAllMoves(board: Board, rack: Tile[]): AIMove[] {
    if (!this.trie) {
      this.trie = this.validator.buildTrie();
    }

    const moves: AIMove[] = [];
    const isFirstMove = board.isEmpty();

    if (isFirstMove) {
      // Generate moves through center
      this.generateMovesForAnchor(board, rack, 7, 7, 'horizontal', moves);
      this.generateMovesForAnchor(board, rack, 7, 7, 'vertical', moves);
    } else {
      // Find anchor squares (empty squares adjacent to existing tiles)
      const anchors = this.findAnchors(board);
      for (const [row, col] of anchors) {
        this.generateMovesForAnchor(board, rack, row, col, 'horizontal', moves);
        this.generateMovesForAnchor(board, rack, row, col, 'vertical', moves);
      }
    }

    return moves;
  }

  private findAnchors(board: Board): [number, number][] {
    const anchors: [number, number][] = [];
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (board.getCell(r, c)?.tile !== null) continue;
        // Check if adjacent to a tile
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15) {
            if (board.getCell(nr, nc)?.tile !== null) {
              anchors.push([r, c]);
              break;
            }
          }
        }
      }
    }
    return anchors;
  }

  private generateMovesForAnchor(
    board: Board,
    rack: Tile[],
    anchorRow: number,
    anchorCol: number,
    direction: 'horizontal' | 'vertical',
    moves: AIMove[]
  ): void {
    const dr = direction === 'vertical' ? 1 : 0;
    const dc = direction === 'horizontal' ? 1 : 0;

    // Simple approach: try placing words that pass through this anchor
    // For each possible prefix length (how far left/up we can go)
    const maxPrefix = this.getMaxPrefix(board, anchorRow, anchorCol, direction);
    
    for (let prefixLen = 0; prefixLen <= maxPrefix; prefixLen++) {
      const startRow = anchorRow - dr * prefixLen;
      const startCol = anchorCol - dc * prefixLen;
      
      this.extendRight(
        board, rack, [], startRow, startCol, direction,
        this.trie!, moves, new Set<number>()
      );
    }
  }

  private getMaxPrefix(board: Board, row: number, col: number, direction: 'horizontal' | 'vertical'): number {
    const dr = direction === 'vertical' ? -1 : 0;
    const dc = direction === 'horizontal' ? -1 : 0;
    let count = 0;
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 15 && c >= 0 && c < 15) {
      const cell = board.getCell(r, c);
      if (cell?.tile !== null) break;
      count++;
      r += dr;
      c += dc;
    }
    return Math.min(count, 7);
  }

  private extendRight(
    board: Board,
    rack: Tile[],
    placements: PlacedTile[],
    row: number,
    col: number,
    direction: 'horizontal' | 'vertical',
    node: TrieNode,
    moves: AIMove[],
    usedRackIndices: Set<number>
  ): void {
    if (row < 0 || row >= 15 || col < 0 || col >= 15) {
      // End of board - check if valid word
      if (node.isEnd && placements.length > 0) {
        this.tryAddMove(board, placements, moves);
      }
      return;
    }

    const dr = direction === 'vertical' ? 1 : 0;
    const dc = direction === 'horizontal' ? 1 : 0;
    const cell = board.getCell(row, col);

    if (cell?.tile) {
      // Existing tile on board - must follow it
      const letter = cell.tile.isBlank ? (cell.tile.chosenLetter || 'A') : cell.tile.letter;
      const childNode = node.children.get(letter);
      if (childNode) {
        this.extendRight(board, rack, placements, row + dr, col + dc, direction, childNode, moves, usedRackIndices);
      }
    } else {
      // Empty cell - try placing rack tiles
      if (node.isEnd && placements.length > 0) {
        this.tryAddMove(board, placements, moves);
      }

      if (placements.length >= 7) return; // Can't place more than 7

      const triedLetters = new Set<string>();
      for (let i = 0; i < rack.length; i++) {
        if (usedRackIndices.has(i)) continue;
        
        const tile = rack[i];
        
        if (tile.isBlank) {
          // Try each letter for blank
          for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
            if (triedLetters.has('_' + ch)) continue;
            const childNode = node.children.get(ch);
            if (!childNode) continue;
            
            triedLetters.add('_' + ch);
            const blankTile = { ...tile, chosenLetter: ch };
            const newPlacements = [...placements, { tile: blankTile, row, col }];
            const newUsed = new Set(usedRackIndices);
            newUsed.add(i);
            
            // Check cross-words
            if (this.checkCrossWord(board, blankTile, row, col, direction)) {
              this.extendRight(board, rack, newPlacements, row + dr, col + dc, direction, childNode, moves, newUsed);
            }
          }
        } else {
          if (triedLetters.has(tile.letter)) continue;
          triedLetters.add(tile.letter);
          
          const childNode = node.children.get(tile.letter);
          if (!childNode) continue;
          
          const newPlacements = [...placements, { tile, row, col }];
          const newUsed = new Set(usedRackIndices);
          newUsed.add(i);
          
          if (this.checkCrossWord(board, tile, row, col, direction)) {
            this.extendRight(board, rack, newPlacements, row + dr, col + dc, direction, childNode, moves, newUsed);
          }
        }
      }
    }
  }

  private checkCrossWord(
    board: Board,
    tile: Tile,
    row: number,
    col: number,
    mainDirection: 'horizontal' | 'vertical'
  ): boolean {
    const crossDr = mainDirection === 'horizontal' ? 1 : 0;
    const crossDc = mainDirection === 'vertical' ? 1 : 0;

    // Check if there are adjacent tiles in the cross direction
    let hasAdjacent = false;
    let r = row - crossDr, c = col - crossDc;
    while (r >= 0 && r < 15 && c >= 0 && c < 15 && board.getCell(r, c)?.tile) {
      hasAdjacent = true;
      r -= crossDr;
      c -= crossDc;
    }
    r = row + crossDr;
    c = col + crossDc;
    while (r >= 0 && r < 15 && c >= 0 && c < 15 && board.getCell(r, c)?.tile) {
      hasAdjacent = true;
      r += crossDr;
      c += crossDc;
    }

    if (!hasAdjacent) return true; // No cross word to validate

    // Build the cross word
    let crossWord = '';
    r = row;
    c = col;
    while (r - crossDr >= 0 && c - crossDc >= 0 && board.getCell(r - crossDr, c - crossDc)?.tile) {
      r -= crossDr;
      c -= crossDc;
    }
    while (r >= 0 && r < 15 && c >= 0 && c < 15) {
      if (r === row && c === col) {
        crossWord += tile.isBlank ? (tile.chosenLetter || 'A') : tile.letter;
      } else if (board.getCell(r, c)?.tile) {
        const t = board.getCell(r, c)!.tile!;
        crossWord += t.isBlank ? (t.chosenLetter || 'A') : t.letter;
      } else {
        break;
      }
      r += crossDr;
      c += crossDc;
    }

    return crossWord.length <= 1 || this.validator.isValidWord(crossWord);
  }

  private tryAddMove(board: Board, placements: PlacedTile[], moves: AIMove[]): void {
    // Validate placement
    const validation = board.validatePlacement(placements);
    if (!validation.valid) return;

    // Find words formed
    const wordsFormed = board.findWordsFormed(placements);
    if (wordsFormed.length === 0) return;

    // Validate all words
    const wordStrings = wordsFormed.map(w => w.word);
    const dictValidation = this.validator.validateWords(wordStrings);
    if (!dictValidation.valid) return;

    // Calculate score
    const { totalScore } = calculateTurnScore(wordsFormed, placements.length);

    moves.push({
      placements: placements.map(p => ({ ...p, tile: { ...p.tile } })),
      score: totalScore,
      words: wordStrings,
    });
  }
}
