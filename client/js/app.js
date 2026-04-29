// ============================================
// Main App - WebSocket Connection & State
// ============================================

window.ws = null;
window.playerId = null;
let gameStatus = 'lobby';

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  window.ws = new WebSocket(wsUrl);
  
  window.ws.onopen = () => {
    console.log('WebSocket connected');
    const username = document.getElementById('username-input').value.trim() || 'Player';
    window.ws.send(JSON.stringify({
      type: 'JOIN_LOBBY',
      username,
      avatar: '',
    }));
  };
  
  window.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  };
  
  window.ws.onclose = () => {
    console.log('WebSocket disconnected');
    setTimeout(connectWebSocket, 3000);
  };
  
  window.ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'LOBBY_STATE':
      if (msg.playerId) {
        window.playerId = msg.playerId;
      }
      if (msg.rooms) {
        updateRoomList(msg.rooms);
      }
      break;
      
    case 'ROOM_CREATED':
    case 'ROOM_JOINED':
      showScreen('waiting-screen');
      updateWaitingRoom(msg);
      break;
      
    case 'ROOM_UPDATE':
      updateWaitingRoom(msg);
      break;
      
    case 'GAME_START':
    case 'GAME_STATE':
      handleGameState(msg);
      break;
      
    case 'RECONNECTED':
      handleGameState(msg);
      break;
      
    case 'PLACE_TILE_RESULT':
      if (!msg.success) {
        console.warn('Place tile failed:', msg.error);
      }
      break;
      
    case 'TILES_RECALLED':
      if (msg.rack) {
        setRack(msg.rack);
        pendingTiles = [];
        renderBoard();
      }
      break;
      
    case 'WORD_ACCEPTED':
      handleWordAccepted(msg);
      break;
      
    case 'WORD_REJECTED':
      handleWordRejected(msg);
      break;
      
    case 'TURN_PASSED':
      // State update will come via GAME_STATE
      break;
      
    case 'TILES_EXCHANGED':
      break;
      
    case 'TILES_EXCHANGED_SELF':
      if (msg.rack) {
        setRack(msg.rack);
      }
      break;
      
    case 'TIMER_UPDATE':
      if (msg.timers) {
        updateTimers(msg.timers);
      }
      break;
      
    case 'CHAT':
      addChatMessage(msg);
      break;
      
    case 'GAME_OVER':
      handleGameOver(msg);
      break;
      
    case 'PLAYER_DISCONNECTED':
      console.log('Player disconnected:', msg.playerId);
      break;
      
    case 'PLAYER_RECONNECTED':
      console.log('Player reconnected:', msg.playerId);
      break;
      
    case 'ERROR':
      console.error('Server error:', msg.message);
      break;
      
    default:
      console.log('Unknown message:', msg);
  }
}

function handleGameState(msg) {
  gameStatus = msg.status;
  
  if (msg.status === 'playing' || msg.status === 'finished') {
    showScreen('game-screen');
    showGameActions();
  }
  
  // Update board
  if (msg.board) {
    updateBoardState(msg.board);
  }
  
  // Update rack
  if (msg.rack) {
    setRack(msg.rack);
  }
  
  // Update scoreboard
  if (msg.players) {
    updateScoreboard(msg.players, msg.currentTurn, msg.timers, msg.tileBagCount);
  }
  
  // Update game info
  if (msg.settings) {
    updateGameInfo(msg.settings);
  }
  
  // Update turn history
  if (msg.turnHistory) {
    updateTurnHistory(msg.turnHistory);
  }
  
  if (msg.status === 'finished') {
    showEndgameButtons();
  }
}

function handleWordAccepted(msg) {
  // Clear pending tiles
  pendingTiles = [];
  
  // Flash score
  if (msg.playerId) {
    flashScore(msg.playerId);
  }
}

function handleWordRejected(msg) {
  shakePendingTiles();
  // Show error notification
  showNotification(msg.reason || 'Invalid word!', 'error');
}

function handleGameOver(msg) {
  gameStatus = 'finished';
  showEndgameButtons();
  
  // Show winner notification
  const winner = currentPlayers.find(p => p.id === msg.winner);
  if (winner) {
    showNotification(`${winner.username} wins! 🎉`, 'success');
  }
}

