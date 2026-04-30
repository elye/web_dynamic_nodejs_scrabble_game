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

function notifyChatTab() {
  const chatTab = document.getElementById('chat-tab-btn');
  if (chatTab.classList.contains('active')) return;
  chatTab.classList.remove('chat-notify');
  // Force reflow to restart animation
  void chatTab.offsetWidth;
  chatTab.classList.add('chat-notify');
  chatTab.addEventListener('animationend', () => {
    chatTab.classList.remove('chat-notify');
  }, { once: true });
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
  
  // Show the display word (full word with existing + new tiles) or fallback to tilesPlayed
  if (entry.displayWord && entry.displayWord.length > 0) {
    const tilesDiv = document.createElement('div');
    tilesDiv.className = 'history-tiles';
    
    for (const tp of entry.displayWord) {
      const tile = document.createElement('div');
      tile.className = 'history-tile';
      
      if (!tp.isNew) {
        // Existing tile on board - grey
        tile.classList.add('history-tile-existing');
      } else if (tp.premium) {
        // New tile on premium square
        tile.classList.add('history-tile-premium-' + tp.premium.toLowerCase());
      }
      
      tile.innerHTML = `
        <span class="tile-letter">${tp.letter}</span>
        ${tp.points > 0 ? `<span class="tile-points">${tp.points}</span>` : ''}
      `;
      tilesDiv.appendChild(tile);
    }
    
    el.appendChild(tilesDiv);
  } else if (entry.tilesPlayed && entry.tilesPlayed.length > 0) {
    const sortedTiles = [...entry.tilesPlayed].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
    
    const tilesDiv = document.createElement('div');
    tilesDiv.className = 'history-tiles';
    
    for (const tp of sortedTiles) {
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
  
  // Show each word formed with its score and definition
  if (entry.wordsFormed && entry.wordsFormed.length > 0) {
    const wordsDiv = document.createElement('div');
    wordsDiv.className = 'history-words';
    
    for (const wordEntry of entry.wordsFormed) {
      const wordEl = document.createElement('div');
      wordEl.className = 'history-word-item';
      wordEl.innerHTML = `
        <span class="history-word-text">${escapeHtml(wordEntry.word)}</span>
        <span class="history-word-score">${wordEntry.score} pts</span>
      `;
      
      // Add definition container
      const defEl = document.createElement('div');
      defEl.className = 'history-word-def';
      defEl.textContent = 'Loading...';
      wordEl.appendChild(defEl);
      
      // Fetch definition
      fetchWordDefinition(wordEntry.word, defEl);
      
      wordsDiv.appendChild(wordEl);
    }
    
    el.appendChild(wordsDiv);
  }
  
  return el;
}

// Cache for word definitions
const wordDefCache = {};

function fetchWordDefinition(word, defElement) {
  const lowerWord = word.toLowerCase();
  
  // Check cache first
  if (wordDefCache[lowerWord] !== undefined) {
    defElement.textContent = wordDefCache[lowerWord] || '';
    if (!wordDefCache[lowerWord]) defElement.remove();
    return;
  }
  
  fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lowerWord)}`)
    .then(res => {
      if (!res.ok) throw new Error('Not found');
      return res.json();
    })
    .then(data => {
      const meaning = data[0]?.meanings?.[0];
      const def = meaning?.definitions?.[0]?.definition;
      if (def) {
        const partOfSpeech = meaning.partOfSpeech ? `(${meaning.partOfSpeech}) ` : '';
        const text = partOfSpeech + def;
        wordDefCache[lowerWord] = text;
        defElement.textContent = text;
      } else {
        wordDefCache[lowerWord] = '';
        defElement.remove();
      }
    })
    .catch(() => {
      wordDefCache[lowerWord] = '';
      defElement.remove();
    });
}
