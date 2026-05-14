// ============================================
// Stats Page - Past game statistics
// ============================================

let statsCurrentPage = 1;
let statsTotalPages = 1;
let statsLoaded = false;

function initStats() {
  document.getElementById('stats-btn').addEventListener('click', () => {
    showScreen('stats-screen');
    if (!statsLoaded) loadStats();
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
}

function switchDetailTab(tab) {
  document.getElementById('stats-detail-summary-panel').classList.toggle('hidden', tab !== 'summary');
  document.getElementById('stats-detail-board-panel').classList.toggle('hidden', tab !== 'board');
  document.getElementById('detail-tab-summary-btn').classList.toggle('active', tab === 'summary');
  document.getElementById('detail-tab-board-btn').classList.toggle('active', tab === 'board');
}

async function loadStats() {
  statsLoaded = true;
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
  } catch (err) {
    showStatsError('summary-grid', 'Could not load stats summary. Make sure you are signed in.');
  }
}

function renderSummary(data) {
  const grid = document.getElementById('stats-summary-grid');
  const totalGames = data.totalGames || 0;
  const wins = data.wins || 0;
  const losses = data.losses || 0;
  const winRate = data.winRate || 0;
  const bestScore = data.bestScore?.score ?? '-';
  const bestWord = data.bestWord;

  grid.innerHTML = `
    <div class="stats-stat-card">
      <span class="stats-stat-val">${totalGames}</span>
      <span class="stats-stat-lbl">Games Played</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val stats-val-win">${wins}</span>
      <span class="stats-stat-lbl">Wins</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val stats-val-loss">${losses}</span>
      <span class="stats-stat-lbl">Losses</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${winRate}%</span>
      <span class="stats-stat-lbl">Win Rate</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestScore}</span>
      <span class="stats-stat-lbl">Best Score</span>
    </div>
    <div class="stats-stat-card">
      <span class="stats-stat-val">${bestWord ? bestWord.word.toUpperCase() : '-'}</span>
      <span class="stats-stat-lbl">${bestWord ? `Best Word (${bestWord.score}pts)` : 'Best Word'}</span>
    </div>
  `;
}

// --- Games list ---
async function loadGames() {
  const container = document.getElementById('stats-games-body');
  container.innerHTML = '<tr><td colspan="5" class="stats-table-empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/stats/games?page=${statsCurrentPage}&limit=10`);
    if (!res.ok) throw new Error('Failed to load games');
    const data = await res.json();
    statsTotalPages = data.totalPages || 1;
    renderGames(data.games || []);
    updatePagination();
  } catch (err) {
    container.innerHTML = '<tr><td colspan="5" class="stats-table-empty">Could not load games.</td></tr>';
  }
}

