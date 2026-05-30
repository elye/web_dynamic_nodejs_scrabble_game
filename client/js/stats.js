// ============================================
// Stats Page - Past game statistics
// ============================================

let statsCurrentPage = 1;
let statsTotalPages = 1;

function initStats() {
  document.getElementById('stats-btn').addEventListener('click', () => {
    showScreen('stats-screen');
    loadStats();
  });

  document.getElementById('stats-back-btn').addEventListener('click', () => {
    showScreen('lobby-screen');
  });

  document.getElementById('stats-prev-btn').addEventListener('click', () => {
    if (statsCurrentPage > 1) {
      statsCurrentPage--;
      loadGames();
    }
  });

  document.getElementById('stats-next-btn').addEventListener('click', () => {
    if (statsCurrentPage < statsTotalPages) {
      statsCurrentPage++;
      loadGames();
    }
  });

  document.getElementById('stats-detail-close-btn').addEventListener('click', () => {
    document.getElementById('stats-detail-modal').classList.add('hidden');
  });

  document.getElementById('detail-tab-summary-btn').addEventListener('click', () => {
    switchDetailTab('summary');
  });
  document.getElementById('detail-tab-board-btn').addEventListener('click', () => {
    switchDetailTab('board');
  });

  initDangerZone();

  document.getElementById('advanced-settings-btn').addEventListener('click', () => {
    const dangerZone = document.querySelector('.danger-zone');
    dangerZone.classList.toggle('hidden');
  });
}

function switchDetailTab(tab) {
  document.getElementById('stats-detail-summary-panel').classList.toggle('hidden', tab !== 'summary');
  document.getElementById('stats-detail-board-panel').classList.toggle('hidden', tab !== 'board');
  document.getElementById('detail-tab-summary-btn').classList.toggle('active', tab === 'summary');
  document.getElementById('detail-tab-board-btn').classList.toggle('active', tab === 'board');
}

async function loadStats() {
  showStatsLoading(true);
  await Promise.all([loadSummary(), loadGames(), loadOpponents()]);
  showStatsLoading(false);
}

function showStatsLoading(loading) {
  const el = document.getElementById('stats-loading');
  const content = document.getElementById('stats-content');
  if (loading) {
    el.classList.remove('hidden');
    content.classList.add('hidden');
  } else {
    el.classList.add('hidden');
    content.classList.remove('hidden');
  }
}

function showStatsError(section, message) {
  const el = document.getElementById(`stats-${section}`);
  if (el) {
    el.innerHTML = `<p class="stats-error">${escapeHtml(message)}</p>`;
  }
}

// --- Summary ---
async function loadSummary() {
  try {
    const res = await fetch('/api/stats/summary');
    if (!res.ok) throw new Error('Failed to load stats');
    const data = await res.json();
    renderSummary(data);
  } catch {
    showStatsError('summary-grid', 'Could not load stats summary. Make sure you are signed in.');
  }
}

function renderSummary(data) {
  const grid = document.getElementById('stats-summary-grid');
  const totalGames = data.totalGames || 0;
  const wins = data.wins || 0;
  const second = data.second || 0;
  const third = data.third || 0;
  const fourth = data.fourth || 0;
  const bestScore1p = data.bestScore1p;
  const bestScore2p = data.bestScore2p;
  const bestScore3p = data.bestScore3p;
  const bestScore4p = data.bestScore4p;
  const bestWord = data.bestWord;
  const bestTurn = data.bestTurn;

  grid.innerHTML = `
    <div class="stats-stat-card">
      <span class="stats-stat-val">${totalGames}</span>
      <span class="stats-stat-lbl">Games Played</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${data.soloGames ?? 0}</span>
      <span class="stats-stat-lbl">🎮 Solo Games</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val stats-val-win">${wins}</span>
      <span class="stats-stat-lbl">🥇 1st Place</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${second}</span>
      <span class="stats-stat-lbl">🥈 2nd Place</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${third}</span>
      <span class="stats-stat-lbl">🥉 3rd Place</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${fourth}</span>
      <span class="stats-stat-lbl">4th Place</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${data.lastPlace ?? 0}</span>
      <span class="stats-stat-lbl">🪦 Last Place</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestScore1p ?? '-'}</span>
      <span class="stats-stat-lbl">Best Score (1P)</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestScore2p ?? '-'}</span>
      <span class="stats-stat-lbl">Best Score (2P)</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestScore3p ?? '-'}</span>
      <span class="stats-stat-lbl">Best Score (3P)</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestScore4p ?? '-'}</span>
      <span class="stats-stat-lbl">Best Score (4P)</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestWord ? bestWord.word.toUpperCase() : '-'}</span>
      <span class="stats-stat-lbl">${bestWord ? `Best Word (${bestWord.score}pts)` : 'Best Word'}</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestTurn ? bestTurn.score : '-'}</span>
      <span class="stats-stat-lbl">Best Turn Score</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${data.totalBingos ?? 0}</span>
      <span class="stats-stat-lbl">🎯 Bingos</span>
    </div>
  `;
}