function showNotification(text, type = 'info') {
  // Simple notification - create a temporary toast
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; border-radius: 8px; z-index: 2000;
    font-family: var(--font-family); font-weight: 600; font-size: 0.95rem;
    animation: fadeInOut 3s ease forwards;
    ${type === 'error' ? 'background: var(--danger); color: white;' :
      type === 'success' ? 'background: var(--success); color: white;' :
      'background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--accent);'}
  `;
  toast.textContent = text;
  
  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      15% { opacity: 1; transform: translateX(-50%) translateY(0); }
      85% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
    style.remove();
  }, 3000);
}

// ============================================
// Game Action Buttons
// ============================================

function initGameActions() {
  // Recall
  document.getElementById('recall-btn').addEventListener('click', recallAllTiles);
  
  // Submit
  document.getElementById('submit-btn').addEventListener('click', () => {
    if (pendingTiles.length === 0) {
      showNotification('Place some tiles first!', 'error');
      return;
    }
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'SUBMIT_WORD' }));
    }
  });
  
  // Pass / Exchange
  document.getElementById('pass-btn').addEventListener('click', showExchangeModal);
  
  // Exchange modal
  document.getElementById('cancel-exchange-btn').addEventListener('click', () => {
    document.getElementById('exchange-modal').classList.add('hidden');
  });
  
  document.getElementById('pass-only-btn').addEventListener('click', () => {
    document.getElementById('exchange-modal').classList.add('hidden');
    recallAllTiles();
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'PASS_TURN' }));
    }
  });
  
  document.getElementById('confirm-exchange-btn').addEventListener('click', () => {
    const selected = document.querySelectorAll('.exchange-tile.selected');
    if (selected.length === 0) {
      showNotification('Select tiles to exchange', 'error');
      return;
    }
    
    const tileIds = Array.from(selected).map(el => el.dataset.tileId);
    document.getElementById('exchange-modal').classList.add('hidden');
    
    recallAllTiles();
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'EXCHANGE_TILES', tileIds }));
    }
  });
  
  // Endgame buttons
  document.getElementById('back-menu-btn').addEventListener('click', () => {
    showScreen('lobby-screen');
    gameStatus = 'lobby';
  });
  
  document.getElementById('rematch-btn').addEventListener('click', () => {
    showNotification('Rematch requested!', 'info');
  });
  
  document.getElementById('summary-btn').addEventListener('click', showRoundSummary);
}

function showExchangeModal() {
  // First recall any pending tiles
  recallAllTiles();
  
  const modal = document.getElementById('exchange-modal');
  const rack = document.getElementById('exchange-rack');
  rack.innerHTML = '';
  
  for (const tile of rackTiles) {
    const el = document.createElement('div');
    el.className = 'exchange-tile';
    el.dataset.tileId = tile.id;
    
    const displayLetter = tile.isBlank ? ' ' : tile.letter;
    el.innerHTML = `
      <span class="tile-letter">${displayLetter}</span>
      ${!tile.isBlank && tile.points > 0 ? `<span class="tile-points">${tile.points}</span>` : ''}
    `;
    
    el.addEventListener('click', () => {
      el.classList.toggle('selected');
    });
    
    rack.appendChild(el);
  }
  
  modal.classList.remove('hidden');
}

function showRoundSummary() {
  const modal = document.getElementById('summary-modal');
  const content = document.getElementById('summary-content');
  content.innerHTML = '';
  
  // Sort players by score
  const sorted = [...currentPlayers].sort((a, b) => b.score - a.score);
  const maxScore = sorted[0]?.score || 0;
  
  for (const player of sorted) {
    const div = document.createElement('div');
    div.className = 'summary-player';
    if (player.score === maxScore && maxScore > 0) {
      div.classList.add('winner');
    }
    
    const initial = player.username.charAt(0).toUpperCase();
    div.innerHTML = `
      <div class="summary-player-info">
        <div class="player-avatar" style="background: ${getAvatarColor(player.id)}">${initial}</div>
        <div>
          <div class="player-name">${escapeHtml(player.username)}${player.score === maxScore ? ' 🏆' : ''}</div>
          <div class="player-elo" style="color: var(--text-muted); font-size: 0.8rem;">Elo: ${player.elo}</div>
        </div>
      </div>
      <div class="summary-score">${player.score}</div>
    `;
    
    content.appendChild(div);
  }
  
  modal.classList.remove('hidden');
  
  document.getElementById('close-summary-btn').addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initBoard();
  initRack();
  initChat();
  initLobby();
  initGameActions();
  connectWebSocket();
});
