import { v4 as uuidv4 } from 'uuid';
import { Board, PlacedTile, WordFound } from './Board';
import { TileBag, Tile } from './TileBag';
import { calculateTurnScore, calculateEndGameDeductions, WordScore } from './Scoring';
import { Validator } from './Validator';
import { Timer } from './Timer';

export interface Player {
  id: string;
  socketId: string;
  username: string;
  avatar: string;
  elo: number;
  score: number;
  rack: Tile[];
  timerRemaining: number;
  connected: boolean;
  isAI: boolean;
  aiDifficulty?: 'easy' | 'medium' | 'hard';
}

export interface TurnEntry {
  playerId: string;
  username: string;
  turnNumber: number;
  timestamp: string;
  action: 'play' | 'pass' | 'exchange';
  wordsFormed: WordScore[];
  totalScore: number;
  tilesPlayed: { letter: string; points: number; row: number; col: number }[];
}

export interface GameSettings {
  maxPlayers: number;
  timeLimit: number; // minutes, 0 = unlimited
  dictionary: 'en_us' | 'en_gb';
  gameType: 'friend' | 'ranked';
}

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface PendingPlacement {
  tile: Tile;
  row: number;
  col: number;
}

export class GameState {
  roomId: string;
  board: Board;
  players: Player[] = [];
  currentTurnIndex: number = 0;
  tileBag: TileBag;
  turnHistory: TurnEntry[] = [];
  status: GameStatus = 'waiting';
  settings: GameSettings;
  consecutivePasses: number = 0;
  turnNumber: number = 0;
  timer: Timer;
  pendingPlacements: Map<string, PendingPlacement[]> = new Map();
  private validator: Validator;
  private onBroadcast: ((type: string, data: any, excludePlayer?: string) => void) | null = null;
  private onSendToPlayer: ((playerId: string, type: string, data: any) => void) | null = null;
  private onGameOver: (() => void) | null = null;

  constructor(roomId: string, settings: GameSettings, validator: Validator) {
    this.roomId = roomId;
    this.settings = settings;
    this.board = new Board();
    this.tileBag = new TileBag();
    this.validator = validator;
    
    const timeLimitSec = settings.timeLimit * 60;
    this.timer = new Timer(
      timeLimitSec,
      (playerId) => this.handleTimeout(playerId),
      (timers) => this.broadcastTimers()
    );
  }

  setCallbacks(
    onBroadcast: (type: string, data: any, excludePlayer?: string) => void,
    onSendToPlayer: (playerId: string, type: string, data: any) => void,
    onGameOver: () => void
  ): void {
    this.onBroadcast = onBroadcast;
    this.onSendToPlayer = onSendToPlayer;
    this.onGameOver = onGameOver;
  }

  addPlayer(id: string, socketId: string, username: string, avatar: string, elo: number, isAI: boolean = false, aiDifficulty?: 'easy' | 'medium' | 'hard'): Player | null {
    if (this.players.length >= this.settings.maxPlayers) return null;
    if (this.status !== 'waiting') return null;

    const player: Player = {
      id, socketId, username, avatar, elo,
      score: 0,
      rack: [],
      timerRemaining: this.settings.timeLimit * 60,
      connected: true,
      isAI,
      aiDifficulty,
    };
    this.players.push(player);
    this.timer.addPlayer(id);
    return player;
  }