// --- Games list ---
async function loadGames() {
  const container = document.getElementById('stats-games-body');
  container.innerHTML = '<tr><td colspan="6" class="stats-table-empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/stats/games?page=${statsCurrentPage}&limit=10`);
    if (!res.ok) throw new Error('Failed to load games');
    const data = await res.json();
    statsTotalPages = data.totalPages || 1;
    renderGames(data.games || []);
    updatePagination();
  } catch (err) {
    container.innerHTML = '<tr><td colspan="6" class="stats-table-empty">Could not load games.</td></tr>';
  }
}

function renderGames(games) {
  const body = document.getElementById('stats-games-body');
  if (games.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="stats-table-empty">No games played yet.</td></tr>';
    return;
  }

  body.innerHTML = '';
  for (const game of games) {
    const tr = document.createElement('tr');
    tr.className = 'stats-game-row';

    const date = new Date(game.endedAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

    // Find current user's player record and opponents
    const me = game.players.find(p => p.userId === window._logtoUserId);
    const opponents = game.players.filter(p => p.userId !== window._logtoUserId);
    const opponentNames = opponents.map(p => {
      const badge = p.isAI ? ' 🤖' : p.isDeleted ? ' <span class="deleted-badge" title="Deleted account">🚫</span>' : p.userId ? ' <span class="verified-badge" title="Registered player">✓</span>' : '';
      return escapeHtml(p.username) + badge;
    }).join(', ') || 'Solo';

    const myScore = me ? me.score : '-';
    const isWin = me && game.winnerId === me.playerId;

    // Compute position by ranking all players by score descending
    const ranked = [...game.players].sort((a, b) => b.score - a.score);
    const myRank = me ? ranked.findIndex(p => p.playerId === me.playerId) + 1 : 0;
    const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
    const isSoloGame = game.players.length === 1;

    const resultText = isSoloGame ? '-' : (isWin ? 'Win' : (ordinals[myRank] || `${myRank}th`));
    const resultClass = isSoloGame ? '' : (isWin ? 'stats-result-win' : 'stats-result-loss');

    let reason = game.reason || '';
    if (reason === 'all_passed') reason = 'All passed';
    else if (reason === 'empty_rack') reason = 'Empty rack';
    else if (reason === 'timeout') reason = 'Timeout';
    else if (reason === 'resignation') reason = 'Resigned';

    // Show delete button if no opponent is an active registered user
    const hasActiveRegisteredOpponent = opponents.some(p => p.userId && !p.isAI && !p.isDeleted);
    const deleteBtn = !hasActiveRegisteredOpponent
      ? `<button class="btn btn-sm btn-danger-outlined delete-game-btn" data-game-id="${escapeHtml(game.gameId)}" title="Delete this game">✕</button>`
      : '';

    const tl = game.settings?.timeLimit;
    const timeVal = tl === 0 || tl === undefined ? 'U' : `${tl}`;
    const toVal = game.timeoutMode === 'OT' || game.timeoutMode === 'penalty' ? 'OT' : game.timeoutMode === 'SD' || game.timeoutMode === 'sudden' ? 'SD' : '-';
    const timeType = `${timeVal}/${toVal}`;

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${opponentNames}</td>
      <td>${myScore}</td>
      <td><span class="${resultClass}">${resultText}</span></td>
      <td>${timeType}</td>
      <td class="stats-reason-cell">${reason}${deleteBtn}</td>
    `;

    tr.addEventListener('click', (e) => {
      // Don't open detail if clicking the delete button
      if (e.target.closest('.delete-game-btn')) return;
      loadGameDetail(game.gameId);
    });
    body.appendChild(tr);
  }

  // Attach delete handlers
  body.querySelectorAll('.delete-game-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const gameId = btn.dataset.gameId;
      if (!confirm('Delete this game from your history?')) return;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const res = await fetch(`/api/stats/games/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        // Reload games and summary
        await Promise.all([loadGames(), loadSummary(), loadOpponents()]);
      } catch {
        alert('Could not delete game. Please try again.');
        btn.disabled = false;
        btn.textContent = '✕';
      }
    });
  });
}

