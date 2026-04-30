// ============================================
// Main App - WebSocket Connection & State
// ============================================

window.ws = null;
window.playerId = null;
let gameStatus = 'lobby';

function getSessionId() {
  let sessionId = sessionStorage.getItem('scrabble_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : 
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    sessionStorage.setItem('scrabble_session_id', sessionId);
  }
  return sessionId;
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  window.ws = new WebSocket(wsUrl);
  
  window.ws.onopen = () => {
    console.log('WebSocket connected');
    const username = document.getElementById('username-input').value.trim() || 'Player';
    window.ws.send(JSON.stringify({
      type: 'JOIN_LOBBY',
      sessionId: getSessionId(),
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
      if (document.getElementById('waiting-screen').classList.contains('active')) {
        updateWaitingRoom(msg);
      }
      break;

    case 'LEFT_ROOM':
      showScreen('lobby-screen');
      if (msg.rooms) updateRoomList(msg.rooms);
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
      
    case 'SCORE_PREVIEW':
      updateScoreHint(msg);
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
      showNotification(msg.message || 'An error occurred', 'error');
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
  
  // Track last move tiles for highlighting
  lastMoveTiles.clear();
  if (msg.tilesPlayed) {
    for (const tp of msg.tilesPlayed) {
      lastMoveTiles.add(`${tp.row},${tp.col}`);
    }
  }
  
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

let gameOverStats = null;

function handleGameOver(msg) {
  gameStatus = 'finished';
  gameOverStats = msg.stats || null;
  showEndgameButtons();
  
  // Show winner notification
  const winner = currentPlayers.find(p => p.id === msg.winner);
  if (winner) {
    showNotification(`${winner.username} wins! 🎉`, 'success');
  }
  
  // Auto-show round summary
  setTimeout(() => showRoundSummary(), 500);
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
  // Exit game / Back to menu
  document.getElementById('exit-game-btn').addEventListener('click', () => {
    if (gameStatus === 'playing') {
      if (!confirm('Are you sure you want to leave the game? This will count as a resignation.')) {
        return;
      }
      if (window.ws && window.ws.readyState === WebSocket.OPEN) {
        window.ws.send(JSON.stringify({ type: 'RESIGN' }));
      }
    }
    showScreen('lobby-screen');
    gameStatus = 'lobby';
  });
  
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
  
  document.getElementById('select-all-exchange-btn').addEventListener('click', () => {
    document.querySelectorAll('.exchange-tile').forEach(el => el.classList.add('selected'));
  });
  
  document.getElementById('deselect-all-exchange-btn').addEventListener('click', () => {
    document.querySelectorAll('.exchange-tile').forEach(el => el.classList.remove('selected'));
  });
  
  document.getElementById('pass-only-btn').addEventListener('click', () => {
    const selectedTiles = document.querySelectorAll('.exchange-tile.selected');
    if (selectedTiles.length > 0) {
      if (!confirm('You have tiles selected. Pass without exchanging?')) {
        return;
      }
    }
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
  const playerCount = sorted.length;

  // Build table: players as columns, stats as rows
  const table = document.createElement('table');
  table.className = 'summary-table';

  // Header row with player avatars and names
  const thead = document.createElement('thead');
  let headerRow = '<tr><th class="stat-label-col"></th>';
  for (const player of sorted) {
    const initial = player.username.charAt(0).toUpperCase();
    const isWinner = player.score === maxScore && maxScore > 0;
    headerRow += `<th class="stat-player-col${isWinner ? ' winner' : ''}">
      <div class="player-avatar" style="background: ${getAvatarColor(player.id)}">${initial}</div>
      <div class="player-name">${escapeHtml(player.username)}${isWinner ? ' 🏆' : ''}</div>
    </th>`;
  }
  headerRow += '</tr>';
  thead.innerHTML = headerRow;
  table.appendChild(thead);

  // Stat rows
  const statRows = [
    { label: 'Score', key: 'score', format: (s) => `<span class="summary-score">${s.score}</span>` },
    { label: '⏱ Time Left', key: 'timeRemaining', format: (s) => formatTime(s.timeRemaining) },
    { label: '🎯 Best Word', key: 'bestWord', format: (s) => s.bestWord ? `${s.bestWord.word} <span class="stat-pts">${s.bestWord.score}pts</span>` : '-' },
    { label: '🔥 Best Turn', key: 'bestTurn', format: (s) => s.bestTurn ? `#${s.bestTurn.turnNumber} <span class="stat-pts">${s.bestTurn.score}pts</span> <span class="stat-sub">${s.bestTurn.wordCount}w</span>` : '-' },
    { label: '📏 Longest Word', key: 'longestWord', format: (s) => s.longestWord ? `${s.longestWord.word} <span class="stat-sub">${s.longestWord.length}L</span>` : '-' },
    { label: '📊 Avg/Turn', key: 'avgScorePerTurn', format: (s) => `${s.avgScorePerTurn} pts` },
    { label: '📝 Words', key: 'totalWords', format: (s) => `${s.totalWords}` },
    { label: '🌟 Bingos', key: 'bingoCount', format: (s) => `${s.bingoCount}` },
    { label: '🎒 Tiles Left', key: 'tilesRemaining', format: (s) => `${s.tilesRemaining} <span class="stat-sub">−${s.rackDeduction}pts</span>` },
  ];

  const tbody = document.createElement('tbody');
  for (const row of statRows) {
    let tr = `<tr><td class="stat-label-cell">${row.label}</td>`;
    for (const player of sorted) {
      const stats = gameOverStats ? gameOverStats[player.id] : null;
      const isWinner = player.score === maxScore && maxScore > 0;
      tr += `<td class="stat-value-cell${isWinner ? ' winner' : ''}">${stats ? row.format(stats) : '-'}</td>`;
    }
    tr += '</tr>';
    tbody.innerHTML += tr;
  }
  table.appendChild(tbody);
  content.appendChild(table);
  
  modal.classList.remove('hidden');
  
  // Remove old listener and add new one
  const closeBtn = document.getElementById('close-summary-btn');
  const newCloseBtn = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
  newCloseBtn.addEventListener('click', () => {
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
