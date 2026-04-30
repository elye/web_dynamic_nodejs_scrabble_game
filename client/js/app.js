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
      // Check if URL has a room to auto-join (only after we have a playerId)
      if (window.playerId) {
        checkUrlRoomCode();
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

    case 'LEFT_ROOM': {
      showScreen('lobby-screen');
      if (msg.rooms) updateRoomList(msg.rooms);
      // Check if URL has a room to join after leaving
      checkUrlRoomCode();
      break;
    }
      
    case 'GAME_START':
    case 'GAME_STATE':
      handleGameState(msg);
      break;
      
    case 'RECONNECTED': {
      // Check if URL has a different room code — if so, leave old game and join new room
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoom = urlParams.get('room');
      if (urlRoom && msg.roomId && urlRoom.toUpperCase() !== msg.roomId.toUpperCase()) {
        // Leave current game — LEFT_ROOM handler will trigger join via checkUrlRoomCode
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
          window.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
        }
        break;
      }
      handleGameState(msg);
      break;
    }
      
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
  
  // Clear client-side pending tiles (will restore from server state below if needed)
  if (pendingTiles.length > 0) {
    pendingTiles = [];
    removeScoreHint();
  }
  
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
  
  // Restore server-side pending placements
  if (msg.pendingPlacements && msg.pendingPlacements.length > 0) {
    for (const p of msg.pendingPlacements) {
      pendingTiles.push({
        tileId: p.tileId,
        letter: p.letter,
        points: p.points,
        isBlank: p.isBlank,
        chosenLetter: p.chosenLetter,
        row: p.row,
        col: p.col,
      });
    }
    renderBoard();
    setTimeout(requestScorePreview, 150);
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
  // If we had tentative tiles on the board (placed during opponent's turn), recall them
  if (pendingTiles.length > 0 && msg.playerId !== window.playerId) {
    recallAllTiles();
  }
  
  // Clear pending tiles (for the submitter)
  if (msg.playerId === window.playerId) {
    pendingTiles = [];
  }
  
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
  
  // Show turn score on the board near last played tiles
  if (msg.totalTurnScore && msg.tilesPlayed && msg.tilesPlayed.length > 0) {
    removeScoreHint();
    showBoardScoreIndicator(msg.tilesPlayed, msg.totalTurnScore);
  }
}

function handleWordRejected(msg) {
  shakePendingTiles();
  // Show error notification
  showNotification(msg.reason || 'Invalid word!', 'error');
}

let gameOverStats = null;
let gameOverSummary = null;
let gameOverProgression = null;
let gameOverTurnEvents = null;