function updatePagination() {
  document.getElementById('stats-page-info').textContent = `Page ${statsCurrentPage} of ${statsTotalPages}`;
  document.getElementById('stats-prev-btn').disabled = statsCurrentPage <= 1;
  document.getElementById('stats-next-btn').disabled = statsCurrentPage >= statsTotalPages;
}

// --- Opponents ---
async function loadOpponents() {
  try {
    const res = await fetch('/api/stats/opponents');
    if (!res.ok) throw new Error('Failed to load opponents');
    const data = await res.json();
    renderOpponents(data);
  } catch (err) {
    showStatsError('opponents-body', 'Could not load opponent stats.');
  }
}

function renderOpponents(opponents) {
  const body = document.getElementById('stats-opponents-body');
  if (!opponents || opponents.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="stats-table-empty">No opponent data yet.</td></tr>';
    return;
  }

  body.innerHTML = '';
  for (const opp of opponents) {
    const tr = document.createElement('tr');
    const draws = (opp.totalGames || 0) - (opp.wins || 0) - (opp.losses || 0);
    const lastPlayed = opp.lastPlayed
      ? new Date(opp.lastPlayed).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : '-';
    const badge = opp.isAI ? ' 🤖' : opp.isRegistered ? ' <span class="verified-badge" title="Registered player">✓</span>' : ' <span style="color:var(--text-muted);font-size:0.75rem">(Guest)</span>';
    tr.innerHTML = `
      <td>${escapeHtml(opp.opponentName)}${badge}</td>
      <td class="stats-val-win">${opp.wins || 0}</td>
      <td class="stats-val-loss">${opp.losses || 0}</td>
      <td>${draws}</td>
      <td>${lastPlayed}</td>
    `;
    body.appendChild(tr);
  }
}

