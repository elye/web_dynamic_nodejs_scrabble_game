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
  const content = document.getElementById('stats-detail-content');
  content.innerHTML = '<p class="text-muted">Loading game details...</p>';
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/stats/games/${encodeURIComponent(gameId)}`);
    if (!res.ok) throw new Error('Game not found');
    const game = await res.json();
    renderGameDetail(game);
  } catch (err) {
    content.innerHTML = '<p class="stats-error">Could not load game details.</p>';
  }
}

function renderGameDetail(game) {
  const content = document.getElementById('stats-detail-content');
  const date = new Date(game.endedAt);
  const dateStr = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const sorted = [...game.players].sort((a, b) => b.score - a.score);

  let reason = game.reason || '';
  if (reason === 'all_passed') reason = 'All passed';
  else if (reason === 'empty_rack') reason = 'Empty rack';
  else if (reason === 'timeout') reason = 'Timeout';
  else if (reason === 'resignation') reason = 'Resigned';

  let html = `<div class="stats-detail-header">
    <span class="stats-detail-date">${dateStr}</span>
    <span class="stats-detail-reason">${reason}</span>
  </div>`;

  // Player scores
  html += '<div class="stats-detail-players">';
  for (const player of sorted) {
    const isWinner = player.playerId === game.winnerId;
    html += `<div class="stats-detail-player ${isWinner ? 'winner' : ''}">
      <span class="stats-detail-player-name">${escapeHtml(player.username)}${player.isAI ? ' 🤖' : ''}${isWinner ? ' 🏆' : ''}</span>
      <span class="stats-detail-player-score">${player.score}</span>
    </div>`;
  }
  html += '</div>';

  // Per-player stats from the stats field
  const statRows = [
    { label: 'Best Word', format: (s) => s?.bestWord ? `${s.bestWord.word} (${s.bestWord.score}pts)` : '-' },
    { label: 'Best Turn', format: (s) => s?.bestTurn ? `Turn #${s.bestTurn.turnNumber} (${s.bestTurn.score}pts)` : '-' },
    { label: 'Words Played', format: (s) => s?.totalWords ?? '-' },
    { label: 'Tiles Used', format: (s) => s?.tilesUsed ?? '-' },
    { label: 'Bingos', format: (s) => s?.bingoCount ?? '0' },
    { label: 'Avg/Turn', format: (s) => s?.avgScorePerTurn != null ? `${s.avgScorePerTurn} pts` : '-' },
    { label: 'Passes', format: (s) => s?.passCount ?? '0' },
    { label: 'Exchanges', format: (s) => s?.exchangeCount ?? '0' },
  ];

  html += '<table class="stats-table stats-detail-table"><thead><tr><th></th>';
  for (const p of sorted) {
    html += `<th>${escapeHtml(p.username)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of statRows) {
    html += '<tr><td class="stat-label-cell">' + row.label + '</td>';
    for (const p of sorted) {
      html += '<td class="stat-value-cell">' + row.format(p.stats) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table>';

  // Game summary
  const gs = game.gameSummary;
  if (gs) {
    html += '<div class="stats-detail-summary">';
    html += `<span>Total turns: ${gs.totalTurns ?? '-'}</span>`;
    html += `<span>Words played: ${gs.totalWordsPlayed ?? '-'}</span>`;
    html += '</div>';
  }

  content.innerHTML = html;
}

// Refresh stats when navigating back
function refreshStats() {
  statsLoaded = false;
  statsCurrentPage = 1;
}
