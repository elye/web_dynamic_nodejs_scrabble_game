// ============================================
// Lobby & Room Management
// ============================================

let gameSettings = {
  maxPlayers: 2,
  timeLimit: 45,
  dictionary: 'en_us',
  gameType: 'friend',
  aiDifficulty: 'medium',
};

function initLobby() {
  const createBtn = document.getElementById('create-game-btn');
  const joinBtn = document.getElementById('join-game-btn');
  const createModal = document.getElementById('create-modal');
  const joinModal = document.getElementById('join-modal');
  
  createBtn.addEventListener('click', () => createModal.classList.remove('hidden'));
  joinBtn.addEventListener('click', () => {
    joinModal.classList.remove('hidden');
    // Request room list
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'GET_ROOMS' }));
    }
  });
  
  // Cancel buttons
  document.getElementById('cancel-create-btn').addEventListener('click', () => createModal.classList.add('hidden'));
  document.getElementById('cancel-join-btn').addEventListener('click', () => joinModal.classList.add('hidden'));
  
  // Player count buttons
  document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameSettings.maxPlayers = parseInt(btn.dataset.count);
      // Show/hide AI difficulty
      const aiGroup = document.getElementById('ai-difficulty-group');
      if (gameSettings.maxPlayers === 1) {
        aiGroup.parentElement.style.display = '';
      } else {
        aiGroup.parentElement.style.display = 'none';
      }
    });
  });
  
  // AI difficulty buttons
  document.querySelectorAll('.ai-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameSettings.aiDifficulty = btn.dataset.diff;
    });
  });
  
  // Time buttons
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameSettings.timeLimit = parseInt(btn.dataset.time);
    });
  });
  
  // Game type buttons
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameSettings.gameType = btn.dataset.type;
    });
  });
  
  // Confirm create
  document.getElementById('confirm-create-btn').addEventListener('click', () => {
    const username = document.getElementById('username-input').value.trim() || 'Player';
    createModal.classList.add('hidden');
    
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      const isSoloGame = gameSettings.maxPlayers === 1;
      window.ws.send(JSON.stringify({
        type: 'CREATE_ROOM',
        username,
        avatar: '',
        elo: 1200,
        maxPlayers: isSoloGame ? 2 : gameSettings.maxPlayers,
        timeLimit: gameSettings.timeLimit,
        dictionary: gameSettings.dictionary,
        gameType: gameSettings.gameType,
        aiDifficulty: isSoloGame ? gameSettings.aiDifficulty : undefined,
      }));
    }
  });
  
  // Confirm join
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
  
  // Waiting room
  document.getElementById('leave-room-btn').addEventListener('click', () => {
    showScreen('lobby-screen');
    // TODO: send leave message
  });
  
  document.getElementById('start-game-btn').addEventListener('click', () => {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'START_GAME' }));
    }
  });
  
  // Initially hide AI difficulty for 2-player default
  const aiGroup = document.getElementById('ai-difficulty-group');
  if (aiGroup) aiGroup.parentElement.style.display = 'none';
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
    card.innerHTML = `
      <div class="avatar" style="background: ${getAvatarColor(player.id)}">${initial}</div>
      <div class="player-name">${escapeHtml(player.username)}${player.isAI ? ' 🤖' : ''}</div>
      <div class="player-elo" style="color: var(--text-muted); font-size: 0.8rem;">Elo: ${player.elo}</div>
    `;
    container.appendChild(card);
  }
  
  // Enable start button if host and enough players
  const startBtn = document.getElementById('start-game-btn');
  if (window.playerId === data.players[0]?.id) {
    startBtn.disabled = data.players.length < 2;
  } else {
    startBtn.disabled = true;
    startBtn.textContent = 'Waiting for host...';
  }
}