// --- Game Detail ---
async function loadGameDetail(gameId) {
  const modal = document.getElementById('stats-detail-modal');
  const content = document.getElementById('stats-detail-content');
  const summaryPanel = document.getElementById('stats-detail-summary-panel');
  const boardPanel = document.getElementById('stats-detail-board-panel');

  // Show modal with spinner, hide actual content
  summaryPanel.innerHTML = '';
  boardPanel.innerHTML = '';
  content.classList.add('hidden');
  let spinner = modal.querySelector('.detail-loading-spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.className = 'detail-loading-spinner';
    spinner.innerHTML = '<div class="spinner"></div><p>Loading game details...</p>';
    content.parentNode.insertBefore(spinner, content);
  }
  spinner.classList.remove('hidden');
  switchDetailTab('summary');
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/stats/games/${encodeURIComponent(gameId)}`);
    if (!res.ok) throw new Error('Game not found');
    const game = await res.json();
    renderGameDetail(game);
    spinner.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (err) {
    spinner.classList.add('hidden');
    content.classList.remove('hidden');
    summaryPanel.innerHTML = '<p class="stats-error">Could not load game details.</p>';
  }
}

// ---- Detail colour helper ----
const DETAIL_COLOR_PALETTE = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];
let _gameColorMap = {};

function buildGameColorMap(players) {
  _gameColorMap = {};
  players.forEach((p, i) => {
    _gameColorMap[p.playerId] = DETAIL_COLOR_PALETTE[i % DETAIL_COLOR_PALETTE.length];
  });
}

function getDetailColor(id) {
  if (_gameColorMap[id]) return _gameColorMap[id];
  // Fallback for contexts outside a loaded game
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DETAIL_COLOR_PALETTE[Math.abs(hash) % DETAIL_COLOR_PALETTE.length];
}

// ---- Score graph helpers (adapted from app.js drawScoreGraph / drawStar) ----
function _detailDrawStar(ctx, cx, cy, outerR, innerR, points) {
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

function drawDetailScoreGraph(canvas, players, progression, turnEvents) {
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
  maxVal = Math.ceil(maxVal / 50) * 50;

  const xScale = (t) => pad.left + (t / maxTurn) * plotW;
  const yScale = (s) => pad.top + plotH - (s / maxVal) * plotH;

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

  ctx.textAlign = 'center';
  const xLabelCount = Math.min(maxTurn, 10);
  for (let i = 0; i <= xLabelCount; i++) {
    const turn = Math.round((maxTurn / xLabelCount) * i);
    ctx.fillText(turn, xScale(turn), h - pad.bottom + 18);
  }
  ctx.fillText('Turn', w / 2, h - 2);

  for (const player of players) {
    const data = progression[player.id] || [];
    if (data.length < 2) continue;
    const color = getDetailColor(player.id);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xScale(data[0].turn), yScale(data[0].score));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(xScale(data[i].turn), yScale(data[i].score));
    }
    ctx.stroke();
    const last = data[data.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(xScale(last.turn), yScale(last.score), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (turnEvents && turnEvents.length > 0) {
    for (const evt of turnEvents) {
      const playerData = progression[evt.playerId];
      if (!playerData) continue;
      const pt = playerData.find(d => d.turn === evt.turn);
      if (!pt) continue;
      const x = xScale(pt.turn);
      const y = yScale(pt.score);
      const color = getDetailColor(evt.playerId);
      if (evt.type === 'bingo') {
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        _detailDrawStar(ctx, x, y, 7, 5, 3);
        ctx.fill();
        ctx.stroke();
      } else if (evt.type === 'timeout') {
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

// ---- Board reconstruction ----
function buildBoardFromHistory(turnHistory) {
  const board = Array(15).fill(null).map(() => Array(15).fill(null));
  if (!turnHistory) return board;
  for (const turn of turnHistory) {
    if (turn.action !== 'play' || !turn.tilesPlayed) continue;
    for (const tile of turn.tilesPlayed) {
      board[tile.row][tile.col] = {
        letter: tile.isBlank ? (tile.chosenLetter || tile.letter) : tile.letter,
        points: tile.isBlank ? 0 : tile.points,
        isBlank: !!tile.isBlank,
        playerId: turn.playerId,
      };
    }
  }
  return board;
}

// ---- Premium square definitions (mirrors board.js) ----
const DETAIL_PREMIUM = (() => {
  const map = {};
  const tw = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
  const dw = [[1,1],[2,2],[3,3],[4,4],[1,13],[2,12],[3,11],[4,10],
              [13,1],[12,2],[11,3],[10,4],[13,13],[12,12],[11,11],[10,10],[7,7]];
  const tl = [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]];
  const dl = [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
              [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]];
  tw.forEach(([r,c]) => { map[`${r},${c}`] = 'TW'; });
  dw.forEach(([r,c]) => { map[`${r},${c}`] = 'DW'; });
  tl.forEach(([r,c]) => { map[`${r},${c}`] = 'TL'; });
  dl.forEach(([r,c]) => { map[`${r},${c}`] = 'DL'; });
  return map;
})();

// ---- Board render ----
function renderDetailBoard(game, container) {
  const board = buildBoardFromHistory(game.turnHistory);
  const sorted = [...game.players].sort((a, b) => b.score - a.score);

  const wrapper = document.createElement('div');
  wrapper.className = 'detail-board-panel-inner';

  // Sidebar + board row layout
  const boardWithSidebar = document.createElement('div');
  boardWithSidebar.className = 'detail-board-with-sidebar';

  // ---- Turn history panel (left) ----
  const turnHistoryPanel = document.createElement('div');
  turnHistoryPanel.className = 'detail-turn-history';

  const turnHistoryTitle = document.createElement('div');
  turnHistoryTitle.className = 'detail-turn-history-title';
  turnHistoryTitle.textContent = 'Turn History';
  turnHistoryPanel.appendChild(turnHistoryTitle);

  const playTurns = (game.turnHistory || []).filter(t => t.action === 'play' || t.action === 'pass' || t.action === 'exchange');
  if (playTurns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'detail-turn-history-empty';
    empty.textContent = 'No turns recorded.';
    turnHistoryPanel.appendChild(empty);
  } else {
    for (const turn of playTurns) {
      const playerColor = getDetailColor(turn.playerId);
      const item = document.createElement('div');
      item.className = 'detail-turn-history-item';
      item.dataset.playerId = turn.playerId;

      const header = document.createElement('div');
      header.className = 'detail-turn-header';

      const numEl = document.createElement('span');
      numEl.className = 'detail-turn-num';
      numEl.textContent = `#${turn.turnNumber}`;

      const playerEl = document.createElement('span');
      playerEl.className = 'detail-turn-player';
      playerEl.style.color = playerColor;
      playerEl.textContent = turn.username || '';

      const scoreEl = document.createElement('span');
      scoreEl.className = 'detail-turn-score';
      scoreEl.textContent = turn.action === 'play' ? `+${turn.totalScore}` : '0';

      header.appendChild(numEl);
      header.appendChild(playerEl);
      header.appendChild(scoreEl);
      item.appendChild(header);

      if (turn.action === 'play' && turn.wordsFormed && turn.wordsFormed.length > 0) {
        const wordsDiv = document.createElement('div');
        wordsDiv.className = 'detail-turn-words';
        for (const w of turn.wordsFormed) {
          const wordEl = document.createElement('span');
          wordEl.className = 'detail-turn-word';
          wordEl.innerHTML = `${escapeHtml(w.word.toUpperCase())} <span class="detail-turn-word-pts">${w.score}</span>`;
          wordsDiv.appendChild(wordEl);
        }
        item.appendChild(wordsDiv);
      } else if (turn.action === 'pass') {
        const actionEl = document.createElement('div');
        actionEl.className = 'detail-turn-action-pass';
        actionEl.textContent = '⏭ Passed';
        item.appendChild(actionEl);
      } else if (turn.action === 'exchange') {
        const actionEl = document.createElement('div');
        actionEl.className = 'detail-turn-action-exchange';
        actionEl.textContent = '🔁 Exchanged';
        item.appendChild(actionEl);
      }

      turnHistoryPanel.appendChild(item);
    }
  }

  const boardWrap = document.createElement('div');
  boardWrap.className = 'detail-board-wrap';

  const boardWithHeaders = document.createElement('div');
  boardWithHeaders.className = 'detail-board-with-headers';

  // Column headers
  const colHeaders = document.createElement('div');
  colHeaders.className = 'detail-board-col-headers';
  for (let c = 0; c < 15; c++) {
    const h = document.createElement('div');
    h.className = 'detail-board-col-header';
    h.textContent = String.fromCharCode(65 + c);
    colHeaders.appendChild(h);
  }
  boardWithHeaders.appendChild(colHeaders);

  const boardBody = document.createElement('div');
  boardBody.className = 'detail-board-body';

  // Row headers
  const rowHeaders = document.createElement('div');
  rowHeaders.className = 'detail-board-row-headers';
  for (let r = 0; r < 15; r++) {
    const h = document.createElement('div');
    h.className = 'detail-board-row-header';
    h.textContent = r + 1;
    rowHeaders.appendChild(h);
  }
  boardBody.appendChild(rowHeaders);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'detail-board-grid';

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement('div');
      cell.className = 'detail-board-cell';

      const tile = board[r][c];
      if (tile) {
        const tileEl = document.createElement('div');
        tileEl.className = 'detail-board-tile';
        if (tile.isBlank) tileEl.classList.add('detail-blank-tile');
        tileEl.style.background = 'var(--tile-color)';
        tileEl.setAttribute('data-player-id', tile.playerId);

        const letterEl = document.createElement('span');
        letterEl.className = 'tile-letter';
        letterEl.textContent = tile.letter.toUpperCase();
        tileEl.appendChild(letterEl);

        if (!tile.isBlank && tile.points != null) {
          const ptsEl = document.createElement('span');
          ptsEl.className = 'tile-points';
          ptsEl.textContent = tile.points;
          tileEl.appendChild(ptsEl);
        }
        cell.appendChild(tileEl);
      } else {
        const key = `${r},${c}`;
        const premium = DETAIL_PREMIUM[key];
        if (r === 7 && c === 7) {
          cell.className += ' center-star';
          cell.textContent = '★';
        } else if (premium) {
          const cls = { TW: 'premium-tw', DW: 'premium-dw', TL: 'premium-tl', DL: 'premium-dl' }[premium];
          cell.className += ` ${cls}`;
          const lbl = document.createElement('span');
          lbl.className = 'detail-premium-label';
          lbl.textContent = premium;
          cell.appendChild(lbl);
        }
      }
      grid.appendChild(cell);
    }
  }

  boardBody.appendChild(grid);
  boardWithHeaders.appendChild(boardBody);
  boardWrap.appendChild(boardWithHeaders);
  boardWithSidebar.appendChild(boardWrap);
  boardWithSidebar.appendChild(turnHistoryPanel);
  wrapper.appendChild(boardWithSidebar);

  // Player chips for click-to-highlight
  if (sorted.length > 0) {
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'detail-player-chips';
    let activeChipId = null;

    function deselectPlayer() {
      activeChipId = null;
      chipsDiv.querySelectorAll('.detail-player-chip').forEach(c => c.classList.remove('active'));
      grid.querySelectorAll('.detail-board-tile').forEach(t => t.classList.remove('detail-tile-highlighted', 'detail-tile-dimmed'));
      turnHistoryPanel.querySelectorAll('.detail-turn-history-item').forEach(item => item.classList.remove('turn-selected'));
    }

    for (const p of sorted) {
      const chip = document.createElement('button');
      chip.className = 'detail-player-chip';
      chip.dataset.playerId = p.playerId;
      chip.style.setProperty('--chip-color', getDetailColor(p.playerId));
      chip.innerHTML = `<span class="detail-player-chip-avatar" style="background:${getDetailColor(p.playerId)}">${p.username.charAt(0).toUpperCase()}</span>${escapeHtml(p.username)}${p.isAI ? ' 🤖' : ''}${p.playerId === game.winnerId ? ' 🏆' : ''} <span class="detail-player-chip-score">${p.score}pts</span>`;

      chip.addEventListener('click', () => {
        const allTiles = grid.querySelectorAll('.detail-board-tile');
        if (activeChipId === p.playerId) {
          deselectPlayer();
        } else {
          activeChipId = p.playerId;
          chipsDiv.querySelectorAll('.detail-player-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          allTiles.forEach(t => {
            if (t.dataset.playerId === p.playerId) {
              t.classList.add('detail-tile-highlighted');
              t.classList.remove('detail-tile-dimmed');
            } else {
              t.classList.remove('detail-tile-highlighted');
              t.classList.add('detail-tile-dimmed');
            }
          });
          turnHistoryPanel.querySelectorAll('.detail-turn-history-item').forEach(item => {
            if (item.dataset.playerId === p.playerId) {
              item.classList.add('turn-selected');
              item.style.setProperty('--turn-selected-color', getDetailColor(p.playerId));
            } else {
              item.classList.remove('turn-selected');
            }
          });
        }
      });
      chipsDiv.appendChild(chip);
    }

    // Deselect when clicking outside the player chips area
    const clickOutsideHandler = (e) => {
      if (!wrapper.isConnected) {
        document.removeEventListener('click', clickOutsideHandler);
        return;
      }
      if (!chipsDiv.contains(e.target)) {
        deselectPlayer();
      }
    };
    document.addEventListener('click', clickOutsideHandler);

    wrapper.appendChild(chipsDiv);
  }

  container.appendChild(wrapper);
}