  removePlayer(playerId: string): void {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      this.timer.removePlayer(playerId);
    }
  }

  startGame(): boolean {
    if (this.players.length < 1) return false;
    if (this.status !== 'waiting') return false;

    this.status = 'playing';
    this.currentTurnIndex = 0;
    this.turnNumber = 1;
    this.consecutivePasses = 0;

    // Draw initial tiles for each player
    for (const player of this.players) {
      player.rack = this.tileBag.draw(7);
    }

    // Start timer for first player
    this.timer.startTurn(this.players[0].id);

    return true;
  }

  getCurrentPlayer(): Player | null {
    if (this.status !== 'playing') return null;
    return this.players[this.currentTurnIndex] || null;
  }

  placeTile(playerId: string, tileId: string, row: number, col: number, chosenLetter?: string): { success: boolean; error?: string } {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const tileIdx = player.rack.findIndex(t => t.id === tileId);
    if (tileIdx === -1) {
      return { success: false, error: 'Tile not in your rack' };
    }

    if (row < 0 || row > 14 || col < 0 || col > 14) {
      return { success: false, error: 'Invalid position' };
    }

    if (this.board.getCell(row, col)?.tile !== null) {
      return { success: false, error: 'Cell already occupied' };
    }

    // Check pending placements too
    const pending = this.pendingPlacements.get(playerId) || [];
    if (pending.some(p => p.row === row && p.col === col)) {
      return { success: false, error: 'Cell already has a pending tile' };
    }

    const tile = player.rack.splice(tileIdx, 1)[0];
    
    if (tile.isBlank && chosenLetter) {
      tile.chosenLetter = chosenLetter.toUpperCase();
    }

    pending.push({ tile, row, col });
    this.pendingPlacements.set(playerId, pending);

    return { success: true };
  }

  moveTile(playerId: string, tileId: string, newRow: number, newCol: number): { success: boolean; error?: string } {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (newRow < 0 || newRow > 14 || newCol < 0 || newCol > 14) {
      return { success: false, error: 'Invalid position' };
    }

    if (this.board.getCell(newRow, newCol)?.tile !== null) {
      return { success: false, error: 'Cell already occupied' };
    }

    const pending = this.pendingPlacements.get(playerId) || [];
    const tileIdx = pending.findIndex(p => p.tile.id === tileId);
    if (tileIdx === -1) {
      return { success: false, error: 'Tile not in pending placements' };
    }

    // Check that the destination doesn't have another pending tile
    const destOccupied = pending.some((p, i) => i !== tileIdx && p.row === newRow && p.col === newCol);
    if (destOccupied) {
      return { success: false, error: 'Cell already has a pending tile' };
    }

    // Move the tile
    pending[tileIdx].row = newRow;
    pending[tileIdx].col = newCol;

    return { success: true };
  }

  recallSingleTile(playerId: string, tileId: string): { success: boolean } {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false };

    const pending = this.pendingPlacements.get(playerId) || [];
    const idx = pending.findIndex(p => p.tile.id === tileId);
    if (idx === -1) return { success: false };

    const placement = pending.splice(idx, 1)[0];
    if (placement.tile.isBlank) {
      placement.tile.chosenLetter = undefined;
    }
    player.rack.push(placement.tile);
    return { success: true };
  }

  recallTiles(playerId: string): { success: boolean; tiles: Tile[] } {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, tiles: [] };

    const pending = this.pendingPlacements.get(playerId) || [];
    const tiles: Tile[] = [];
    for (const p of pending) {
      if (p.tile.isBlank) {
        p.tile.chosenLetter = undefined;
      }
      player.rack.push(p.tile);
      tiles.push(p.tile);
    }
    this.pendingPlacements.set(playerId, []);
    return { success: true, tiles };
  }

  previewScore(playerId: string): { valid: boolean; score: number; isLegitimate: boolean; words?: string[] } {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) {
      return { valid: false, score: 0, isLegitimate: false };
    }

    const pending = this.pendingPlacements.get(playerId) || [];
    if (pending.length === 0) {
      return { valid: false, score: 0, isLegitimate: false };
    }

    const placements: PlacedTile[] = pending.map(p => ({
      tile: p.tile,
      row: p.row,
      col: p.col,
    }));

    // Validate placement geometry
    const validation = this.board.validatePlacement(placements);
    if (!validation.valid) {
      return { valid: false, score: 0, isLegitimate: false };
    }

    // Find all words formed
    const wordsFormed = this.board.findWordsFormed(placements);
    if (wordsFormed.length === 0) {
      return { valid: false, score: 0, isLegitimate: false };
    }

    // Validate all words against dictionary
    const wordStrings = wordsFormed.map(w => w.word);
    const dictValidation = this.validator.validateWords(wordStrings);

    // Calculate score regardless of validity
    const { totalScore } = calculateTurnScore(wordsFormed, placements.length);

    return {
      valid: dictValidation.valid,
      score: totalScore,
      isLegitimate: true,
      words: wordStrings,
    };
  }

  submitWord(playerId: string): { 
    success: boolean; 
    error?: string; 
    words?: WordScore[];
    totalScore?: number;
    newTiles?: Tile[];
    tilesPlayed?: PlacedTile[];
  } {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const pending = this.pendingPlacements.get(playerId) || [];
    if (pending.length === 0) {
      return { success: false, error: 'No tiles placed' };
    }

    const placements: PlacedTile[] = pending.map(p => ({
      tile: p.tile,
      row: p.row,
      col: p.col,
    }));

    // Validate placement geometry
    const validation = this.board.validatePlacement(placements);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Find all words formed
    const wordsFormed = this.board.findWordsFormed(placements);
    if (wordsFormed.length === 0) {
      return { success: false, error: 'No valid words formed' };
    }

    // Validate all words against dictionary
    const wordStrings = wordsFormed.map(w => w.word);
    const dictValidation = this.validator.validateWords(wordStrings);
    if (!dictValidation.valid) {
      return { 
        success: false, 
        error: `Invalid word(s): ${dictValidation.invalidWords.join(', ')}` 
      };
    }

    // Calculate score
    const { words, totalScore } = calculateTurnScore(wordsFormed, placements.length);

    // Commit tiles to board
    this.board.commitTiles(placements);
    this.pendingPlacements.set(playerId, []);
    this.consecutivePasses = 0;

    // Update score
    player.score += totalScore;

    // Draw new tiles
    const newTiles = this.tileBag.draw(placements.length);
    player.rack.push(...newTiles);

    // Record turn
    this.turnHistory.push({
      playerId,
      username: player.username,
      turnNumber: this.turnNumber,
      timestamp: new Date().toISOString(),
      action: 'play',
      wordsFormed: words,
      totalScore,
      tilesPlayed: placements.map(p => ({
        letter: p.tile.isBlank ? (p.tile.chosenLetter || '?') : p.tile.letter,
        points: p.tile.points,
        row: p.row,
        col: p.col,
      })),
    });

    // Check for game end (player used all tiles and bag is empty)
    if (player.rack.length === 0 && this.tileBag.isEmpty()) {
      this.endGame('tiles_exhausted');
      return { success: true, words, totalScore, newTiles, tilesPlayed: placements };
    }

    this.advanceTurn();

    return { success: true, words, totalScore, newTiles, tilesPlayed: placements };
  }

  passTurn(playerId: string): { success: boolean; error?: string } {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Recall any pending tiles
    this.recallTiles(playerId);

    this.consecutivePasses++;

    this.turnHistory.push({
      playerId,
      username: player.username,
      turnNumber: this.turnNumber,
      timestamp: new Date().toISOString(),
      action: 'pass',
      wordsFormed: [],
      totalScore: 0,
      tilesPlayed: [],
    });

    // Check for game end (all players passed consecutively)
    if (this.consecutivePasses >= this.players.length * 2) {
      this.endGame('all_passed');
      return { success: true };
    }

    this.advanceTurn();
    return { success: true };
  }

  exchangeTiles(playerId: string, tileIds: string[]): { success: boolean; error?: string; newTiles?: Tile[] } {
    const player = this.getCurrentPlayer();
    if (!player || player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.tileBag.remaining() < tileIds.length) {
      return { success: false, error: 'Not enough tiles in bag' };
    }

    // Recall any pending tiles first
    this.recallTiles(playerId);

    const tilesToReturn: Tile[] = [];
    for (const tileId of tileIds) {
      const idx = player.rack.findIndex(t => t.id === tileId);
      if (idx === -1) {
        // Put back tiles already removed
        player.rack.push(...tilesToReturn);
        return { success: false, error: 'Tile not in rack' };
      }
      tilesToReturn.push(player.rack.splice(idx, 1)[0]);
    }

    // Draw new tiles first, then return old ones
    const newTiles = this.tileBag.draw(tileIds.length);
    player.rack.push(...newTiles);
    this.tileBag.returnTiles(tilesToReturn);

    this.consecutivePasses++;

    this.turnHistory.push({
      playerId,
      username: player.username,
      turnNumber: this.turnNumber,
      timestamp: new Date().toISOString(),
      action: 'exchange',
      wordsFormed: [],
      totalScore: 0,
      tilesPlayed: [],
    });

    if (this.consecutivePasses >= this.players.length * 2) {
      this.endGame('all_passed');
      return { success: true, newTiles };
    }

    this.advanceTurn();
    return { success: true, newTiles };
  }

  private advanceTurn(): void {
    this.turnNumber++;
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    
    // Skip disconnected players
    let attempts = 0;
    while (!this.players[this.currentTurnIndex].connected && attempts < this.players.length) {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      attempts++;
    }

    this.timer.startTurn(this.players[this.currentTurnIndex].id);
  }

  private handleTimeout(playerId: string): void {
    this.endGame('timeout', playerId);
  }

  private broadcastTimers(): void {
    if (this.onBroadcast) {
      this.onBroadcast('TIMER_UPDATE', { timers: this.timer.getAllTimers() });
    }
  }

  endGame(reason: string, timedOutPlayer?: string): void {
    this.status = 'finished';
    this.timer.destroy();

    // Apply end-game deductions
    const rackMap = new Map<string, { points: number }[]>();
    for (const player of this.players) {
      rackMap.set(player.id, player.rack.map(t => ({ points: t.points })));
    }
    const deductions = calculateEndGameDeductions(rackMap);
    for (const [playerId, adjustment] of deductions) {
      const player = this.players.find(p => p.id === playerId);
      if (player) {
        player.score += adjustment;
        if (player.score < 0) player.score = 0;
      }
    }

    if (this.onBroadcast) {
      const finalScores: { [id: string]: number } = {};
      for (const p of this.players) {
        finalScores[p.id] = p.score;
      }

      const winner = this.players.reduce((best, p) => 
        p.score > best.score ? p : best
      , this.players[0]);

      this.onBroadcast('GAME_OVER', {
        finalScores,
        winner: winner.id,
        reason,
        timedOutPlayer,
      });
    }

    if (this.onGameOver) {
      this.onGameOver();
    }
  }

  getStateForPlayer(playerId: string): any {
    const player = this.players.find(p => p.id === playerId);
    return {
      roomId: this.roomId,
      board: this.board.toJSON(),
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        elo: p.elo,
        score: p.score,
        rackCount: p.rack.length,
        connected: p.connected,
        isAI: p.isAI,
      })),
      currentTurn: this.players[this.currentTurnIndex]?.id,
      tileBagCount: this.tileBag.remaining(),
      timers: this.timer.getAllTimers(),
      status: this.status,
      settings: this.settings,
      turnHistory: this.turnHistory,
      rack: player ? player.rack : [],
      turnNumber: this.turnNumber,
      consecutivePasses: this.consecutivePasses,
    };
  }

  getPublicState(): any {
    return {
      roomId: this.roomId,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        elo: p.elo,
        score: p.score,
        rackCount: p.rack.length,
        connected: p.connected,
      })),
      status: this.status,
      settings: this.settings,
    };
  }
}
