import { v4 as uuidv4 } from 'uuid';
import { GameState, GameSettings, Player } from './GameState';
import { Validator } from './Validator';
import { AI } from './AI';
import WebSocket from 'ws';

export interface Room {
  id: string;
  hostId: string;
  game: GameState;
  settings: GameSettings;
  isSolo: boolean;
}

interface SessionInfo {
  playerId: string;
  username: string;
  avatar: string;
  elo: number;
  roomId?: string;
}

export class GameManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map();
  private playerSockets: Map<string, WebSocket> = new Map();
  private socketPlayers: Map<WebSocket, string> = new Map();
  private sessions: Map<string, SessionInfo> = new Map(); // sessionId -> info
  private playerSessions: Map<string, string> = new Map(); // playerId -> sessionId
  private validator: Validator;
  private ai: AI;
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.validator = new Validator();
    this.ai = new AI(this.validator);
  }

  // --- Session management ---

  resolveSession(sessionId: string, socket: WebSocket, username: string, avatar: string, elo: number): { playerId: string; reconnected: boolean; roomId?: string } {
    const existing = this.sessions.get(sessionId);

    if (existing) {
      // Close old socket if still around
      const oldSocket = this.playerSockets.get(existing.playerId);
      if (oldSocket && oldSocket !== socket && oldSocket.readyState === WebSocket.OPEN) {
        oldSocket.close(4001, 'Replaced by new connection');
      }
      this.socketPlayers.delete(oldSocket as WebSocket);

      // Update session info
      existing.username = username || existing.username;
      existing.avatar = avatar || existing.avatar;
      existing.elo = elo || existing.elo;

      // Re-bind socket
      this.playerSockets.set(existing.playerId, socket);
      this.socketPlayers.set(socket, existing.playerId);

      // Try to reconnect to room
      const roomId = existing.roomId || this.playerRooms.get(existing.playerId);
      if (roomId) {
        const reconnected = this.handleReconnect(existing.playerId, socket);
        return { playerId: existing.playerId, reconnected, roomId: reconnected ? roomId : undefined };
      }

      return { playerId: existing.playerId, reconnected: false };
    }

    // New session
    const playerId = uuidv4();
    this.sessions.set(sessionId, { playerId, username, avatar, elo });
    this.playerSessions.set(playerId, sessionId);
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);

    return { playerId, reconnected: false };
  }

  // --- Solo game (atomic: create + add AI + start) ---

  createSoloGame(playerId: string, socket: WebSocket, username: string, avatar: string, elo: number, aiDifficulty: 'easy' | 'medium' | 'hard', timeLimit: number): Room {
    const settings: GameSettings = {
      maxPlayers: 2,
      timeLimit,
      dictionary: 'en_us',
      gameType: 'friend',
      timeoutMode: 'sudden',
    };

    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const game = new GameState(roomId, settings, this.validator);

    game.setCallbacks(
      (type, data, excludePlayer) => this.broadcastToRoom(roomId, type, data, excludePlayer),
      (pid, type, data) => this.sendToPlayer(pid, type, data),
      () => this.handleGameOver(roomId)
    );

    game.addPlayer(playerId, socket.toString(), username, avatar, elo);
    const aiId = uuidv4();
    game.addPlayer(aiId, '', 'AI Bot', '🤖', 1200, true, aiDifficulty);

    const room: Room = { id: roomId, hostId: playerId, game, settings, isSolo: true };
    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    this.updateSessionRoom(playerId, roomId);

    // Start immediately
    game.startGame();

    // Send game state to the human player
    this.sendToPlayer(playerId, 'GAME_START', game.getStateForPlayer(playerId));

    // Trigger AI if it goes first
    const currentPlayer = game.getCurrentPlayer();
    if (currentPlayer?.isAI) {
      this.triggerAITurn(roomId);
    }

    return room;
  }

  // --- Multiplayer room ---

  createRoom(playerId: string, socket: WebSocket, username: string, avatar: string, elo: number, settings: GameSettings): Room {
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const game = new GameState(roomId, settings, this.validator);

    game.setCallbacks(
      (type, data, excludePlayer) => this.broadcastToRoom(roomId, type, data, excludePlayer),
      (pid, type, data) => this.sendToPlayer(pid, type, data),
      () => this.handleGameOver(roomId)
    );

    game.addPlayer(playerId, socket.toString(), username, avatar, elo);

    const room: Room = { id: roomId, hostId: playerId, game, settings, isSolo: false };
    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    this.updateSessionRoom(playerId, roomId);

    return room;
  }

  joinRoom(roomId: string, playerId: string, socket: WebSocket, username: string, avatar: string, elo: number): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.isSolo) return null; // Can't join solo rooms
    if (room.game.status !== 'waiting') return null;

    const player = room.game.addPlayer(playerId, socket.toString(), username, avatar, elo);
    if (!player) return null;

    this.playerRooms.set(playerId, roomId);
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);
    this.updateSessionRoom(playerId, roomId);

    // Broadcast to all existing players that someone joined
    this.broadcastToRoom(roomId, 'ROOM_UPDATE', this.getRoomState(room));

    return room;
  }

  addAIToRoom(playerId: string, aiDifficulty: 'easy' | 'medium' | 'hard'): boolean {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return false;

    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== playerId) return false;
    if (room.game.status !== 'waiting') return false;
    if (room.game.players.length >= room.settings.maxPlayers) return false;

    const aiId = uuidv4();
    const aiNames = ['AI Bot', 'AI Alpha', 'AI Beta', 'AI Gamma'];
    const aiCount = room.game.players.filter(p => p.isAI).length;
    const aiName = aiNames[aiCount] || `AI ${aiCount + 1}`;
    
    const player = room.game.addPlayer(aiId, '', aiName, '🤖', 1200, true, aiDifficulty);
    if (!player) return false;

    this.broadcastToRoom(roomId, 'ROOM_UPDATE', this.getRoomState(room));
    return true;
  }

  removeAIFromRoom(playerId: string, aiPlayerId: string): boolean {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return false;

    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== playerId) return false;
    if (room.game.status !== 'waiting') return false;

    const aiPlayer = room.game.players.find(p => p.id === aiPlayerId && p.isAI);
    if (!aiPlayer) return false;

    room.game.players = room.game.players.filter(p => p.id !== aiPlayerId);

    this.broadcastToRoom(roomId, 'ROOM_UPDATE', this.getRoomState(room));
    return true;
  }

  startGame(playerId: string): boolean {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return false;

    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== playerId) return false;
    if (room.isSolo) return false; // Solo already started

    const humanCount = room.game.players.filter(p => !p.isAI).length;
    if (humanCount < 1) return false;

    // If only 1 human player, add an AI opponent
    if (room.game.players.length < 2) {
      const aiId = uuidv4();
      room.game.addPlayer(aiId, '', 'AI Bot', '🤖', 1200, true, 'medium');
    }

    const started = room.game.startGame();
    if (!started) return false;

    for (const player of room.game.players) {
      if (!player.isAI) {
        this.sendToPlayer(player.id, 'GAME_START', room.game.getStateForPlayer(player.id));
      }
    }

    const currentPlayer = room.game.getCurrentPlayer();
    if (currentPlayer?.isAI) {
      this.triggerAITurn(roomId);
    }

    return true;
  }

  // --- Game actions (unchanged logic, just organized) ---

  handlePlaceTile(playerId: string, tileId: string, row: number, col: number, chosenLetter?: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.placeTile(playerId, tileId, row, col, chosenLetter);
    const socket = this.playerSockets.get(playerId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'PLACE_TILE_RESULT', ...result, tileId, row, col }));
    }

    if (result.success) {
      this.broadcastToRoom(roomId, 'TILE_PLACED', { playerId, row, col }, playerId);
    }
  }

  handlePreviewScore(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.previewScore(playerId);
    this.sendToPlayer(playerId, 'SCORE_PREVIEW', result);
  }

  handleMoveTile(playerId: string, tileId: string, newRow: number, newCol: number): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.moveTile(playerId, tileId, newRow, newCol);
    this.sendToPlayer(playerId, 'MOVE_TILE_RESULT', { ...result, tileId, row: newRow, col: newCol });
  }

  handleRecallSingleTile(playerId: string, tileId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.recallSingleTile(playerId, tileId);
    if (result.success) {
      this.sendToPlayer(playerId, 'TILE_RECALLED', {
        success: true,
        tileId,
        rack: room.game.players.find(p => p.id === playerId)?.rack || [],
      });
    }
  }

  handleRecallTiles(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.recallTiles(playerId);
    this.sendToPlayer(playerId, 'TILES_RECALLED', {
      success: result.success,
      rack: room.game.players.find(p => p.id === playerId)?.rack || []
    });
    this.broadcastToRoom(roomId, 'TILES_RECALLED_PUBLIC', { playerId }, playerId);
  }

  handleSubmitWord(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.submitWord(playerId);

    if (result.success) {
      this.broadcastToRoom(roomId, 'WORD_ACCEPTED', {
        playerId,
        words: result.words,
        totalTurnScore: result.totalScore,
        tilesPlayed: result.tilesPlayed?.map(p => ({
          letter: p.tile.isBlank ? (p.tile.chosenLetter || '?') : p.tile.letter,
          points: p.tile.points,
          row: p.row,
          col: p.col,
          isBlank: p.tile.isBlank,
        })),
      });

      this.sendGameStateToAll(roomId);

      if (room.game.status === 'finished') return;

      const currentPlayer = room.game.getCurrentPlayer();
      if (currentPlayer?.isAI) {
        this.triggerAITurn(roomId);
      }
    } else {
      this.sendToPlayer(playerId, 'WORD_REJECTED', { reason: result.error });
    }
  }

  handlePassTurn(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.passTurn(playerId);
    if (result.success) {
      this.broadcastToRoom(roomId, 'TURN_PASSED', { playerId });
      this.sendGameStateToAll(roomId);

      if (room.game.status === 'finished') return;

      const currentPlayer = room.game.getCurrentPlayer();
      if (currentPlayer?.isAI) {
        this.triggerAITurn(roomId);
      }
    } else {
      this.sendToPlayer(playerId, 'ERROR', { message: result.error });
    }
  }

  handleExchangeTiles(playerId: string, tileIds: string[]): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const result = room.game.exchangeTiles(playerId, tileIds);
    if (result.success) {
      this.sendToPlayer(playerId, 'TILES_EXCHANGED_SELF', {
        rack: room.game.players.find(p => p.id === playerId)?.rack || [],
      });
      this.broadcastToRoom(roomId, 'TILES_EXCHANGED', {
        playerId,
        count: tileIds.length,
      }, playerId);
      this.sendGameStateToAll(roomId);

      if (room.game.status === 'finished') return;

      const currentPlayer = room.game.getCurrentPlayer();
      if (currentPlayer?.isAI) {
        this.triggerAITurn(roomId);
      }
    } else {
      this.sendToPlayer(playerId, 'ERROR', { message: result.error });
    }
  }

  handleChat(playerId: string, text: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.game.players.find(p => p.id === playerId);
    if (!player) return;

    this.broadcastToRoom(roomId, 'CHAT', {
      playerId,
      username: player.username,
      avatar: player.avatar,
      text,
      timestamp: new Date().toISOString(),
    });
  }

  handleResign(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.game.endGame('resign', playerId);
  }

  handleLeaveRoom(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.game.status !== 'waiting') return; // Can only leave during waiting

    room.game.removePlayer(playerId);
    this.playerRooms.delete(playerId);
    this.updateSessionRoom(playerId, undefined);

    if (room.game.players.filter(p => !p.isAI).length === 0) {
      this.rooms.delete(roomId);
    } else {
      // Reassign host if the host left
      if (room.hostId === playerId) {
        const newHost = room.game.players.find(p => !p.isAI);
        if (newHost) {
          room.hostId = newHost.id;
        }
      }
      this.broadcastToRoom(roomId, 'ROOM_UPDATE', this.getRoomState(room));
    }
  }

  // --- Disconnect / Reconnect ---

  handleDisconnect(socket: WebSocket): void {
    const playerId = this.socketPlayers.get(socket);
    if (!playerId) return;

    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      this.socketPlayers.delete(socket);
      this.playerSockets.delete(playerId);
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.game.players.find(p => p.id === playerId);
    if (player) {
      player.connected = false;
    }

    // Clean up socket maps (but keep session and playerRooms for reconnect)
    this.socketPlayers.delete(socket);
    this.playerSockets.delete(playerId);

    if (room.game.status === 'waiting') {
      // In waiting room: keep player but mark disconnected, give 30s grace
      this.broadcastToRoom(roomId, 'ROOM_UPDATE', this.getRoomState(room));

      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        const r = this.rooms.get(roomId);
        if (!r || r.game.status !== 'waiting') return;
        const p = r.game.players.find(pp => pp.id === playerId);
        if (p && !p.connected) {
          this.handleLeaveRoom(playerId);
        }
      }, 30000);
      this.disconnectTimers.set(playerId, timer);
      return;
    }

    // Game in progress: pause timer if it's their turn, give 120s to reconnect
    if (room.game.status === 'playing') {
      const currentPlayer = room.game.getCurrentPlayer();
      if (currentPlayer?.id === playerId) {
        room.game.timer.pauseCurrentPlayer();
      }
    }

    this.broadcastToRoom(roomId, 'PLAYER_DISCONNECTED', { playerId });

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      const r = this.rooms.get(roomId);
      if (!r || r.game.status !== 'playing') return;
      const p = r.game.players.find(pp => pp.id === playerId);
      if (p && !p.connected) {
        // Auto-pass if it's their turn
        const current = r.game.getCurrentPlayer();
        if (current?.id === playerId) {
          r.game.passTurn(playerId);
          this.broadcastToRoom(roomId, 'TURN_PASSED', { playerId, reason: 'disconnect_timeout' });
          this.sendGameStateToAll(roomId);

          if ((r.game.status as string) === 'finished') return;
          const next = r.game.getCurrentPlayer();
          if (next?.isAI) this.triggerAITurn(roomId);
        }
      }
    }, 120000);
    this.disconnectTimers.set(playerId, timer);
  }

  handleReconnect(playerId: string, socket: WebSocket): boolean {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return false;
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.game.players.find(p => p.id === playerId);
    if (!player) return false;

    player.connected = true;
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);

    // Clear disconnect timer
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }

    if (room.game.status === 'waiting') {
      this.sendToPlayer(playerId, 'ROOM_JOINED', this.getRoomState(room));
      this.broadcastToRoom(roomId, 'ROOM_UPDATE', this.getRoomState(room));
    } else if (room.game.status === 'playing') {
      // Resume timer if it's their turn
      const currentPlayer = room.game.getCurrentPlayer();
      if (currentPlayer?.id === playerId) {
        room.game.timer.resumeCurrentPlayer();
      }

      this.sendToPlayer(playerId, 'RECONNECTED', room.game.getStateForPlayer(playerId));
      this.broadcastToRoom(roomId, 'PLAYER_RECONNECTED', { playerId }, playerId);
    } else if (room.game.status === 'finished') {
      this.sendToPlayer(playerId, 'RECONNECTED', room.game.getStateForPlayer(playerId));
    }

    return true;
  }

  // --- AI ---

  private async triggerAITurn(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.game.status !== 'playing') return;

    const currentPlayer = room.game.getCurrentPlayer();
    if (!currentPlayer?.isAI) return;

    const move = await this.ai.findMove(
      room.game.board,
      currentPlayer.rack,
      currentPlayer.aiDifficulty || 'medium'
    );

    if (!move) {
      room.game.passTurn(currentPlayer.id);
      this.broadcastToRoom(roomId, 'TURN_PASSED', { playerId: currentPlayer.id });
      this.sendGameStateToAll(roomId);

      if ((room.game.status as string) === 'finished') return;

      const nextPlayer = room.game.getCurrentPlayer();
      if (nextPlayer?.isAI) {
        this.triggerAITurn(roomId);
      }
      return;
    }

    for (const placement of move.placements) {
      room.game.placeTile(
        currentPlayer.id,
        placement.tile.id,
        placement.row,
        placement.col,
        placement.tile.chosenLetter
      );
    }

    const result = room.game.submitWord(currentPlayer.id);

    if (result.success) {
      this.broadcastToRoom(roomId, 'WORD_ACCEPTED', {
        playerId: currentPlayer.id,
        words: result.words,
        totalTurnScore: result.totalScore,
        tilesPlayed: result.tilesPlayed?.map(p => ({
          letter: p.tile.isBlank ? (p.tile.chosenLetter || '?') : p.tile.letter,
          points: p.tile.points,
          row: p.row,
          col: p.col,
          isBlank: p.tile.isBlank,
        })),
      });
      this.sendGameStateToAll(roomId);

      if ((room.game.status as string) === 'finished') return;

      const nextPlayer = room.game.getCurrentPlayer();
      if (nextPlayer?.isAI) {
        this.triggerAITurn(roomId);
      }
    } else {
      room.game.recallTiles(currentPlayer.id);
      room.game.passTurn(currentPlayer.id);
      this.broadcastToRoom(roomId, 'TURN_PASSED', { playerId: currentPlayer.id });
      this.sendGameStateToAll(roomId);
    }
  }

  // --- Helpers ---

  private updateSessionRoom(playerId: string, roomId: string | undefined): void {
    const sessionId = this.playerSessions.get(playerId);
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.roomId = roomId;
      }
    }
  }

  private sendGameStateToAll(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const player of room.game.players) {
      if (!player.isAI && player.connected) {
        this.sendToPlayer(player.id, 'GAME_STATE', room.game.getStateForPlayer(player.id));
      }
    }
  }

  private sendToPlayer(playerId: string, type: string, data: any): void {
    const socket = this.playerSockets.get(playerId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, ...data }));
    }
  }

  private broadcastToRoom(roomId: string, type: string, data: any, excludePlayer?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const player of room.game.players) {
      if (player.isAI) continue;
      if (excludePlayer && player.id === excludePlayer) continue;
      this.sendToPlayer(player.id, type, data);
    }
  }

  private handleGameOver(roomId: string): void {
    // Clean up session room mappings after a delay
    const room = this.rooms.get(roomId);
    if (!room) return;
    // Room stays for potential rematch / summary viewing
  }

  getRoomState(room: Room): any {
    return {
      roomId: room.id,
      hostId: room.hostId,
      isSolo: room.isSolo,
      ...room.game.getPublicState(),
    };
  }

  getRoomList(): any[] {
    const rooms: any[] = [];
    for (const [id, room] of this.rooms) {
      if (room.game.status === 'waiting' && !room.isSolo) {
        rooms.push({
          id,
          hostId: room.hostId,
          host: room.game.players.find(p => p.id === room.hostId)?.username || 'Unknown',
          playerCount: room.game.players.filter(p => !p.isAI).length,
          maxPlayers: room.settings.maxPlayers,
          settings: room.settings,
        });
      }
    }
    return rooms;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getPlayerRoom(playerId: string): string | undefined {
    return this.playerRooms.get(playerId);
  }

  getSocketPlayer(socket: WebSocket): string | undefined {
    return this.socketPlayers.get(socket);
  }

  registerSocket(playerId: string, socket: WebSocket): void {
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);
  }
}
