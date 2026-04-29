import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { GameManager } from '../game/GameManager';

export function setupWebSocketHandlers(wss: WebSocket.Server, gameManager: GameManager): void {
  wss.on('connection', (ws: WebSocket) => {
    let playerId: string | null = null;

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const message = JSON.parse(raw.toString());
        
        switch (message.type) {
          case 'JOIN_LOBBY': {
            playerId = uuidv4();
            gameManager.registerSocket(playerId, ws);
            
            ws.send(JSON.stringify({
              type: 'LOBBY_STATE',
              playerId,
              rooms: gameManager.getRoomList(),
            }));
            break;
          }

          case 'CREATE_ROOM': {
            if (!playerId) return;
            const settings = {
              maxPlayers: message.maxPlayers || 2,
              timeLimit: message.timeLimit || 45,
              dictionary: message.dictionary || 'en_us',
              gameType: message.gameType || 'friend',
            };
            
            const room = gameManager.createRoom(
              playerId, ws,
              message.username || 'Player',
              message.avatar || '',
              message.elo || 1200,
              settings,
              message.aiDifficulty
            );
            
            ws.send(JSON.stringify({
              type: 'ROOM_CREATED',
              roomId: room.id,
              ...room.game.getPublicState(),
            }));
            break;
          }

          case 'JOIN_ROOM': {
            if (!playerId) return;
            const room = gameManager.joinRoom(
              message.roomId,
              playerId, ws,
              message.username || 'Player',
              message.avatar || '',
              message.elo || 1200
            );
            
            if (room) {
              // Send room state to joining player
              ws.send(JSON.stringify({
                type: 'ROOM_JOINED',
                roomId: room.id,
                ...room.game.getPublicState(),
              }));
              
              // Broadcast to all in room
              broadcastToRoomExcept(gameManager, room.id, playerId, {
                type: 'ROOM_UPDATE',
                ...room.game.getPublicState(),
              });
            } else {
              ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Could not join room. Room may be full or not found.',
              }));
            }
            break;
          }

          case 'START_GAME': {
            if (!playerId) return;
            const started = gameManager.startGame(playerId);
            if (!started) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Could not start game',
              }));
            }
            break;
          }

          case 'PLACE_TILE': {
            if (!playerId) return;
            gameManager.handlePlaceTile(
              playerId,
              message.tileId,
              message.row,
              message.col,
              message.chosenLetter
            );
            break;
          }

          case 'RECALL_TILES': {
            if (!playerId) return;
            gameManager.handleRecallTiles(playerId);
            break;
          }

          case 'SUBMIT_WORD': {
            if (!playerId) return;
            gameManager.handleSubmitWord(playerId);
            break;
          }

          case 'PASS_TURN': {
            if (!playerId) return;
            gameManager.handlePassTurn(playerId);
            break;
          }

          case 'EXCHANGE_TILES': {
            if (!playerId) return;
            gameManager.handleExchangeTiles(playerId, message.tileIds || []);
            break;
          }

          case 'CHAT_MESSAGE': {
            if (!playerId) return;
            gameManager.handleChat(playerId, message.text || '');
            break;
          }

          case 'RESIGN': {
            if (!playerId) return;
            gameManager.handleResign(playerId);
            break;
          }

          case 'GET_ROOMS': {
            ws.send(JSON.stringify({
              type: 'LOBBY_STATE',
              rooms: gameManager.getRoomList(),
            }));
            break;
          }

          default:
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: `Unknown message type: ${message.type}`,
            }));
        }
      } catch (err) {
        console.error('Error handling message:', err);
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: 'Invalid message format',
        }));
      }
    });

    ws.on('close', () => {
      if (playerId) {
        gameManager.handleDisconnect(ws);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });
}

function broadcastToRoomExcept(gameManager: GameManager, roomId: string, excludePlayerId: string, data: any): void {
  const room = gameManager.getRoom(roomId);
  if (!room) return;
  // The GameManager handles broadcasting internally
}
