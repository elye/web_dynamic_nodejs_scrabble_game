import { v4 as uuidv4 } from 'uuid';
import { GameState, GameSettings, Player } from './GameState';
import { Validator } from './Validator';
import { AI, AICharacter, AI_CHARACTER_INFO, GUEST_AI_CHARACTERS, ALL_AI_CHARACTERS } from './AI';
import WebSocket from 'ws';
import { saveGameRecord, GamePlayerRecord } from '../gameStats';

export interface Room {
  id: string;
  hostId: string;
  game: GameState;
  settings: GameSettings;
  isSolo: boolean;
  rematchVotes?: Set<string>;
}

interface SessionInfo {
  playerId: string;
  username: string;
  avatar: string;
  roomId?: string;
  userId?: string;
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

    // Periodically clean up stale sessions (every 10 minutes)
    setInterval(() => this.cleanupStaleSessions(), 10 * 60 * 1000);
  }

  private pickAIName(character: AICharacter, usedNames: Set<string>): string {
    const info = AI_CHARACTER_INFO[character];
    const name = `${info.emoji} ${info.name}`;
    if (!usedNames.has(name)) return name;
    let i = 2;
    while (usedNames.has(`${name} ${i}`)) i++;
    return `${name} ${i}`;
  }

  private cleanupStaleSessions(): void {
    for (const [sessionId, info] of this.sessions) {
      const hasSocket = this.playerSockets.has(info.playerId);
      const hasRoom = this.playerRooms.has(info.playerId);
      if (!hasSocket && !hasRoom) {
        this.sessions.delete(sessionId);
        this.playerSessions.delete(info.playerId);
      }
    }
  }

  // --- Session management ---

  resolveSession(sessionId: string, socket: WebSocket, username: string, avatar: string, userId?: string): { playerId: string; reconnected: boolean; roomId?: string } {
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
      if (userId) existing.userId = userId;

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
    this.sessions.set(sessionId, { playerId, username, avatar, userId });
    this.playerSessions.set(playerId, sessionId);
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);

    return { playerId, reconnected: false };
  }

  updateUserId(playerId: string, userId: string): void {
    const sessionId = this.playerSessions.get(playerId);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (session) {
      session.userId = userId;
    }

    // Also update the player in any active game
    const roomId = this.playerRooms.get(playerId);
    if (roomId) {
      const room = this.rooms.get(roomId);
      const player = room?.game.players.find(p => p.id === playerId);
      if (player) {
        player.userId = userId;
      }
    }
  }

  private getUserIdForPlayer(playerId: string): string | undefined {
    const sessionId = this.playerSessions.get(playerId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId)?.userId;
  }

  // --- Solo game (atomic: create + add AI + start) ---

  createSoloGame(playerId: string, socket: WebSocket, username: string, avatar: string, aiCharacters: AICharacter[], timeLimit: number, gameType: 'friendly' | 'formal' = 'friendly', randomOrder: boolean = false, allowHint: boolean = false, isGuest: boolean = false): Room {
    this.cleanupPlayerRoom(playerId);

    const allowedChars = isGuest ? GUEST_AI_CHARACTERS : ALL_AI_CHARACTERS;
    const validChars = aiCharacters.filter(c => allowedChars.includes(c)).slice(0, 3);
    if (validChars.length === 0) validChars.push('okie');

    const settings: GameSettings = {
      maxPlayers: 1 + validChars.length,
      timeLimit,
      dictionary: 'en_us',
      gameType,
      timeoutMode: 'sudden',
      randomOrder,
      allowHint: gameType === 'friendly' ? allowHint : false,
      publicRoom: false,
    };

    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const game = new GameState(roomId, settings, this.validator);

    game.setCallbacks(
      (type, data, excludePlayer) => this.broadcastToRoom(roomId, type, data, excludePlayer),
      (pid, type, data) => this.sendToPlayer(pid, type, data),
      (reason) => this.handleGameOver(roomId, reason)
    );

    game.addPlayer(playerId, socket.toString(), username, avatar, false, undefined, this.getUserIdForPlayer(playerId));
    const usedNames = new Set<string>();
    for (const character of validChars) {
      const aiId = uuidv4();
      const aiName = this.pickAIName(character, usedNames);
      usedNames.add(aiName);
      game.addPlayer(aiId, '', aiName, '🤖', true, character);
    }

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

  createRoom(playerId: string, socket: WebSocket, username: string, avatar: string, settings: GameSettings): Room {
    // Clean up any existing room association
    this.cleanupPlayerRoom(playerId);

    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const game = new GameState(roomId, settings, this.validator);

    game.setCallbacks(
      (type, data, excludePlayer) => this.broadcastToRoom(roomId, type, data, excludePlayer),
      (pid, type, data) => this.sendToPlayer(pid, type, data),
      (reason) => this.handleGameOver(roomId, reason)
    );

    game.addPlayer(playerId, socket.toString(), username, avatar, false, undefined, this.getUserIdForPlayer(playerId));

    const room: Room = { id: roomId, hostId: playerId, game, settings, isSolo: false };
    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    this.updateSessionRoom(playerId, roomId);

    return room;
  }

  joinRoom(roomId: string, playerId: string, socket: WebSocket, username: string, avatar: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.isSolo) return null; // Can't join solo rooms
    if (room.game.status !== 'waiting') return null;

    // Clean up any existing room association
    this.cleanupPlayerRoom(playerId);

    const player = room.game.addPlayer(playerId, socket.toString(), username, avatar, false, undefined, this.getUserIdForPlayer(playerId));
    if (!player) return null;

    this.playerRooms.set(playerId, roomId);
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);
    this.updateSessionRoom(playerId, roomId);

    // Broadcast to all existing players that someone joined
    this.broadcastToRoom(roomId, 'ROOM_UPDATE', this.getRoomState(room));

    return room;
  }

  addAIToRoom(playerId: string, aiCharacter: AICharacter, isGuest: boolean = false): boolean {
    if (isGuest) return false;

    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return false;

    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== playerId) return false;
    if (room.game.status !== 'waiting') return false;
    if (room.game.players.length >= room.settings.maxPlayers) return false;

    const totalAI = room.game.players.filter(p => p.isAI).length;
    if (totalAI >= 3) return false;

    if (!ALL_AI_CHARACTERS.includes(aiCharacter)) return false;

    // No duplicate AI characters in the same room
    const existingCharacters = room.game.players.filter(p => p.isAI).map(p => p.aiCharacter);
    if (existingCharacters.includes(aiCharacter)) return false;

    const aiId = uuidv4();
    const existingNames = new Set(room.game.players.filter(p => p.isAI).map(p => p.username));
    const aiName = this.pickAIName(aiCharacter, existingNames);
    
    const player = room.game.addPlayer(aiId, '', aiName, '🤖', true, aiCharacter);
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

  handlePreviewScore(playerId: string, placements?: any[]): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    let result;
    if (placements && placements.length > 0) {
      // Tentative preview (during opponent's turn)
      result = room.game.previewScoreTentative(placements);
    } else {
      // Normal preview (during own turn, uses server-side pending placements)
      result = room.game.previewScore(playerId);
    }
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
      isRegistered: !!player.userId,
    });
  }

  handleResign(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const resigningPlayer = room.game.players.find(p => p.id === playerId);
    if (resigningPlayer) resigningPlayer.score = 0;

    room.game.endGame('resign', playerId);
  }

  handleLeaveRoom(playerId: string): void {
    this.cleanupPlayerRoom(playerId);
  }

  // --- Rematch ---

  handleRematchRequest(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.game.status !== 'finished') return;

    if (room.isSolo) {
      this.startRematch(roomId);
      return;
    }

    // Multiplayer: track votes
    if (!room.rematchVotes) {
      room.rematchVotes = new Set();
    }
    room.rematchVotes.add(playerId);

    const connectedHumans = room.game.players.filter(p => !p.isAI && p.connected);
    const votesNeeded = connectedHumans.length;
    const currentVotes = connectedHumans.filter(p => room.rematchVotes!.has(p.id)).length;
    const player = room.game.players.find(p => p.id === playerId);

    this.broadcastToRoom(roomId, 'REMATCH_REQUESTED', {
      playerId,
      username: player?.username || 'Player',
      votesNeeded,
      currentVotes,
    });

    if (currentVotes >= votesNeeded) {
      this.startRematch(roomId);
    }
  }

  handleRematchAccept(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.game.status !== 'finished') return;
    if (!room.rematchVotes) return;

    room.rematchVotes.add(playerId);

    const connectedHumans = room.game.players.filter(p => !p.isAI && p.connected);
    const votesNeeded = connectedHumans.length;
    const currentVotes = connectedHumans.filter(p => room.rematchVotes!.has(p.id)).length;
    const player = room.game.players.find(p => p.id === playerId);

    this.broadcastToRoom(roomId, 'REMATCH_ACCEPTED', {
      playerId,
      username: player?.username || 'Player',
      votesNeeded,
      currentVotes,
    });

    if (currentVotes >= votesNeeded) {
      this.startRematch(roomId);
    }
  }

  private startRematch(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Save player info before resetting
    const playerInfos = room.game.players.map(p => ({
      id: p.id,
      socketId: p.socketId,
      username: p.username,
      avatar: p.avatar,
      isAI: p.isAI,
      aiCharacter: p.aiCharacter,
      connected: p.connected,
      userId: p.userId,
    }));

    // Create a fresh game with same settings
    const game = new GameState(roomId, room.settings, this.validator);

    game.setCallbacks(
      (type, data, excludePlayer) => this.broadcastToRoom(roomId, type, data, excludePlayer),
      (pid, type, data) => this.sendToPlayer(pid, type, data),
      (reason) => this.handleGameOver(roomId, reason)
    );

    // Re-add all players
    for (const info of playerInfos) {
      game.addPlayer(info.id, info.socketId, info.username, info.avatar, info.isAI, info.aiCharacter, info.userId);
      const player = game.players.find(p => p.id === info.id);
      if (player) {
        player.connected = info.connected;
      }
    }

    room.game = game;
    room.rematchVotes = undefined;

    // Start the game
    game.startGame();

    // Send GAME_START to all connected human players
    for (const player of game.players) {
      if (!player.isAI && player.connected) {
        this.sendToPlayer(player.id, 'GAME_START', game.getStateForPlayer(player.id));
      }
    }

    // Trigger AI turn if AI goes first
    const currentPlayer = game.getCurrentPlayer();
    if (currentPlayer?.isAI) {
      this.triggerAITurn(roomId);
    }
  }

  private cleanupPlayerRoom(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(playerId);
      this.updateSessionRoom(playerId, undefined);
      return;
    }

    if (room.game.status === 'finished') {
      // For finished games, just clean up the mapping
      this.playerRooms.delete(playerId);
      this.updateSessionRoom(playerId, undefined);
      return;
    }

    if (room.game.status === 'playing') {
      // For in-progress games, remove the player from the room
      const player = room.game.players.find(p => p.id === playerId);
      if (player) player.connected = false;
      this.playerRooms.delete(playerId);
      this.updateSessionRoom(playerId, undefined);

      // For solo games, end the game immediately since the human left
      if (room.isSolo) {
        room.game.endGame('resign', playerId);
      }
      return;
    }

    if (room.game.status !== 'waiting') return;

    room.game.removePlayer(playerId);
    this.playerRooms.delete(playerId);
    this.updateSessionRoom(playerId, undefined);

    if (room.game.players.filter(p => !p.isAI).length === 0 || room.hostId === playerId) {
      // Room closes if no humans left or if the host left
      this.broadcastToRoom(roomId, 'ROOM_CLOSED', { reason: 'Host left the room' });
      // Clean up all remaining players
      for (const p of room.game.players) {
        if (!p.isAI) {
          this.playerRooms.delete(p.id);
          this.updateSessionRoom(p.id, undefined);
        }
      }
      this.rooms.delete(roomId);
    } else {
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
      // Don't drag user back to finished game — clean up and return false
      this.playerRooms.delete(playerId);
      this.updateSessionRoom(playerId, undefined);
      return false;
    }

    return true;
  }

  // --- AI Hint ---

  async handleHintRequest(playerId: string): Promise<void> {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room || room.game.status !== 'playing') return;

    // Only allow hints in friendly games with allowHint enabled
    if (!room.game.settings.allowHint) {
      this.sendToPlayer(playerId, 'HINT_RESULT', { error: 'Hints are not enabled for this game' });
      return;
    }

    // Only allow hints on the player's own turn
    const currentPlayer = room.game.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerId) {
      this.sendToPlayer(playerId, 'HINT_RESULT', { error: 'Not your turn' });
      return;
    }

    // Use goody character for hints
    const move = await this.ai.findMove(
      room.game.board,
      currentPlayer.rack,
      'goody'
    );

    if (!move) {
      this.sendToPlayer(playerId, 'HINT_RESULT', { error: 'No valid moves found' });
      return;
    }

    // Send the suggested placements back to the client
    this.sendToPlayer(playerId, 'HINT_RESULT', {
      placements: move.placements.map(p => ({
        tileId: p.tile.id,
        letter: p.tile.letter,
        points: p.tile.points,
        isBlank: p.tile.isBlank,
        chosenLetter: p.tile.chosenLetter,
        row: p.row,
        col: p.col,
      })),
      score: move.score,
      words: move.words,
    });
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
      currentPlayer.aiCharacter || 'okie'
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

  private handleGameOver(roomId: string, reason: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.saveGameStats(room, reason);

    // Clean up finished room after 30 minutes
    setTimeout(() => {
      const r = this.rooms.get(roomId);
      if (!r || r.game.status !== 'finished') return;

      for (const player of r.game.players) {
        if (!player.isAI) {
          this.playerRooms.delete(player.id);
          this.updateSessionRoom(player.id, undefined);
        }
      }
      this.rooms.delete(roomId);
    }, 30 * 60 * 1000);
  }

  private saveGameStats(room: Room, reason: string): void {
    const game = room.game;

    if (game.settings.gameType !== 'formal') return;

    // Build player records and check for logged-in players
    let hasLoggedInPlayer = false;
    const playerRecords: GamePlayerRecord[] = game.players.map(p => {
      const sessionId = this.playerSessions.get(p.id);
      const session = sessionId ? this.sessions.get(sessionId) : undefined;
      const userId = session?.userId;
      if (userId) hasLoggedInPlayer = true;

      return {
        playerId: p.id,
        userId,
        username: p.username,
        avatar: p.avatar,
        score: p.score,
        isAI: p.isAI,
        aiCharacter: p.aiCharacter,
        stats: {},
      };
    });

    if (!hasLoggedInPlayer) return;

    // Recompute the same stats/summary that endGame sends in GAME_OVER
    // We can access them from the game's state directly
    const finalScores: { [id: string]: number } = {};
    for (const p of game.players) {
      finalScores[p.id] = p.score;
    }
    const winner = game.players.reduce((best, p) =>
      p.score > best.score ? p : best,
      game.players[0]
    );

    // Per-player stats (mirrors endGame logic)
    for (const rec of playerRecords) {
      const p = game.players.find(pl => pl.id === rec.playerId);
      if (!p) continue;
      const playerTurns = game.turnHistory.filter(t => t.playerId === p.id && t.action === 'play');
      const allWords = playerTurns.flatMap(t => t.wordsFormed || []);
      const bestWord = allWords.length > 0
        ? allWords.reduce((best, w) => w.score > best.score ? w : best, allWords[0])
        : null;
      const bestTurn = playerTurns.length > 0
        ? playerTurns.reduce((best, t) => t.totalScore > best.totalScore ? t : best, playerTurns[0])
        : null;
      const longestWord = allWords.length > 0
        ? allWords.reduce((best, w) => w.word.length > best.word.length ? w : best, allWords[0])
        : null;
      const totalTurns = game.turnHistory.filter(t => t.playerId === p.id).length;
      const playTurns = playerTurns.length;
      const avgScore = playTurns > 0 ? Math.round(playerTurns.reduce((sum, t) => sum + t.totalScore, 0) / playTurns) : 0;
      const bingoCount = playerTurns.filter(t => (t.tilesPlayed?.length || 0) === 7).length;
      const passCount = game.turnHistory.filter(t => t.playerId === p.id && t.action === 'pass').length;
      const exchangeCount = game.turnHistory.filter(t => t.playerId === p.id && t.action === 'exchange').length;
      const tilesUsed = playerTurns.reduce((sum, t) => sum + (t.tilesPlayed?.length || 0), 0);
      const rackValue = p.rack.reduce((sum: number, t: any) => sum + (t.points || 0), 0);

      rec.stats = {
        score: p.score,
        tilesRemaining: p.rack.length,
        rackDeduction: rackValue,
        bestWord: bestWord ? { word: bestWord.word, score: bestWord.score } : null,
        bestTurn: bestTurn ? { turnNumber: bestTurn.turnNumber, score: bestTurn.totalScore, wordCount: (bestTurn.wordsFormed?.length || 0) } : null,
        longestWord: longestWord ? { word: longestWord.word, length: longestWord.word.length } : null,
        totalWords: allWords.length,
        totalTurns,
        playTurns,
        avgScorePerTurn: avgScore,
        bingoCount,
        passCount,
        exchangeCount,
        tilesUsed,
        timeRemaining: p.timerRemaining,
      };
    }

    // Compute overall game summary
    const allPlayTurns = game.turnHistory.filter(t => t.action === 'play');
    const allGameWords = allPlayTurns.flatMap(t => t.wordsFormed || []);
    const totalRounds = Math.max(0, ...game.players.map(p => game.turnHistory.filter(t => t.playerId === p.id).length));
    const totalScoreAll = game.players.reduce((sum, p) => sum + p.score, 0);
    const avgScoreAll = game.players.length > 0 ? Math.round(totalScoreAll / game.players.length) : 0;
    const totalBingos = allPlayTurns.filter(t => (t.tilesPlayed?.length || 0) === 7).length;
    const totalPasses = game.turnHistory.filter(t => t.action === 'pass').length;
    const totalExchanges = game.turnHistory.filter(t => t.action === 'exchange').length;
    const totalTilesUsed = allPlayTurns.reduce((sum, t) => sum + (t.tilesPlayed?.length || 0), 0);
    const overallBestWord = allGameWords.length > 0
      ? allGameWords.reduce((best, w) => w.score > best.score ? w : best, allGameWords[0])
      : null;
    const overallBestWordPlayer = overallBestWord
      ? allPlayTurns.find(t => (t.wordsFormed || []).some(w => w.word === overallBestWord.word && w.score === overallBestWord.score))
      : null;
    const overallBestTurn = allPlayTurns.length > 0
      ? allPlayTurns.reduce((best, t) => t.totalScore > best.totalScore ? t : best, allPlayTurns[0])
      : null;
    const overallLongestWord = allGameWords.length > 0
      ? allGameWords.reduce((best, w) => w.word.length > best.word.length ? w : best, allGameWords[0])
      : null;
    const overallLongestWordPlayer = overallLongestWord
      ? allPlayTurns.find(t => (t.wordsFormed || []).some(w => w.word === overallLongestWord.word && w.word.length === overallLongestWord.word.length))
      : null;

    // Build player ID → index map for compact storage
    const pidToIdx: { [id: string]: number } = {};
    game.players.forEach((p, i) => { pidToIdx[p.id] = i; });

    // Compute score progression (cumulative score after each turn) — keyed by player index
    const cumulativeScores: { [id: string]: number } = {};
    for (const p of game.players) cumulativeScores[p.id] = 0;
    const scoreProgression: { [idx: number]: { turn: number; score: number }[] } = {};
    const turnEvents: { turn: number; pIdx: number; type: string }[] = [];
    for (const p of game.players) scoreProgression[pidToIdx[p.id]] = [{ turn: 0, score: 0 }];
    for (const entry of game.turnHistory) {
      const idx = pidToIdx[entry.playerId];
      cumulativeScores[entry.playerId] = (cumulativeScores[entry.playerId] || 0) + entry.totalScore;
      scoreProgression[idx]?.push({ turn: entry.turnNumber, score: cumulativeScores[entry.playerId] });
      if (entry.action === 'play' && (entry.tilesPlayed?.length || 0) === 7) {
        turnEvents.push({ turn: entry.turnNumber, pIdx: idx, type: 'bingo' });
      } else if (entry.action === 'pass') {
        turnEvents.push({ turn: entry.turnNumber, pIdx: idx, type: 'pass' });
      } else if (entry.action === 'exchange') {
        turnEvents.push({ turn: entry.turnNumber, pIdx: idx, type: 'exchange' });
      }
    }
    // Add final data points reflecting post-deduction scores
    const lastTurn = game.turnHistory.length > 0 ? game.turnHistory[game.turnHistory.length - 1].turnNumber : 0;
    const finalTurnNum = lastTurn + 1;
    for (const p of game.players) {
      const idx = pidToIdx[p.id];
      const arr = scoreProgression[idx];
      const lastPt = arr?.[arr.length - 1];
      if (lastPt && lastPt.score !== p.score) {
        arr.push({ turn: finalTurnNum, score: p.score });
      }
    }

    // Compact turnHistory: replace playerId with pIdx, abbreviate action
    const actionMap: Record<string, string> = { play: 'p', pass: 's', exchange: 'x' };
    const compactTurnHistory = game.turnHistory.map((t: any) => {
      const { playerId, username, ...rest } = t;
      return { ...rest, action: actionMap[rest.action] || rest.action, pIdx: pidToIdx[playerId] };
    });

    const firstTurn = game.turnHistory[0];
    const lastActiveTurn = [...game.turnHistory].reverse().find(t => t.action === 'play' || t.action === 'pass' || t.action === 'exchange');
    const totalTimeUsed = (firstTurn && lastActiveTurn && firstTurn !== lastActiveTurn)
      ? Math.round((lastActiveTurn.timestamp.getTime() - firstTurn.timestamp.getTime()) / 1000)
      : 0;

    const savedReason = reason === 'resign' ? 'resign'
      : reason === 'timeout' ? 'timeout'
      : reason === 'timeout_penalty' ? 'timeout_penalty'
      : reason === 'all_passed' ? 'all_passed'
      : 'completed';

    saveGameRecord({
      gameId: game.roomId,
      players: playerRecords,
      winnerIdx: pidToIdx[winner.id],
      reason: savedReason,
      gameSummary: {
        totalTurns: game.turnHistory.length,
        totalRounds,
        totalScoreAll,
        avgScoreAll,
        totalWordsPlayed: allGameWords.length,
        totalBingos,
        totalPasses,
        totalExchanges,
        totalTilesUsed,
        totalTimeUsed,
        bestWord: overallBestWord ? { word: overallBestWord.word, score: overallBestWord.score, pIdx: overallBestWordPlayer ? pidToIdx[overallBestWordPlayer.playerId] : 0 } : null,
        bestTurn: overallBestTurn ? { turnNumber: overallBestTurn.turnNumber, score: overallBestTurn.totalScore, pIdx: pidToIdx[overallBestTurn.playerId] } : null,
        longestWord: overallLongestWord ? { word: overallLongestWord.word, length: overallLongestWord.word.length, pIdx: overallLongestWordPlayer ? pidToIdx[overallLongestWordPlayer.playerId] : 0 } : null,
      },
      scoreProgression,
      turnEvents,
      turnHistory: compactTurnHistory,
      settings: {
        ...(({ gameType, timeoutMode, ...rest }) => rest)(game.settings),
        timeoutMode: game.settings.timeLimit === 0 ? 'N/A' : (game.settings.timeoutMode === 'penalty' ? 'OT' : 'SD'),
      },
      isSolo: game.players.filter(p => !p.isAI).length === 1 && game.players.some(p => p.isAI),
      endedAt: new Date(),
    });
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
      if (room.game.status === 'waiting' && !room.isSolo && room.settings.publicRoom) {
        rooms.push({
          id,
          hostId: room.hostId,
          host: room.game.players.find(p => p.id === room.hostId)?.username || 'Unknown',
          playerCount: room.game.players.filter(p => !p.isAI).length,
          aiCount: room.game.players.filter(p => p.isAI).length,
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