function renderGames(games) {
  const body = document.getElementById('stats-games-body');
  if (games.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="stats-table-empty">No games played yet.</td></tr>';
    return;
  }

  body.innerHTML = '';
  for (const game of games) {
    const tr = document.createElement('tr');
    tr.className = 'stats-game-row';

    const date = new Date(game.endedAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    // Find current user's player record and opponents
    const me = game.players.find(p => p.userId === window._logtoUserId);
    const opponents = game.players.filter(p => p.userId !== window._logtoUserId);
    const opponentNames = opponents.map(p => escapeHtml(p.username) + (p.isAI ? ' 🤖' : '')).join(', ') || 'Solo';

    const myScore = me ? me.score : '-';
    const isWin = me && game.winnerId === me.playerId;
    const resultText = isWin ? 'Win' : 'Loss';
    const resultClass = isWin ? 'stats-result-win' : 'stats-result-loss';

    let reason = game.reason || '';
    if (reason === 'all_passed') reason = 'All passed';
    else if (reason === 'empty_rack') reason = 'Empty rack';
    else if (reason === 'timeout') reason = 'Timeout';
    else if (reason === 'resignation') reason = 'Resigned';

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${opponentNames}</td>
      <td>${myScore}</td>
      <td><span class="${resultClass}">${resultText}</span></td>
      <td>${reason}</td>
    `;

    tr.addEventListener('click', () => loadGameDetail(game.gameId));
    body.appendChild(tr);
  }
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
    tr.innerHTML = `
      <td>${escapeHtml(opp.opponentName)}${opp.isAI ? ' 🤖' : ''}</td>
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
  const summaryPanel = document.getElementById('stats-detail-summary-panel');
  const boardPanel = document.getElementById('stats-detail-board-panel');
  summaryPanel.innerHTML = '<p class="text-muted">Loading game details...</p>';
  boardPanel.innerHTML = '';
  switchDetailTab('summary');
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/stats/games/${encodeURIComponent(gameId)}`);
    if (!res.ok) throw new Error('Game not found');
    const game = await res.json();
    renderGameDetail(game);
  } catch (err) {
    summaryPanel.innerHTML = '<p class="stats-error">Could not load game details.</p>';
  }
}

// ---- Detail colour helper (mirrors getAvatarColor in scoreboard.js) ----
function getDetailColor(id) {
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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
        points: tile.points,
        isBlank: tile.isBlank,
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
        tileEl.style.background = getDetailColor(tile.playerId);

        const letterEl = document.createElement('span');
        letterEl.className = 'tile-letter';
        letterEl.textContent = tile.letter.toUpperCase();
        tileEl.appendChild(letterEl);

        if (tile.points != null) {
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
  wrapper.appendChild(boardWrap);

  // Player colour legend
  if (sorted.length > 0) {
    const legend = document.createElement('div');
    legend.className = 'detail-board-legend';
    for (const p of sorted) {
      const item = document.createElement('span');
      item.className = 'detail-board-legend-item';
      const dot = document.createElement('span');
      dot.className = 'detail-board-legend-dot';
      dot.style.background = getDetailColor(p.playerId);
      item.appendChild(dot);
      item.appendChild(document.createTextNode(
        `${p.username}${p.isAI ? ' 🤖' : ''}${p.playerId === game.winnerId ? ' 🏆' : ''} (${p.score}pts)`
      ));
      legend.appendChild(item);
    }
    wrapper.appendChild(legend);
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

  // Stats table (matching in-game summary style)
  const table = document.createElement('table');
  table.className = 'summary-table';

  const thead = document.createElement('thead');
  let headerRow = '<tr><th class="stat-label-col"></th>';
  for (const player of sorted) {
    const initial = player.username.charAt(0).toUpperCase();
    const isWinner = player.playerId === game.winnerId;
    headerRow += `<th class="stat-player-col${isWinner ? ' winner' : ''}">
      <div class="player-avatar" style="background:${getDetailColor(player.playerId)}">${initial}</div>
      <div class="player-name">${escapeHtml(player.username)}${player.isAI ? ' 🤖' : ''}${isWinner ? ' 🏆' : ''}</div>
    </th>`;
  }
  headerRow += '</tr>';
  thead.innerHTML = headerRow;
  table.appendChild(thead);

  const statRows = [
    { label: 'Score', format: (s, p) => `<span class="summary-score">${p.score}</span>` },
    { label: '🎯 Best Word', format: (s) => s?.bestWord ? `${s.bestWord.word} <span class="stat-pts">${s.bestWord.score}pts</span>` : '-' },
    { label: '🔥 Best Turn', format: (s) => s?.bestTurn ? `#${s.bestTurn.turnNumber} <span class="stat-pts">${s.bestTurn.score}pts</span>` : '-' },
    { label: '📏 Longest Word', format: (s) => s?.longestWord ? `${s.longestWord.word} <span class="stat-sub">${s.longestWord.length}L</span>` : '-' },
    { label: '📊 Avg/Turn', format: (s) => s?.avgScorePerTurn != null ? `${s.avgScorePerTurn} pts` : '-' },
    { label: '📝 Words', format: (s) => s?.totalWords ?? '-' },
    { label: '🧱 Tiles Placed', format: (s) => s?.tilesUsed ?? '-' },
    { label: '🌟 Bingos', format: (s) => s?.bingoCount ?? '0' },
    { label: '⏭ Passes', format: (s) => s?.passCount ?? '0' },
    { label: '🔄 Exchanges', format: (s) => s?.exchangeCount ?? '0' },
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
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalTurns ?? '-'}</span><span class="overall-stat-lbl">Total Turns</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalWordsPlayed ?? '-'}</span><span class="overall-stat-lbl">Words Played</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalBingos ?? 0}</span><span class="overall-stat-lbl">Bingos</span></div>
        <div class="overall-stat"><span class="overall-stat-val">${gs.totalPasses ?? 0} / ${gs.totalExchanges ?? 0}</span><span class="overall-stat-lbl">Pass / Exchange</span></div>
      </div>
    `;
    summaryInner.appendChild(overallDiv);
  }

  // Score progression graph
  const progression = game.scoreProgression;
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

    // Map players to { id: playerId, ... } for the graph function
    const graphPlayers = sorted.map(p => ({ ...p, id: p.playerId }));
    requestAnimationFrame(() => drawDetailScoreGraph(canvas, graphPlayers, progression, game.turnEvents || []));
  }

  summaryPanel.appendChild(summaryInner);

  // ---- Board panel ----
  boardPanel.innerHTML = '';
  renderDetailBoard(game, boardPanel);
}

// Refresh stats when navigating back
function refreshStats() {
  statsLoaded = false;
  statsCurrentPage = 1;
}
