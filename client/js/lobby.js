// ============================================
// Lobby & Room Management
// ============================================

// Returns true if user is a guest (not signed in)
function isGuest() {
  return !document.getElementById('username-row').classList.contains('hidden');
}

// Validates that a guest has entered a username.
// Returns the username if valid, or empty string if invalid (with UI feedback).
function requireGuestUsername() {
  if (!isGuest()) return document.getElementById('username-input').value.trim();
  const input = document.getElementById('username-input');
  const error = document.getElementById('username-error');
  const name = input.value.trim();
  if (!name) {
    input.classList.add('input-error');
    error.classList.remove('hidden');
    input.focus();
    return '';
  }
  input.classList.remove('input-error');
  error.classList.add('hidden');
  return name;
}

let soloSettings = {
  aiDifficulty: 'medium',
  timeLimit: 0,
  gameType: 'friendly',
};

let multiSettings = {
  maxPlayers: 4,
  timeLimit: 30,
  gameType: 'friendly',
  timeoutMode: 'sudden',
};

function initLobby() {
  // Clear validation error when guest types a username
  const usernameInput = document.getElementById('username-input');
  usernameInput.addEventListener('input', () => {
    if (usernameInput.value.trim()) {
      usernameInput.classList.remove('input-error');
      document.getElementById('username-error').classList.add('hidden');
    }
  });

  // --- Solo ---
  const soloBtn = document.getElementById('solo-btn');
  const soloModal = document.getElementById('solo-modal');

  soloBtn.addEventListener('click', () => {
    if (isGuest() && !requireGuestUsername()) return;
    soloModal.classList.remove('hidden');
  });
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

  document.querySelectorAll('.type-btn-solo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn-solo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      soloSettings.gameType = btn.dataset.type;
    });
  });

  document.getElementById('confirm-solo-btn').addEventListener('click', () => {
    const username = requireGuestUsername();
    if (!username) { soloModal.classList.add('hidden'); return; }
    const randomOrder = document.getElementById('solo-random-order').checked;
    soloModal.classList.add('hidden');

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'CREATE_SOLO',
        username,
        avatar: '',
        aiDifficulty: soloSettings.aiDifficulty,
        timeLimit: soloSettings.timeLimit,
        gameType: soloSettings.gameType,
        randomOrder,
      }));
    }
  });

  // --- Multiplayer ---
  const multiBtn = document.getElementById('multiplayer-btn');
  const createModal = document.getElementById('create-modal');

  multiBtn.addEventListener('click', () => {
    if (isGuest() && !requireGuestUsername()) return;
    createModal.classList.remove('hidden');
  });
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

  document.querySelectorAll('.timeout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.timeout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      multiSettings.timeoutMode = btn.dataset.timeout;
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
    const username = requireGuestUsername();
    if (!username) { createModal.classList.add('hidden'); return; }
    const randomOrder = document.getElementById('multi-random-order').checked;
    createModal.classList.add('hidden');

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'CREATE_ROOM',
        username,
        avatar: '',
        maxPlayers: 4,
        timeLimit: multiSettings.timeLimit,
        gameType: multiSettings.gameType,
        timeoutMode: multiSettings.timeoutMode,
        randomOrder,
      }));
    }
  });

  // --- Join ---
  const joinBtn = document.getElementById('join-game-btn');
  const joinModal = document.getElementById('join-modal');

  joinBtn.addEventListener('click', () => {
    if (isGuest() && !requireGuestUsername()) return;
    // Pre-fill join username from main username input
    const mainUsername = document.getElementById('username-input').value.trim();
    const joinUsernameInput = document.getElementById('join-username-input');
    if (mainUsername && !joinUsernameInput.value.trim()) {
      joinUsernameInput.value = mainUsername;
    }
    joinModal.classList.remove('hidden');
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'GET_ROOMS' }));
    }
  });
  document.getElementById('cancel-join-btn').addEventListener('click', () => joinModal.classList.add('hidden'));

  document.getElementById('confirm-join-btn').addEventListener('click', () => {
    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    const joinUsername = document.getElementById('join-username-input').value.trim();
    const username = joinUsername || requireGuestUsername();
    if (!roomCode || !username) return;

    // Sync back to main username input
    if (joinUsername) {
      document.getElementById('username-input').value = joinUsername;
    }

    joinModal.classList.add('hidden');

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomId: roomCode,
        username,
        avatar: '',
      }));
    }
  });

  // --- Waiting room ---
  document.getElementById('leave-room-btn').addEventListener('click', () => {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
    // Clean room from URL
    const url = new URL(window.location);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
    showScreen('lobby-screen');
  });

  document.querySelectorAll('.add-ai-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.ws && window.ws.readyState === WebSocket.OPEN) {
        window.ws.send(JSON.stringify({ type: 'ADD_AI', aiDifficulty: btn.dataset.difficulty }));
      }
    });
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
      <span class="room-players">(${room.playerCount}H${room.aiCount ? '+' + room.aiCount + 'A' : ''})/${room.maxPlayers}</span>
    `;
    item.addEventListener('click', () => {
      document.getElementById('room-code-input').value = room.id;
    });
    container.appendChild(item);
  }
}

function updateWaitingRoom(data) {
  document.getElementById('room-code-text').textContent = data.roomId;
  
  // Update URL with room code
  const url = new URL(window.location);
  url.searchParams.set('room', data.roomId);
  window.history.replaceState({}, '', url);

  const container = document.getElementById('waiting-players');
  container.innerHTML = '';

  const hostId = data.hostId || data.players[0]?.id;
  const isHost = window.playerId === hostId;

  for (const player of data.players) {
    const card = document.createElement('div');
    card.className = 'waiting-player-card';
    const initial = player.username.charAt(0).toUpperCase();
    const disconnectedBadge = player.connected === false ? ' <span style="color:var(--danger);font-size:0.7rem">(disconnected)</span>' : '';
    const aiBadge = player.isAI ? ` 🤖 <span class="ai-diff-badge">${(player.aiDifficulty || 'medium').charAt(0).toUpperCase() + (player.aiDifficulty || 'medium').slice(1)}</span>` : '';
    let removeBtn = '';
    if (player.isAI && isHost) {
      removeBtn = `<button class="btn btn-sm remove-ai-btn" data-player-id="${player.id}" title="Remove AI">✕</button>`;
    }
    card.innerHTML = `
      <div class="avatar" style="background: ${getAvatarColor(player.id)}">${initial}</div>
      <div class="player-name">${escapeHtml(player.username)}${player.isRegistered && !player.isAI ? ' <span class="verified-badge" title="Registered player">✓</span>' : ''}${aiBadge}${disconnectedBadge}</div>
      ${removeBtn}
    `;
    container.appendChild(card);
  }

  // Attach remove handlers
  container.querySelectorAll('.remove-ai-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.ws && window.ws.readyState === WebSocket.OPEN) {
        window.ws.send(JSON.stringify({ type: 'REMOVE_AI', playerId: btn.dataset.playerId }));
      }
    });
  });

  // Enable start button if host
  const startBtn = document.getElementById('start-game-btn');
  const botActions = document.querySelector('.ai-bot-actions');

  if (isHost) {
    startBtn.disabled = false;
    startBtn.textContent = data.players.length < 2 ? 'Play Solo' : 'Start Game';
    // Show bot buttons only if room has space (max 4)
    if (botActions) botActions.style.display = data.players.length >= 4 ? 'none' : '';
  } else {
    startBtn.disabled = true;
    startBtn.textContent = 'Waiting for host to start...';
    if (botActions) botActions.style.display = 'none';
  }

  // Set up copy link button
  const copyBtn = document.getElementById('copy-link-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const url = new URL(window.location);
      url.searchParams.set('room', data.roomId);
      navigator.clipboard.writeText(url.toString()).then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Link'; }, 2000);
      }).catch(() => {
        // Fallback: select text
        const temp = document.createElement('input');
        temp.value = url.toString();
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Link'; }, 2000);
      });
    };
  }
}

function checkUrlRoomCode() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');
  if (roomCode) {
    // Pre-fill room code and show join dialog for confirmation
    document.getElementById('room-code-input').value = roomCode.toUpperCase();
    const mainUsername = document.getElementById('username-input').value.trim();
    if (mainUsername) {
      document.getElementById('join-username-input').value = mainUsername;
    }
    document.getElementById('join-modal').classList.remove('hidden');
    // Clean up URL
    const url = new URL(window.location);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
  }
}
