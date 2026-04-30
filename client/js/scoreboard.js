// ============================================
// Scoreboard & Game Info
// ============================================

let currentPlayers = [];
let currentTurn = null;

function updateScoreboard(players, currentTurnId, timers, tileBagCount) {
  currentPlayers = players;
  currentTurn = currentTurnId;
  
  const container = document.getElementById('player-scoreboard');
  container.innerHTML = '';
  
  // Find highest score
  const maxScore = Math.max(...players.map(p => p.score));
  
  for (const player of players) {
    const card = document.createElement('div');
    card.className = 'player-card';
    if (player.id === currentTurnId) {
      card.classList.add('active');
    }
    
    const timer = timers ? timers[player.id] : null;
    const timerDisplay = timer !== null && timer !== undefined ? formatTime(timer) : '--:--';
    const isWinning = player.score === maxScore && player.score > 0;
    const initial = player.username.charAt(0).toUpperCase();
    
    card.innerHTML = `
      <div class="player-card-header">
        <div class="player-avatar" style="background: ${getAvatarColor(player.id)}">${
          player.avatar ? `<img src="${player.avatar}" alt="">` : initial
        }</div>
        <div class="player-info">
          <div class="player-name">${escapeHtml(player.username)}${player.isAI ? ' 🤖' : ''}</div>
          <div class="player-elo">Elo Score: ${player.elo}</div>
        </div>
      </div>
      <div class="player-card-body">
        <div class="player-score" id="score-${player.id}">${player.score}</div>
        <div class="player-timer-container">
          ${isWinning ? '<span class="trophy-icon">🏆</span>' : ''}
          <span class="player-timer">${timerDisplay}</span>
        </div>
      </div>
    `;
    
    container.appendChild(card);
  }
  
  // Update tile bag count
  document.getElementById('tile-bag-count').textContent = tileBagCount;
  
  // Update rack counts
  const rackCountsEl = document.getElementById('player-rack-counts');
  rackCountsEl.innerHTML = '';
  for (const player of players) {
    const initial = player.username.charAt(0).toUpperCase();
    const item = document.createElement('div');
    item.className = 'rack-count-item';
    item.innerHTML = `
      <div class="rack-count-avatar" style="background: ${getAvatarColor(player.id)}">${initial}</div>
      <span>${player.rackCount}</span>
    `;
    rackCountsEl.appendChild(item);
  }
}

function flashScore(playerId) {
  const el = document.getElementById(`score-${playerId}`);
  if (el) {
    el.classList.remove('score-flash');
    // Trigger reflow
    void el.offsetWidth;
    el.classList.add('score-flash');
  }
}

function showScoreDelta(playerId, delta) {
  const el = document.getElementById(`score-${playerId}`);
  if (!el) return;
  
  // Remove any existing delta badge
  const existing = el.parentElement.querySelector('.score-delta');
  if (existing) existing.remove();
  
  const badge = document.createElement('span');
  badge.className = 'score-delta';
  badge.textContent = `+${delta}`;
  el.parentElement.appendChild(badge);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    badge.classList.add('score-delta-fade');
    setTimeout(() => badge.remove(), 500);
  }, 3000);
}

function updateTimers(timers) {
  const timerEls = document.querySelectorAll('.player-timer');
  const cards = document.querySelectorAll('.player-card');
  
  cards.forEach((card, idx) => {
    if (idx < currentPlayers.length) {
      const player = currentPlayers[idx];
      const timer = timers[player.id];
      const timerEl = card.querySelector('.player-timer');
      if (timerEl && timer !== undefined) {
        timerEl.textContent = formatTime(timer);
        if (timer <= 60) {
          timerEl.style.color = 'var(--danger)';
        } else {
          timerEl.style.color = '';
        }
      }
    }
  });
}

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '--:--';
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getAvatarColor(id) {
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function updateGameInfo(settings) {
  const timeLimitText = settings.timeLimit === 0 ? 'Unlimited' : `${settings.timeLimit} Minutes`;
  document.getElementById('time-limit-text').textContent = timeLimitText;
  document.getElementById('game-type-text').textContent = 
    settings.gameType === 'ranked' ? 'Ranked' : 'Friend Match';
}

function showEndgameButtons() {
  document.getElementById('game-actions').classList.add('hidden');
  document.getElementById('endgame-actions').classList.remove('hidden');
}

function showGameActions() {
  document.getElementById('game-actions').classList.remove('hidden');
  document.getElementById('endgame-actions').classList.add('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
