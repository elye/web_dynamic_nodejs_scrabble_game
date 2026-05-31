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
  timeLimit: 15,
  gameType: 'friendly',
  aiCount: 3,
  allowHint: false,
};

let multiSettings = {
  maxPlayers: 4,
  timeLimit: 15,
  gameType: 'friendly',
  timeoutMode: 'sudden',
  allowHint: false,
  publicRoom: false,
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
    resetSoloGameType();
    soloModal.classList.remove('hidden');
  });
  document.getElementById('cancel-solo-btn').addEventListener('click', () => soloModal.classList.add('hidden'));

  document.querySelectorAll('.ai-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.ai-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      soloSettings.aiDifficulty = btn.dataset.diff;
    });
  });

  document.querySelectorAll('.time-btn-solo').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.time-btn-solo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      soloSettings.timeLimit = parseInt(btn.dataset.time);
    });
  });

  document.querySelectorAll('.ai-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.ai-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      soloSettings.aiCount = parseInt(btn.dataset.count);
    });
  });

  document.querySelectorAll('.type-btn-solo').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.type-btn-solo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      soloSettings.gameType = btn.dataset.type;
      const soloRandomCb = document.getElementById('solo-random-order');
      // Show/hide hint option (only for Friendly)
      const hintGroup = document.getElementById('solo-hint-group');
      if (btn.dataset.type === 'formal') {
        hintGroup.classList.add('hidden');
        document.getElementById('solo-allow-hint').checked = false;
        soloSettings.allowHint = false;
        // Formal games always use random turn order
        soloRandomCb.checked = true;
        soloRandomCb.disabled = true;
      } else {
        hintGroup.classList.remove('hidden');
        soloRandomCb.disabled = false;
      }
    });
  });

  document.getElementById('solo-allow-hint').addEventListener('change', (e) => {
    soloSettings.allowHint = e.target.checked;
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
        aiCount: soloSettings.aiCount,
        timeLimit: soloSettings.timeLimit,
        gameType: soloSettings.gameType,
        randomOrder,
        allowHint: soloSettings.allowHint,
      }));
    }
  });

  // --- Multiplayer ---
  const multiBtn = document.getElementById('multiplayer-btn');
  const createModal = document.getElementById('create-modal');

  multiBtn.addEventListener('click', () => {
    if (isGuest() && !requireGuestUsername()) return;
    resetMultiGameType();
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
      if (btn.disabled) return;
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      multiSettings.timeLimit = parseInt(btn.dataset.time);
    });
  });

  document.querySelectorAll('.timeout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.timeout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      multiSettings.timeoutMode = btn.dataset.timeout;
    });
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      multiSettings.gameType = btn.dataset.type;
      const multiRandomCb = document.getElementById('multi-random-order');
      // Show/hide hint option (only for Friendly)
      const hintGroup = document.getElementById('multi-hint-group');
      if (btn.dataset.type === 'formal') {
        hintGroup.classList.add('hidden');
        document.getElementById('multi-allow-hint').checked = false;
        multiSettings.allowHint = false;
        // Formal games always use random turn order
        multiRandomCb.checked = true;
        multiRandomCb.disabled = true;
      } else {
        hintGroup.classList.remove('hidden');
        multiRandomCb.disabled = false;
      }
    });
  });

  document.getElementById('multi-allow-hint').addEventListener('change', (e) => {
    multiSettings.allowHint = e.target.checked;
  });

  document.getElementById('multi-public-room').addEventListener('change', (e) => {
    multiSettings.publicRoom = e.target.checked;
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
        allowHint: multiSettings.allowHint,
        publicRoom: multiSettings.publicRoom,
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
    if (mainUsername) {
      joinUsernameInput.value = mainUsername;
    }
    // Disable join username if signed in or main username already provided
    if (!isGuest() || mainUsername) {
      joinUsernameInput.disabled = true;
    } else {
      joinUsernameInput.disabled = false;
    }
    joinModal.classList.remove('hidden');
    if (isGuest()) {
      updateRoomList([]);
    } else if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'GET_ROOMS' }));
    }
  });
  document.getElementById('cancel-join-btn').addEventListener('click', () => joinModal.classList.add('hidden'));

  document.getElementById('room-code-input').addEventListener('input', (e) => {
    filterRoomList(e.target.value);
  });

  document.getElementById('confirm-join-btn').addEventListener('click', () => {
    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    const joinUsernameInput = document.getElementById('join-username-input');
    const joinUsernameError = document.getElementById('join-username-error');
    const joinUsername = joinUsernameInput.value.trim();

    if (!joinUsername) {
      joinUsernameInput.classList.add('input-error');
      joinUsernameError.classList.remove('hidden');
      joinUsernameInput.focus();
      return;
    }
    joinUsernameInput.classList.remove('input-error');
    joinUsernameError.classList.add('hidden');

    if (!roomCode) return;
    const username = joinUsername;

    // Sync back to main username input
    document.getElementById('username-input').value = joinUsername;

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

  document.getElementById('join-username-input').addEventListener('input', () => {
    const input = document.getElementById('join-username-input');
    if (input.value.trim()) {
      input.classList.remove('input-error');
      document.getElementById('join-username-error').classList.add('hidden');
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
      if (btn.disabled) return;
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

  // Disable Formal mode and AI Hint for guests once auth state is known
  window._authReady.then(() => {
    updateFormalButtonAccess();
    updateHintAccess();
    updateTimeButtonAccess();
    updateAIDifficultyAccess();
    updateAddAIAccess();
    updateAICountAccess();
    updateTimeoutAccess();
    updatePublicRoomAccess();
  });
}

// Enable/disable Formal game-type buttons based on sign-in state
function updateFormalButtonAccess() {
  const guest = isGuest();
  document.querySelectorAll('.type-btn-solo[data-type="formal"], .type-btn[data-type="formal"]').forEach(btn => {
    btn.disabled = guest;
    const wrapper = btn.closest('.formal-btn-wrapper');
    if (wrapper) wrapper.classList.toggle('guest-disabled', guest);
  });
}

// Enable/disable AI Hint checkboxes based on sign-in state
function updateHintAccess() {
  const guest = isGuest();
  ['solo-allow-hint', 'multi-allow-hint'].forEach(id => {
    const cb = document.getElementById(id);
    if (!cb) return;
    cb.disabled = guest;
    if (guest) {
      cb.checked = false;
      if (id === 'solo-allow-hint') soloSettings.allowHint = false;
      if (id === 'multi-allow-hint') multiSettings.allowHint = false;
    }
    const wrapper = cb.closest('.hint-checkbox-wrapper');
    if (wrapper) wrapper.classList.toggle('guest-disabled', guest);
  });
}

// Enable/disable extended time options based on sign-in state
function updateTimeButtonAccess() {
  const guest = isGuest();
  document.querySelectorAll('.time-btn-solo, .time-btn').forEach(btn => {
    if (parseInt(btn.dataset.time) > 15) {
      btn.disabled = guest;
      if (guest && btn.classList.contains('active')) {
        btn.classList.remove('active');
        // Reset to 15 min
        const group = btn.closest('.btn-group');
        const btn15 = group.querySelector('[data-time="15"]');
        if (btn15) btn15.classList.add('active');
        if (btn.classList.contains('time-btn-solo') || btn.matches('.time-btn-solo')) {
          soloSettings.timeLimit = 15;
        } else {
          multiSettings.timeLimit = 15;
        }
      }
    }
  });
  document.querySelectorAll('.time-btn-wrapper').forEach(wrapper => {
    wrapper.classList.toggle('guest-disabled', guest);
  });
}

// Enable/disable Hard & Genius AI difficulty based on sign-in state
function updateAIDifficultyAccess() {
  const guest = isGuest();
  document.querySelectorAll('.ai-diff-btn').forEach(btn => {
    if (btn.dataset.diff === 'hard' || btn.dataset.diff === 'genius') {
      btn.disabled = guest;
      if (guest && btn.classList.contains('active')) {
        btn.classList.remove('active');
        const medBtn = document.querySelector('.ai-diff-btn[data-diff="medium"]');
        if (medBtn) medBtn.classList.add('active');
        soloSettings.aiDifficulty = 'medium';
      }
    }
  });
  document.querySelectorAll('.ai-diff-wrapper').forEach(wrapper => {
    wrapper.classList.toggle('guest-disabled', guest);
  });
}

// Enable/disable Add AI buttons based on sign-in state
function updateAddAIAccess() {
  const guest = isGuest();
  document.querySelectorAll('.add-ai-btn').forEach(btn => {
    btn.disabled = guest;
  });
  document.querySelectorAll('.add-ai-wrapper').forEach(wrapper => {
    wrapper.classList.toggle('guest-disabled', guest);
  });
}

// Enable/disable AI count options based on sign-in state (guests get 3 only)
function updateAICountAccess() {
  const guest = isGuest();
  document.querySelectorAll('.ai-count-btn').forEach(btn => {
    if (parseInt(btn.dataset.count) < 3) {
      btn.disabled = guest;
      if (guest && btn.classList.contains('active')) {
        btn.classList.remove('active');
        const btn3 = document.querySelector('.ai-count-btn[data-count="3"]');
        if (btn3) btn3.classList.add('active');
        soloSettings.aiCount = 3;
      }
    }
  });
  document.querySelectorAll('.ai-count-wrapper').forEach(wrapper => {
    wrapper.classList.toggle('guest-disabled', guest);
  });
}

// Enable/disable Overtime timeout mode based on sign-in state
function updateTimeoutAccess() {
  const guest = isGuest();
  document.querySelectorAll('.timeout-btn').forEach(btn => {
    if (btn.dataset.timeout === 'penalty') {
      btn.disabled = guest;
      if (guest && btn.classList.contains('active')) {
        btn.classList.remove('active');
        const suddenBtn = document.querySelector('.timeout-btn[data-timeout="sudden"]');
        if (suddenBtn) suddenBtn.classList.add('active');
        multiSettings.timeoutMode = 'sudden';
      }
    }
  });
  document.querySelectorAll('.timeout-btn-wrapper').forEach(wrapper => {
    wrapper.classList.toggle('guest-disabled', guest);
  });
}

// Enable/disable Public Room checkbox based on sign-in state
function updatePublicRoomAccess() {
  const guest = isGuest();
  const cb = document.getElementById('multi-public-room');
  if (!cb) return;
  cb.disabled = guest;
  if (guest) {
    cb.checked = false;
    multiSettings.publicRoom = false;
  }
  const wrapper = cb.closest('.public-room-wrapper');
  if (wrapper) wrapper.classList.toggle('guest-disabled', guest);
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  if (screenId === 'lobby-screen') {
    resetLobbyGameType();
  }
}

function resetLobbyGameType() {
  resetSoloGameType();
  resetMultiGameType();
}

function resetSoloGameType() {
  soloSettings.gameType = 'friendly';
  document.querySelectorAll('.type-btn-solo').forEach(b => {
    b.classList.toggle('active', b.dataset.type === 'friendly');
  });
  const soloHintGroup = document.getElementById('solo-hint-group');
  if (soloHintGroup) soloHintGroup.classList.remove('hidden');
  const soloRandomCb = document.getElementById('solo-random-order');
  if (soloRandomCb) soloRandomCb.disabled = false;
}

function resetMultiGameType() {
  multiSettings.gameType = 'friendly';
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === 'friendly');
  });
  const multiHintGroup = document.getElementById('multi-hint-group');
  if (multiHintGroup) multiHintGroup.classList.remove('hidden');
  const multiRandomCb = document.getElementById('multi-random-order');
  if (multiRandomCb) multiRandomCb.disabled = false;
}

// Store rooms data for filtering
let _publicRooms = [];

function updateRoomList(rooms) {
  _publicRooms = rooms || [];
  filterRoomList('');
}

function filterRoomList(query) {
  const container = document.getElementById('room-list');
  container.innerHTML = '';

  if (isGuest()) {
    container.innerHTML = '<p class="text-muted">Sign in to see public rooms</p>';
    container.classList.remove('has-rooms');
    return;
  }

  const q = query.trim().toUpperCase();
  let filtered = _publicRooms;
  if (q) {
    filtered = _publicRooms.filter(r => r.id.toUpperCase().includes(q));
  }

  // Limit to 3
  const display = filtered.slice(0, 3);

  if (display.length === 0) {
    if (q) {
      container.innerHTML = '<p class="text-muted">No matching rooms</p>';
    } else {
      container.innerHTML = '<p class="text-muted">No public rooms available</p>';
    }
    container.classList.remove('has-rooms');
    return;
  }

  container.classList.add('has-rooms');
  for (const room of display) {
    const item = document.createElement('div');
    item.className = 'room-item';
    const s = room.settings || {};
    const info = [
      `${s.timeLimit || '?'}m`,
      s.timeoutMode === 'penalty' ? 'OT' : 'SD',
      s.gameType === 'formal' ? 'F' : 'Fr',
      s.randomOrder ? 'R' : '',
      s.allowHint ? 'H' : '',
    ].filter(Boolean).join('·');
    item.innerHTML = `
      <span class="room-info">${room.id} — ${room.host}</span>
      <span class="room-meta">${room.playerCount}/${room.maxPlayers} <span class="room-tags">${info}</span></span>
    `;
    item.addEventListener('click', () => {
      document.getElementById('room-code-input').value = room.id;
      container.classList.remove('has-rooms');
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

  // Display room settings
  const settingsContainer = document.getElementById('waiting-room-settings');
  if (settingsContainer && data.settings) {
    const s = data.settings;
    const tags = [];
    tags.push(s.publicRoom ? 'Public' : 'Private');
    tags.push(`${s.timeLimit} min`);
    tags.push(s.timeoutMode === 'penalty' ? 'Overtime' : 'Sudden Death');
    tags.push(s.gameType === 'formal' ? 'Formal' : 'Friendly');
    tags.push(s.randomOrder ? 'Random Start' : 'Fixed Start');
    tags.push(s.allowHint ? 'Hints On' : 'Hints Off');
    settingsContainer.innerHTML = tags.map(t => `<span class="setting-tag">${t}</span>`).join('');
  }

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
    // Wait for auth to be ready before showing join modal
    const ready = window._authReady || Promise.resolve();
    ready.then(() => {
      document.getElementById('room-code-input').value = roomCode.toUpperCase();
      const mainUsername = document.getElementById('username-input').value.trim();
      const joinUsernameInput = document.getElementById('join-username-input');
      if (mainUsername) {
        joinUsernameInput.value = mainUsername;
      }
      // Disable join username if signed in or main username already provided
      if (!isGuest() || mainUsername) {
        joinUsernameInput.disabled = true;
      } else {
        joinUsernameInput.disabled = false;
      }
      document.getElementById('join-modal').classList.remove('hidden');
      // Focus on username if guest and empty
      if (isGuest() && !mainUsername) {
        joinUsernameInput.focus();
      }
      // Clean up URL
      const url = new URL(window.location);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url);
    });
  }
}