// ---- Main renderGameDetail ----
function renderGameDetail(game) {
  const summaryPanel = document.getElementById('stats-detail-summary-panel');
  const boardPanel = document.getElementById('stats-detail-board-panel');

  const date = new Date(game.endedAt);
  const dateStr = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  buildGameColorMap(sorted);
  const maxScore = sorted[0]?.score || 0;

  let reason = game.reason || '';
  if (reason === 'all_passed') reason = 'All passed';
  else if (reason === 'empty_rack') reason = 'Empty rack';
  else if (reason === 'timeout') reason = 'Timeout';
  else if (reason === 'resignation') reason = 'Resigned';

  // ---- Summary panel ----
  summaryPanel.innerHTML = '';

  const summaryInner = document.createElement('div');
  summaryInner.className = 'detail-summary-content';

  // Header
  const header = document.createElement('div');
  header.className = 'detail-summary-header';
  header.innerHTML = `<span class="detail-summary-date">${dateStr}</span>${reason ? `<span class="detail-summary-reason">${escapeHtml(reason)}</span>` : ''}`;
  summaryInner.appendChild(header);

  // Stats table
  const table = document.createElement('table');
  table.className = 'summary-table';

  const thead = document.createElement('thead');
  let headerRow = '<tr><th class="stat-label-col"></th>';
  for (const player of sorted) {
    const initial = player.username.charAt(0).toUpperCase();
    const isWinner = player.playerId === game.winnerId;
    const playerBadge = player.isAI ? ' 🤖' : player.userId ? ' <span class="verified-badge" title="Registered player">✓</span>' : '';
    headerRow += `<th class="stat-player-col${isWinner ? ' winner' : ''}">
      <div class="player-avatar" style="background:${getDetailColor(player.playerId)}">${initial}</div>
      <div class="player-name">${escapeHtml(player.username)}${playerBadge}${isWinner ? ' 🏆' : ''}</div>
    </th>`;
  }
  headerRow += '</tr>';
  thead.innerHTML = headerRow;
  table.appendChild(thead);

  const statRows = [
    { label: 'Score', format: (s, p) => `<span class="summary-score">${p.score}</span>` },
    { label: '⏱ Time Left', format: (s) => s?.timeRemaining != null ? formatTime(s.timeRemaining) : '-' },
    { label: '🎯 Best Word', format: (s) => s?.bestWord ? `${s.bestWord.word} <span class="stat-pts">${s.bestWord.score}pts</span>` : '-' },
    { label: '🔥 Best Turn', format: (s) => s?.bestTurn ? `#${s.bestTurn.turnNumber} <span class="stat-pts">${s.bestTurn.score}pts</span> <span class="stat-sub">${s.bestTurn.wordCount}w</span>` : '-' },
    { label: '📏 Longest Word', format: (s) => s?.longestWord ? `${s.longestWord.word} <span class="stat-sub">${s.longestWord.length}L</span>` : '-' },
    { label: '📊 Avg/Turn', format: (s) => s?.avgScorePerTurn != null ? `${s.avgScorePerTurn} pts <span class="stat-sub">(${s.playTurns} plays)</span>` : '-' },
    { label: '📝 Words', format: (s) => s?.totalWords ?? '-' },
    { label: '🧱 Tiles Placed', format: (s) => s?.tilesUsed ?? '-' },
    { label: '🎒 Tiles Left', format: (s) => s?.tilesRemaining != null ? `${s.tilesRemaining} <span class="stat-sub">−${s.rackDeduction ?? 0}pts</span>` : '-' },
    { label: '🔄 Turns', format: (s) => s?.totalTurns ?? '-' },
    { label: '🌟 Bingos', format: (s) => s?.bingoCount ?? '0' },
    { label: '⏭ Passes', format: (s) => s?.passCount ?? '0' },
    { label: '🔁 Exchanges', format: (s) => s?.exchangeCount ?? '0' },
  ];

  const tbody = document.createElement('tbody');
  for (const row of statRows) {
    let tr = `<tr><td class="stat-label-cell">${row.label}</td>`;
    for (const p of sorted) {
      const isWinner = p.playerId === game.winnerId;
      tr += `<td class="stat-value-cell${isWinner ? ' winner' : ''}">${row.format(p.stats, p)}</td>`;
    }
    tr += '</tr>';
    tbody.innerHTML += tr;
  }
  table.appendChild(tbody);
  summaryInner.appendChild(table);

  // Overall game summary
  const gs = game.gameSummary;
  if (gs) {
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
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalRounds ?? '-'}</span><span class="overall-stat-lbl">Rounds</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalTurns ?? '-'}</span><span class="overall-stat-lbl">Total Turns</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalScoreAll ?? '-'}</span><span class="overall-stat-lbl">Combined Score</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.avgScoreAll ?? '-'}</span><span class="overall-stat-lbl">Avg Score</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalWordsPlayed ?? '-'}</span><span class="overall-stat-lbl">Words Played</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalTilesUsed ?? 0}</span><span class="overall-stat-lbl">Tiles Used</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalBingos ?? 0}</span><span class="overall-stat-lbl">Bingos</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalPasses ?? 0} / ${gs.totalExchanges ?? 0}</span><span class="overall-stat-lbl">Pass / Exchange</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalTimeUsed > 0 ? formatTime(gs.totalTimeUsed) : 'N/A'}</span><span class="overall-stat-lbl">Time Used</span></div>
      </div>
    `;
    summaryInner.appendChild(overallDiv);
  }

  // Score progression graph — appended LAST so it appears below Game Overview
  const progression = game.scoreProgression;
  let pendingGraphDraw = null;
  if (progression && Object.keys(progression).length > 0) {
    const graphDiv = document.createElement('div');
    graphDiv.className = 'score-graph-section';
    graphDiv.innerHTML = '<h3>Score Progression</h3>';

    const canvas = document.createElement('canvas');
    canvas.className = 'score-graph-canvas';
    canvas.width = 600;
    canvas.height = 240;
    graphDiv.appendChild(canvas);

    const legendDiv = document.createElement('div');
    legendDiv.className = 'score-graph-legend';
    for (const player of sorted) {
      const color = getDetailColor(player.playerId);
      legendDiv.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeHtml(player.username)}</span>`;
    }
    legendDiv.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:#FFD700"></span>Bingo</span>`;
    legendDiv.innerHTML += `<span class="legend-item"><span style="font-size:0.8rem;color:#e74c3c">✕</span> Pass/Exchange</span>`;
    legendDiv.innerHTML += `<span class="legend-item"><span style="font-size:0.8rem;color:#ff6b35">▼</span> Timeout</span>`;
    graphDiv.appendChild(legendDiv);
    summaryInner.appendChild(graphDiv);

    const graphPlayers = sorted.map(p => ({ ...p, id: p.playerId }));
    pendingGraphDraw = () => drawDetailScoreGraph(canvas, graphPlayers, progression, game.turnEvents || []);
  }

  summaryPanel.appendChild(summaryInner);

  // Draw graph after DOM is attached so canvas has layout dimensions
  if (pendingGraphDraw) {
    setTimeout(pendingGraphDraw, 50);
  }

  // ---- Board panel ----
  boardPanel.innerHTML = '';
  renderDetailBoard(game, boardPanel);
}

