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
}

export class GameManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId
  private playerSockets: Map<string, WebSocket> = new Map(); // playerId -> socket
  private socketPlayers: Map<WebSocket, string> = new Map(); // socket -> playerId
  private validator: Validator;
  private ai: AI;
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.validator = new Validator();
    this.ai = new AI(this.validator);
  }

  createRoom(playerId: string, socket: WebSocket, username: string, avatar: string, elo: number, settings: GameSettings, aiDifficulty?: 'easy' | 'medium' | 'hard'): Room {
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const game = new GameState(roomId, settings, this.validator);
    
    game.setCallbacks(
      (type, data, excludePlayer) => this.broadcastToRoom(roomId, type, data, excludePlayer),
      (pid, type, data) => this.sendToPlayer(pid, type, data),
      () => this.handleGameOver(roomId)
    );

    game.addPlayer(playerId, socket.toString(), username, avatar, elo);
    
    const room: Room = { id: roomId, hostId: playerId, game, settings };
    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);

    // Add AI players if solo game (maxPlayers 1 or 2 with AI flag)
    if (aiDifficulty) {
      const aiId = uuidv4();
      game.addPlayer(aiId, '', 'AI Bot', '🤖', 1200, true, aiDifficulty);
    }

    return room;
  }

  joinRoom(roomId: string, playerId: string, socket: WebSocket, username: string, avatar: string, elo: number): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    const player = room.game.addPlayer(playerId, socket.toString(), username, avatar, elo);
    if (!player) return null;

    this.playerRooms.set(playerId, roomId);
    this.playerSockets.set(playerId, socket);
    this.socketPlayers.set(socket, playerId);

    return room;
  }

  startGame(playerId: string): boolean {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return false;
    
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== playerId) return false;

    const started = room.game.startGame();
    if (!started) return false;

    // Send game start to each player with their own rack
    for (const player of room.game.players) {
      if (!player.isAI) {
        this.sendToPlayer(player.id, 'GAME_START', room.game.getStateForPlayer(player.id));
      }
    }

    // If first player is AI, trigger AI turn
    const currentPlayer = room.game.getCurrentPlayer();
    if (currentPlayer?.isAI) {
      this.triggerAITurn(roomId);
    }

    return true;
  }

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
      // Send accepted to all
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

      // Send updated state to each player
      this.sendGameStateToAll(roomId);

      // Check if game is over
      if (room.game.status === 'finished') return;

      // Trigger AI turn if needed
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

  handleDisconnect(socket: WebSocket): void {
    const playerId = this.socketPlayers.get(socket);
    if (!playerId) return;

    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.game.players.find(p => p.id === playerId);
    if (player) {
      player.connected = false;
    }

    // Clean up socket maps
    this.socketPlayers.delete(socket);
    this.playerSockets.delete(playerId);

    // If game is waiting, remove player
    if (room.game.status === 'waiting') {
      room.game.removePlayer(playerId);
      this.playerRooms.delete(playerId);
      
      if (room.game.players.length === 0) {
        this.rooms.delete(roomId);
      } else {
        this.broadcastToRoom(roomId, 'ROOM_UPDATE', room.game.getPublicState());
      }
      return;
    }

    // If game is playing, give 60 seconds to reconnect
    this.broadcastToRoom(roomId, 'PLAYER_DISCONNECTED', { playerId });
    
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      // Auto-pass remaining turns
      if (room.game.status === 'playing') {
        const current = room.game.getCurrentPlayer();
        if (current?.id === playerId) {
          room.game.passTurn(playerId);
          this.broadcastToRoom(roomId, 'TURN_PASSED', { playerId, reason: 'disconnect_timeout' });
          this.sendGameStateToAll(roomId);
        }
      }
    }, 60000);
    
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

    // Send full game state
    this.sendToPlayer(playerId, 'RECONNECTED', room.game.getStateForPlayer(playerId));
    this.broadcastToRoom(roomId, 'PLAYER_RECONNECTED', { playerId }, playerId);

    return true;
  }

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
      // AI passes
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

    // Place tiles
    for (const placement of move.placements) {
      room.game.placeTile(
        currentPlayer.id,
        placement.tile.id,
        placement.row,
        placement.col,
        placement.tile.chosenLetter
      );
    }

    // Submit
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
      // AI failed to submit, pass instead
      room.game.recallTiles(currentPlayer.id);
      room.game.passTurn(currentPlayer.id);
      this.broadcastToRoom(roomId, 'TURN_PASSED', { playerId: currentPlayer.id });
      this.sendGameStateToAll(roomId);
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
    // Room stays for rematch purposes
  }

  getRoomList(): any[] {
    const rooms: any[] = [];
    for (const [id, room] of this.rooms) {
      if (room.game.status === 'waiting') {
        rooms.push({
          id,
          host: room.game.players[0]?.username || 'Unknown',
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
