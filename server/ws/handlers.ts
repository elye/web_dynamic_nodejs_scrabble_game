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
            const sessionId = message.sessionId;
            if (!sessionId) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'sessionId required' }));
              return;
            }

            const result = gameManager.resolveSession(
              sessionId, ws,
              message.username || 'Player',
              message.avatar || '',
              message.elo || 1200
            );
            playerId = result.playerId;

            if (result.reconnected && result.roomId) {
              // Already reconnected inside resolveSession — client will get
              // ROOM_JOINED or RECONNECTED from handleReconnect
              // But always send playerId so the client knows who they are
              ws.send(JSON.stringify({
                type: 'LOBBY_STATE',
                playerId,
                rooms: [],
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'LOBBY_STATE',
                playerId,
                rooms: gameManager.getRoomList(),
              }));
            }
            break;
          }

          case 'CREATE_SOLO': {
            if (!playerId) return;
            const room = gameManager.createSoloGame(
              playerId, ws,
              message.username || 'Player',
              message.avatar || '',
              message.elo || 1200,
              message.aiDifficulty || 'medium',
              message.timeLimit ?? 0,
              message.randomOrder || false
            );
            // GAME_START is already sent inside createSoloGame
            break;
          }

          case 'CREATE_ROOM': {
            if (!playerId) return;
            const settings = {
              maxPlayers: Math.min(4, Math.max(2, message.maxPlayers || 4)),
              timeLimit: message.timeLimit ?? 45,
              dictionary: message.dictionary || 'en_us',
              gameType: message.gameType || 'friend',
              timeoutMode: message.timeoutMode || 'sudden',
              randomOrder: message.randomOrder || false,
            };
            
            const room = gameManager.createRoom(
              playerId, ws,
              message.username || 'Player',
              message.avatar || '',
              message.elo || 1200,
              settings
            );
            
            ws.send(JSON.stringify({
              type: 'ROOM_CREATED',
              ...gameManager.getRoomState(room),
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
              ws.send(JSON.stringify({
                type: 'ROOM_JOINED',
                ...gameManager.getRoomState(room),
              }));
              // ROOM_UPDATE is already broadcast to others inside joinRoom
            } else {
              ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Could not join room. Room may be full, already started, or not found.',
              }));
            }
            break;
          }

          case 'LEAVE_ROOM': {
            if (!playerId) return;
            gameManager.handleLeaveRoom(playerId);
            ws.send(JSON.stringify({
              type: 'LEFT_ROOM',
              rooms: gameManager.getRoomList(),
            }));
            break;
          }

          case 'ADD_AI': {
            if (!playerId) return;
            const aiAdded = gameManager.addAIToRoom(playerId, message.aiDifficulty || 'medium');
            if (!aiAdded) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Could not add AI. Room may be full or you are not the host.',
              }));
            }
            break;
          }

          case 'REMOVE_AI': {
            if (!playerId) return;
            const aiRemoved = gameManager.removeAIFromRoom(playerId, message.playerId);
            if (!aiRemoved) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Could not remove AI.',
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
                message: 'Could not start game. You must be the host.',
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

          case 'PREVIEW_SCORE': {
            if (!playerId) return;
            gameManager.handlePreviewScore(playerId, message.placements);
            break;
          }

          case 'MOVE_TILE': {
            if (!playerId) return;
            gameManager.handleMoveTile(playerId, message.tileId, message.row, message.col);
            break;
          }

          case 'RECALL_TILE': {
            if (!playerId) return;
            gameManager.handleRecallSingleTile(playerId, message.tileId);
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

          case 'PING': {
            ws.send(JSON.stringify({ type: 'PONG' }));
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
      gameManager.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });
}