// Refresh stats when navigating back
function refreshStats() {
  statsLoaded = false;
  statsCurrentPage = 1;
}

// ============================================
// Danger Zone - Delete Data / Delete Account
// ============================================

let _dangerAction = null; // 'delete-data' or 'delete-account'

function initDangerZone() {
  const modal = document.getElementById('danger-confirm-modal');
  const input = document.getElementById('danger-confirm-input');
  const proceedBtn = document.getElementById('danger-confirm-proceed-btn');
  const cancelBtn = document.getElementById('danger-confirm-cancel-btn');
  const errorEl = document.getElementById('danger-confirm-error');

  document.getElementById('danger-delete-data-btn').addEventListener('click', () => {
    openDangerModal('delete-data');
  });

  document.getElementById('danger-delete-account-btn').addEventListener('click', () => {
    openDangerModal('delete-account');
  });

  input.addEventListener('input', () => {
    const username = getDisplayUsername();
    proceedBtn.disabled = input.value !== username;
    errorEl.classList.add('hidden');
  });

  cancelBtn.addEventListener('click', () => {
    closeDangerModal();
  });

  proceedBtn.addEventListener('click', () => {
    executeDangerAction();
  });
}

function getDisplayUsername() {
  const el = document.getElementById('auth-username-display');
  return el ? el.textContent.trim() : '';
}

