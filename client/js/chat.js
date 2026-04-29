// ============================================
// Chat & Turn History
// ============================================

function initChat() {
  const tabToggle = document.getElementById('tab-toggle');
  const chatTab = document.getElementById('chat-tab-btn');
  const historyTab = document.getElementById('history-tab-btn');
  const chatPanel = document.getElementById('chat-panel');
  const historyPanel = document.getElementById('history-panel');
  
  function setTab(isHistory) {
    chatTab.classList.toggle('active', !isHistory);
    historyTab.classList.toggle('active', isHistory);
    chatPanel.classList.toggle('active', !isHistory);
    historyPanel.classList.toggle('active', isHistory);
    tabToggle.checked = isHistory;
  }
  
  tabToggle.addEventListener('change', () => setTab(tabToggle.checked));
  chatTab.addEventListener('click', () => setTab(false));
  historyTab.addEventListener('click', () => setTab(true));
  
  // Send chat
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-chat-btn');
  
  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'CHAT_MESSAGE', text }));
    }
    chatInput.value = '';
  }
  
  sendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
  });
}

function addChatMessage(data) {
  const container = document.getElementById('chat-messages');
  const initial = data.username.charAt(0).toUpperCase();
  const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const msg = document.createElement('div');
  msg.className = 'chat-message';
  msg.innerHTML = `
    <div class="chat-avatar" style="background: ${getAvatarColor(data.playerId)}">${initial}</div>
    <div class="chat-body">
      <div class="chat-header">
        <span class="chat-username">${escapeHtml(data.username)}</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-text">${escapeHtml(data.text)}</div>
    </div>
  `;
  
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function updateTurnHistory(history) {
  const container = document.getElementById('turn-history');
  container.innerHTML = '';
  
  // Show newest first
  const sorted = [...history].reverse();
  
  for (const entry of sorted) {
    const el = createHistoryEntry(entry);
    container.appendChild(el);
  }
}

function addTurnHistoryEntry(entry) {
  const container = document.getElementById('turn-history');
  const el = createHistoryEntry(entry);
  container.insertBefore(el, container.firstChild);
}

function createHistoryEntry(entry) {
  const el = document.createElement('div');
  el.className = 'history-entry';
  
  const initial = entry.username ? entry.username.charAt(0).toUpperCase() : '?';
  const time = new Date(entry.timestamp).toLocaleString([], {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  
  let detail = '';
  if (entry.action === 'play') {
    const wordCount = entry.wordsFormed.length;
    detail = `Turn #${entry.turnNumber}, ${time} • ${wordCount} Word${wordCount !== 1 ? 's' : ''} • ${entry.totalScore} Points`;
  } else if (entry.action === 'pass') {
    detail = `Turn #${entry.turnNumber}, ${time} • Passed`;
  } else if (entry.action === 'exchange') {
    detail = `Turn #${entry.turnNumber}, ${time} • Exchanged tiles`;
  }
  
  el.innerHTML = `
    <div class="history-header">
      <div class="history-avatar" style="background: ${getAvatarColor(entry.playerId)}">${initial}</div>
      <div class="history-info">
        <div class="history-player">${escapeHtml(entry.username || 'Unknown')}</div>
        <div class="history-detail">${detail}</div>
      </div>
    </div>
  `;
  
  if (entry.tilesPlayed && entry.tilesPlayed.length > 0) {
    const tilesDiv = document.createElement('div');
    tilesDiv.className = 'history-tiles';
    
    for (const tp of entry.tilesPlayed) {
      const tile = document.createElement('div');
      tile.className = 'history-tile';
      tile.innerHTML = `
        <span class="tile-letter">${tp.letter}</span>
        ${tp.points > 0 ? `<span class="tile-points">${tp.points}</span>` : ''}
      `;
      tilesDiv.appendChild(tile);
    }
    
    el.appendChild(tilesDiv);
  }
  
  return el;
}