function handleGameOver(msg) {
  gameStatus = 'finished';
  gameOverStats = msg.stats || null;
  gameOverSummary = msg.gameSummary || null;
  gameOverProgression = msg.scoreProgression || null;
  gameOverTurnEvents = msg.turnEvents || null;
  
  // Update currentPlayers scores to reflect end-game deductions
  if (msg.finalScores) {
    for (const player of currentPlayers) {
      if (msg.finalScores[player.id] !== undefined) {
        player.score = msg.finalScores[player.id];
      }
    }
  }
  
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

function drawScoreGraph(canvas, players, progression, turnEvents) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const pad = { top: 20, right: 20, bottom: 30, left: 45 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Find max turn and max score
  let maxTurn = 0, maxVal = 0;
  for (const player of players) {
    const data = progression[player.id] || [];
    for (const pt of data) {
      if (pt.turn > maxTurn) maxTurn = pt.turn;
      if (pt.score > maxVal) maxVal = pt.score;
    }
  }
  if (maxTurn === 0) maxTurn = 1;
  if (maxVal === 0) maxVal = 100;
  maxVal = Math.ceil(maxVal / 50) * 50; // round up to nearest 50

  const xScale = (t) => pad.left + (t / maxTurn) * plotW;
  const yScale = (s) => pad.top + plotH - (s / maxVal) * plotH;

  // Grid lines and labels
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((maxVal / ySteps) * i);
    const y = yScale(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(val, pad.left - 6, y + 3);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  const xLabelCount = Math.min(maxTurn, 10);
  for (let i = 0; i <= xLabelCount; i++) {
    const turn = Math.round((maxTurn / xLabelCount) * i);
    ctx.fillText(turn, xScale(turn), h - pad.bottom + 18);
  }
  ctx.fillText('Turn', w / 2, h - 2);

  // Draw lines for each player
  for (const player of players) {
    const data = progression[player.id] || [];
    if (data.length < 2) continue;

    const color = getAvatarColor(player.id);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xScale(data[0].turn), yScale(data[0].score));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(xScale(data[i].turn), yScale(data[i].score));
    }
    ctx.stroke();

    // Dot at end
    const last = data[data.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(xScale(last.turn), yScale(last.score), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw turn event markers
  if (turnEvents && turnEvents.length > 0) {
    for (const evt of turnEvents) {
      const playerData = progression[evt.playerId];
      if (!playerData) continue;
      // Find the score at this turn
      const pt = playerData.find(d => d.turn === evt.turn);
      if (!pt) continue;
      
      const x = xScale(pt.turn);
      const y = yScale(pt.score);
      const color = getAvatarColor(evt.playerId);

      if (evt.type === 'bingo') {
        // Star marker for bingo
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        drawStar(ctx, x, y, 7, 5, 3);
        ctx.fill();
        ctx.stroke();
      } else if (evt.type === 'timeout') {
        // Down-arrow marker for timeout/penalty
        ctx.fillStyle = '#ff6b35';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x - 6, y - 4);
        ctx.lineTo(x - 2, y - 4);
        ctx.lineTo(x - 2, y - 8);
        ctx.lineTo(x + 2, y - 8);
        ctx.lineTo(x + 2, y - 4);
        ctx.lineTo(x + 6, y - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Red X marker for pass/exchange
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4);
        ctx.lineTo(x - 4, y + 4);
        ctx.stroke();
      }
    }
  }
}

function drawStar(ctx, cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
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
    { label: '📊 Avg/Turn', key: 'avgScorePerTurn', format: (s) => `${s.avgScorePerTurn} pts <span class="stat-sub">(${s.playTurns} plays)</span>` },
    { label: '📝 Words', key: 'totalWords', format: (s) => `${s.totalWords}` },
    { label: '🔄 Turns', key: 'totalTurns', format: (s) => `${s.totalTurns}` },
    { label: '🌟 Bingos', key: 'bingoCount', format: (s) => `${s.bingoCount}` },
    { label: '⏭ Passes', key: 'passCount', format: (s) => `${s.passCount}` },
    { label: '🔄 Exchanges', key: 'exchangeCount', format: (s) => `${s.exchangeCount}` },
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

  // Overall game summary
  if (gameOverSummary) {
    const gs = gameOverSummary;
    const overallDiv = document.createElement('div');
    overallDiv.className = 'game-overall-summary';
    overallDiv.innerHTML = `
      <h3>Game Overview</h3>
      <div class="overall-highlights-boxes">
        ${gs.bestWord ? `<div class="overall-stat highlight-stat"><span class="overall-stat-val">${gs.bestWord.word.toUpperCase()}</span><span class="overall-stat-lbl">🎯 Best Word (${gs.bestWord.score}pts)</span><span class="overall-stat-by">by ${escapeHtml(gs.bestWord.player)}</span></div>` : ''}
        ${gs.bestTurn ? `<div class="overall-stat highlight-stat"><span class="overall-stat-val">#${gs.bestTurn.turnNumber} (${gs.bestTurn.score}pts)</span><span class="overall-stat-lbl">🔥 Best Turn</span><span class="overall-stat-by">by ${escapeHtml(gs.bestTurn.player)}</span></div>` : ''}
        ${gs.longestWord ? `<div class="overall-stat highlight-stat"><span class="overall-stat-val">${gs.longestWord.word.toUpperCase()}</span><span class="overall-stat-lbl">📏 Longest (${gs.longestWord.length}L)</span><span class="overall-stat-by">by ${escapeHtml(gs.longestWord.player)}</span></div>` : ''}
      </div>
      <div class="overall-stats-grid">
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalRounds}</span><span class="overall-stat-lbl">Rounds</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalTurns}</span><span class="overall-stat-lbl">Total Turns</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalScoreAll}</span><span class="overall-stat-lbl">Combined Score</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.avgScoreAll}</span><span class="overall-stat-lbl">Avg Score</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalWordsPlayed}</span><span class="overall-stat-lbl">Words Played</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalTilesUsed || 0}</span><span class="overall-stat-lbl">Tiles Used</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalBingos || 0}</span><span class="overall-stat-lbl">Bingos</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalPasses || 0}/${gs.totalExchanges || 0}</span><span class="overall-stat-lbl">Pass / Exchange</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalTimeUsed > 0 ? formatTime(gs.totalTimeUsed) : 'N/A'}</span><span class="overall-stat-lbl">Time Used</span></div>
      </div>
    `;
    content.appendChild(overallDiv);
  }

  // Score progression line graph
  if (gameOverProgression) {
    const graphDiv = document.createElement('div');
    graphDiv.className = 'score-graph-section';
    graphDiv.innerHTML = '<h3>Score Progression</h3>';
    const canvas = document.createElement('canvas');
    canvas.className = 'score-graph-canvas';
    canvas.width = 600;
    canvas.height = 240;
    graphDiv.appendChild(canvas);

    // Legend
    const legendDiv = document.createElement('div');
    legendDiv.className = 'score-graph-legend';
    for (const player of sorted) {
      const color = getAvatarColor(player.id);
      legendDiv.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeHtml(player.username)}</span>`;
    }
    legendDiv.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:#FFD700"></span>Bingo</span>`;
    legendDiv.innerHTML += `<span class="legend-item"><span style="font-size:0.8rem;color:#e74c3c">✕</span> Pass/Exchange</span>`;
    legendDiv.innerHTML += `<span class="legend-item"><span style="font-size:0.8rem;color:#ff6b35">▼</span> Timeout</span>`;
    graphDiv.appendChild(legendDiv);
    content.appendChild(graphDiv);

    // Draw line graph
    requestAnimationFrame(() => drawScoreGraph(canvas, sorted, gameOverProgression, gameOverTurnEvents));
  }
  
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