function openDangerModal(action) {
  _dangerAction = action;
  const modal = document.getElementById('danger-confirm-modal');
  const title = document.getElementById('danger-confirm-title');
  const message = document.getElementById('danger-confirm-message');
  const input = document.getElementById('danger-confirm-input');
  const proceedBtn = document.getElementById('danger-confirm-proceed-btn');
  const errorEl = document.getElementById('danger-confirm-error');

  const username = getDisplayUsername();

  const warningEl = document.getElementById('danger-confirm-warning');

  if (action === 'delete-data') {
    title.textContent = '⚠️ Delete All Game Data';
    message.textContent = 'This will permanently delete all your game history, statistics, and records. This action cannot be undone. You will remain signed in.';
    proceedBtn.textContent = 'Delete All Data';
    warningEl.classList.add('hidden');
  } else {
    title.textContent = '⚠️ Delete Account';
    message.textContent = 'This will permanently delete all your game data and sign you out. This action cannot be undone.';
    proceedBtn.textContent = 'Delete Account';
    warningEl.classList.remove('hidden');
  }

  input.value = '';
  input.placeholder = username;
  proceedBtn.disabled = true;
  errorEl.classList.add('hidden');
  modal.classList.remove('hidden');
  input.focus();
}

function closeDangerModal() {
  _dangerAction = null;
  document.getElementById('danger-confirm-modal').classList.add('hidden');
  document.getElementById('danger-confirm-input').value = '';
  document.getElementById('danger-confirm-error').classList.add('hidden');
}

