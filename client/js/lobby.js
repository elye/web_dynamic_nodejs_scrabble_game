// ============================================
// Lobby & Room Management
// ============================================

let soloSettings = {
  aiDifficulty: 'medium',
  timeLimit: 0,
};

let multiSettings = {
  maxPlayers: 4,
  timeLimit: 45,
  gameType: 'friend',
};

function initLobby() {
  // --- Solo ---
  const soloBtn = document.getElementById('solo-btn');
  const soloModal = document.getElementById('solo-modal');

  soloBtn.addEventListener('click', () => soloModal.classList.remove('hidden'));
  document.getElementById('cancel-solo-btn').addEventListener('click', () => soloModal.classList.add('hidden'));

  document.querySelectorAll('.ai-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      soloSettings.aiDifficulty = btn.dataset.diff;
    });
  });

  document.querySelectorAll('.time-btn-solo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn-solo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      soloSettings.timeLimit = parseInt(btn.dataset.time);
    });
  });

  document.getElementById('confirm-solo-btn').addEventListener('click', () => {
    const username = document.getElementById('username-input').value.trim() || 'Player';
    soloModal.classList.add('hidden');

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'CREATE_SOLO',
        username,
        avatar: '',
        elo: 1200,
        aiDifficulty: soloSettings.aiDifficulty,
        timeLimit: soloSettings.timeLimit,
      }));
    }
  });

  // --- Multiplayer ---
  const multiBtn = document.getElementById('multiplayer-btn');
  const createModal = document.getElementById('create-modal');

  multiBtn.addEventListener('click', () => createModal.classList.remove('hidden'));
  document.getElementById('cancel-create-btn').addEventListener('click', () => createModal.classList.add('hidden'));

  document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      multiSettings.maxPlayers = parseInt(btn.dataset.count);
    });
  });

  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      multiSettings.timeLimit = parseInt(btn.dataset.time);
    });
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      multiSettings.gameType = btn.dataset.type;
    });
  });

  document.getElementById('confirm-create-btn').addEventListener('click', () => {
    const username = document.getElementById('username-input').value.trim() || 'Player';
    createModal.classList.add('hidden');

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'CREATE_ROOM',
        username,
        avatar: '',
        elo: 1200,
        maxPlayers: 4,
        timeLimit: multiSettings.timeLimit,
        gameType: multiSettings.gameType,
      }));
    }
  });

  // --- Join ---
  const joinBtn = document.getElementById('join-game-btn');
  const joinModal = document.getElementById('join-modal');

  joinBtn.addEventListener('click', () => {
    joinModal.classList.remove('hidden');
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'GET_ROOMS' }));
    }
  });
  document.getElementById('cancel-join-btn').addEventListener('click', () => joinModal.classList.add('hidden'));

  document.getElementById('confirm-join-btn').addEventListener('click', () => {
    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    const username = document.getElementById('username-input').value.trim() || 'Player';
    if (!roomCode) return;

    joinModal.classList.add('hidden');

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomId: roomCode,
        username,
        avatar: '',
        elo: 1200,
      }));
    }
  });

  // --- Waiting room ---
  document.getElementById('leave-room-btn').addEventListener('click', () => {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
    showScreen('lobby-screen');
  });

  document.getElementById('start-game-btn').addEventListener('click', () => {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'START_GAME' }));
    }
  });
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function updateRoomList(rooms) {
  const container = document.getElementById('room-list');
  container.innerHTML = '';

  if (rooms.length === 0) {
    container.innerHTML = '<p class="text-muted">No open rooms available</p>';
    return;
  }

  for (const room of rooms) {
    const item = document.createElement('div');
    item.className = 'room-item';
    item.innerHTML = `
      <span class="room-info">${room.id} - ${room.host}</span>
      <span class="room-players">${room.playerCount}/${room.maxPlayers}</span>
    `;
    item.addEventListener('click', () => {
      document.getElementById('room-code-input').value = room.id;
    });
    container.appendChild(item);
  }
}

function updateWaitingRoom(data) {
  document.getElementById('room-code-text').textContent = data.roomId;

  const container = document.getElementById('waiting-players');
  container.innerHTML = '';

  for (const player of data.players) {
    const card = document.createElement('div');
    card.className = 'waiting-player-card';
    const initial = player.username.charAt(0).toUpperCase();
    const disconnectedBadge = player.connected === false ? ' <span style="color:var(--danger);font-size:0.7rem">(disconnected)</span>' : '';
    card.innerHTML = `
      <div class="avatar" style="background: ${getAvatarColor(player.id)}">${initial}</div>
      <div class="player-name">${escapeHtml(player.username)}${player.isAI ? ' 🤖' : ''}${disconnectedBadge}</div>
      <div class="player-elo" style="color: var(--text-muted); font-size: 0.8rem;">Elo: ${player.elo}</div>
    `;
    container.appendChild(card);
  }

  // Enable start button if host and enough human players
  const startBtn = document.getElementById('start-game-btn');
  const hostId = data.hostId || data.players[0]?.id;
  const humanPlayers = data.players.filter(p => !p.isAI);

  if (window.playerId === hostId) {
    startBtn.disabled = false;
    startBtn.textContent = humanPlayers.length < 2 ? 'Play Solo' : 'Start Game';
  } else {
    startBtn.disabled = true;
    startBtn.textContent = 'Waiting for host to start...';
  }
}