async function executeDangerAction() {
  const action = _dangerAction;
  const input = document.getElementById('danger-confirm-input');
  const proceedBtn = document.getElementById('danger-confirm-proceed-btn');
  const errorEl = document.getElementById('danger-confirm-error');
  const confirmUsername = input.value;

  proceedBtn.disabled = true;
  proceedBtn.textContent = 'Deleting...';
  errorEl.classList.add('hidden');

  const endpoint = action === 'delete-account'
    ? '/api/account/delete-account'
    : '/api/account/delete-data';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmUsername }),
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Something went wrong. Please try again.';
      errorEl.classList.remove('hidden');
      proceedBtn.disabled = false;
      proceedBtn.textContent = _dangerAction === 'delete-account' ? 'Delete Account' : 'Delete All Data';
      return;
    }

    closeDangerModal();

    if (action === 'delete-account') {
      // Clear auth state and redirect to sign-out
      localStorage.removeItem('scrabble_was_signed_in');
      window.location.href = '/sign-out';
    } else {
      // Stay signed in, go back to lobby
      showScreen('lobby-screen');
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.remove('hidden');
    proceedBtn.disabled = false;
    proceedBtn.textContent = _dangerAction === 'delete-account' ? 'Delete Account' : 'Delete All Data';
  }
}
