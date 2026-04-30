// ============================================
// Board Rendering & Interaction
// ============================================

const PREMIUM_SQUARES = {};

// Standard Scrabble premium square layout
function initPremiumSquares() {
  const tw = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
  const dw = [[1,1],[2,2],[3,3],[4,4],[1,13],[2,12],[3,11],[4,10],
              [13,1],[12,2],[11,3],[10,4],[13,13],[12,12],[11,11],[10,10],[7,7]];
  const tl = [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]];
  const dl = [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
              [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]];
  
  tw.forEach(([r,c]) => PREMIUM_SQUARES[`${r},${c}`] = 'TW');
  dw.forEach(([r,c]) => PREMIUM_SQUARES[`${r},${c}`] = 'DW');
  tl.forEach(([r,c]) => PREMIUM_SQUARES[`${r},${c}`] = 'TL');
  dl.forEach(([r,c]) => PREMIUM_SQUARES[`${r},${c}`] = 'DL');
}
initPremiumSquares();

const PREMIUM_CLASSES = {
  'TW': 'premium-tw',
  'DW': 'premium-dw',
  'TL': 'premium-tl',
  'DL': 'premium-dl',
};

const PREMIUM_LABELS = {
  'TW': 'TW',
  'DW': 'DW',
  'TL': 'TL',
  'DL': 'DL',
};

// Board state
let boardState = Array(15).fill(null).map(() => Array(15).fill(null));
let pendingTiles = []; // { tileId, letter, points, isBlank, chosenLetter, row, col }
let selectedRackTile = null;
let lastMoveTiles = new Set(); // Set of "row,col" strings for last opponent's move

function initBoard() {
  const grid = document.getElementById('board-grid');
  grid.innerHTML = '';
  
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      
      const premium = PREMIUM_SQUARES[`${r},${c}`];
      if (premium) {
        cell.classList.add(PREMIUM_CLASSES[premium]);
        if (r === 7 && c === 7) {
          cell.classList.add('center-star');
          cell.innerHTML = '<span class="premium-label">★</span>';
        } else {
          cell.innerHTML = `<span class="premium-label">${PREMIUM_LABELS[premium]}</span>`;
        }
      }
      
      // Click handler
      cell.addEventListener('click', () => handleCellClick(r, c));
      
      // Drag & drop
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!boardState[r][c] && !pendingTiles.find(t => t.row === r && t.col === c)) {
          cell.classList.add('drop-target');
        } else {
          cell.classList.add('invalid-target');
        }
      });
      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drop-target', 'invalid-target');
      });
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drop-target', 'invalid-target');
        const tileId = e.dataTransfer.getData('text/plain');
        handleTileDrop(tileId, r, c);
      });
      
      grid.appendChild(cell);
    }
  }
}

function handleCellClick(row, col) {
  // If there's a pending tile here, pick it back up
  const pendingIdx = pendingTiles.findIndex(t => t.row === row && t.col === col);
  if (pendingIdx !== -1) {
    const tile = pendingTiles.splice(pendingIdx, 1)[0];
    // Return to rack
    if (tile.isBlank) {
      tile.chosenLetter = undefined;
    }
    addTileToRack({
      id: tile.tileId,
      letter: tile.letter,
      points: tile.points,
      isBlank: tile.isBlank,
    });
    renderBoard();
    // Notify server to recall just this one tile (only if it's my turn)
    if (isMyTurn() && window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'RECALL_TILE', tileId: tile.tileId }));
    }
    // Re-request score preview
    setTimeout(requestScorePreview, 150);
    return;
  }
  
  // If a rack tile is selected, place it
  if (selectedRackTile && !boardState[row][col]) {
    placeTileOnBoard(selectedRackTile, row, col);
    selectedRackTile = null;
    clearRackSelection();
  }
}

function handleTileDrop(tileId, row, col) {
  if (boardState[row][col]) return;
  if (pendingTiles.find(t => t.row === row && t.col === col)) return;
  
  // Check if this is a board-to-board move (pending tile being relocated)
  if (tileId.startsWith('board:')) {
    const actualTileId = tileId.substring(6);
    const pendingIdx = pendingTiles.findIndex(t => t.tileId === actualTileId);
    if (pendingIdx === -1) return;
    
    // Move the pending tile to the new position
    pendingTiles[pendingIdx].row = row;
    pendingTiles[pendingIdx].col = col;
    renderBoard();
    
    // Notify server only if it's my turn
    if (isMyTurn() && window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'MOVE_TILE',
        tileId: actualTileId,
        row: row,
        col: col,
      }));
    }
    // Re-request score preview
    setTimeout(requestScorePreview, 150);
    return;
  }
  
  const tile = removeTileFromRack(tileId);
  if (!tile) return;
  
  placeTileOnBoard(tile, row, col);
}

function isMyTurn() {
  return currentTurn === window.playerId;
}

function placeTileOnBoard(tile, row, col) {
  if (tile.isBlank && !tile.chosenLetter) {
    // Show blank letter chooser
    showBlankModal(tile, row, col);
    return;
  }
  
  pendingTiles.push({
    tileId: tile.id,
    letter: tile.letter,
    points: tile.points,
    isBlank: tile.isBlank,
    chosenLetter: tile.chosenLetter,
    row, col,
  });
  
  renderBoard();
  
  // Only notify server if it's my turn
  if (isMyTurn() && window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({
      type: 'PLACE_TILE',
      tileId: tile.id,
      row, col,
      chosenLetter: tile.chosenLetter,
    }));
    // Request score preview after a short delay for server to process
    setTimeout(requestScorePreview, 100);
  } else {
    // Request tentative score preview during opponent's turn
    setTimeout(requestScorePreview, 100);
  }
}

function showBlankModal(tile, row, col) {
  const modal = document.getElementById('blank-modal');
  const grid = document.getElementById('blank-letter-grid');
  grid.innerHTML = '';
  
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const btn = document.createElement('button');
    btn.className = 'blank-letter-btn';
    btn.textContent = letter;
    btn.addEventListener('click', () => {
      tile.chosenLetter = letter;
      modal.classList.add('hidden');
      placeTileOnBoard(tile, row, col);
    });
    grid.appendChild(btn);
  }
  
  modal.classList.remove('hidden');
}

function renderBoard() {
  const cells = document.querySelectorAll('.board-cell');
  
  cells.forEach(cell => {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    
    // Remove existing tile element
    const existingTile = cell.querySelector('.board-tile');
    if (existingTile) existingTile.remove();
    
    // Check committed tile
    const committed = boardState[row][col];
    if (committed) {
      const isLastMove = lastMoveTiles.has(`${row},${col}`);
      cell.appendChild(createBoardTileElement(committed, false, isLastMove));
      return;
    }
    
    // Check pending tile
    const pending = pendingTiles.find(t => t.row === row && t.col === col);
    if (pending) {
      cell.appendChild(createBoardTileElement(pending, true));
      return;
    }
    
    // Show premium label if no tile
    const premium = PREMIUM_SQUARES[`${row},${col}`];
    const premiumLabel = cell.querySelector('.premium-label');
    if (premium && !premiumLabel) {
      if (row === 7 && col === 7) {
        cell.innerHTML = '<span class="premium-label">★</span>';
      } else {
        cell.innerHTML = `<span class="premium-label">${PREMIUM_LABELS[premium]}</span>`;
      }
    }
  });
}

function createBoardTileElement(tile, isNew, isLastMove) {
  const el = document.createElement('div');
  el.className = 'board-tile';
  if (isNew) el.classList.add('new-tile');
  if (isLastMove) el.classList.add('last-move-tile');
  if (tile.isBlank) el.classList.add('blank-tile');
  
  const displayLetter = tile.isBlank ? (tile.chosenLetter || '?') : tile.letter;
  el.innerHTML = `<span class="tile-letter">${displayLetter}</span>`;
  
  if (!tile.isBlank && tile.points > 0) {
    el.innerHTML += `<span class="tile-points">${tile.points}</span>`;
  }
  
  // Make pending (new) tiles draggable on the board
  if (isNew) {
    el.draggable = true;
    el.style.cursor = 'grab';
    el.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', 'board:' + (tile.tileId || tile.id));
      e.dataTransfer.effectAllowed = 'move';
      // Create a clean drag image of just this tile
      const ghost = el.cloneNode(true);
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.width = el.offsetWidth + 'px';
      ghost.style.height = el.offsetHeight + 'px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, el.offsetWidth / 2, el.offsetHeight / 2);
      setTimeout(() => ghost.remove(), 0);
      el.style.opacity = '0.5';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
      el.style.cursor = 'grab';
    });
  }
  
  return el;
}

function updateBoardState(boardData) {
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      boardState[r][c] = boardData[r][c].tile;
    }
  }
  pendingTiles = [];
  renderBoard();
}

function recallAllTiles() {
  const tiles = [...pendingTiles];
  pendingTiles = [];
  tiles.forEach(t => {
    addTileToRack({
      id: t.tileId,
      letter: t.letter,
      points: t.points,
      isBlank: t.isBlank,
    });
  });
  renderBoard();
  removeScoreHint();
  
  if (isMyTurn() && window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({ type: 'RECALL_TILES' }));
  }
}

function shakePendingTiles() {
  const newTiles = document.querySelectorAll('.board-tile.new-tile');
  newTiles.forEach(t => {
    t.classList.add('shake');
    setTimeout(() => t.classList.remove('shake'), 300);
  });
}

function returnBoardTileToRackAt(tileId, atIndex) {
  const pendingIdx = pendingTiles.findIndex(t => t.tileId === tileId);
  if (pendingIdx === -1) return;
  
  const tile = pendingTiles.splice(pendingIdx, 1)[0];
  if (tile.isBlank) {
    tile.chosenLetter = undefined;
  }
  // Insert at specific position in rack
  rackTiles.splice(atIndex, 0, {
    id: tile.tileId,
    letter: tile.letter,
    points: tile.points,
    isBlank: tile.isBlank,
  });
  renderRack();
  renderBoard();
  
  // Notify server to recall just this one tile
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({ type: 'RECALL_TILE', tileId: tile.tileId }));
  }
  setTimeout(requestScorePreview, 150);
}

function returnBoardTileToRack(tileId) {
  const pendingIdx = pendingTiles.findIndex(t => t.tileId === tileId);
  if (pendingIdx === -1) return;
  
  const tile = pendingTiles.splice(pendingIdx, 1)[0];
  if (tile.isBlank) {
    tile.chosenLetter = undefined;
  }
  addTileToRack({
    id: tile.tileId,
    letter: tile.letter,
    points: tile.points,
    isBlank: tile.isBlank,
  });
  renderBoard();
  
  // Notify server to recall just this one tile
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({ type: 'RECALL_TILE', tileId: tile.tileId }));
  }
  setTimeout(requestScorePreview, 150);
}

// Score hint overlay
function requestScorePreview() {
  if (window.ws && window.ws.readyState === WebSocket.OPEN && pendingTiles.length > 0) {
    if (isMyTurn()) {
      window.ws.send(JSON.stringify({ type: 'PREVIEW_SCORE' }));
    } else {
      // Send placements for tentative preview during opponent's turn
      const placements = pendingTiles.map(t => ({
        letter: t.letter,
        points: t.points,
        isBlank: t.isBlank || false,
        chosenLetter: t.chosenLetter,
        row: t.row,
        col: t.col,
      }));
      window.ws.send(JSON.stringify({ type: 'PREVIEW_SCORE', placements }));
    }
  } else {
    removeScoreHint();
  }
}

function updateScoreHint(data) {
  removeScoreHint();
  
  if (!data.isLegitimate || pendingTiles.length === 0) return;
  
  // Find the last pending tile to anchor the hint near
  const lastTile = pendingTiles[pendingTiles.length - 1];
  const cell = document.querySelector(`.board-cell[data-row="${lastTile.row}"][data-col="${lastTile.col}"]`);
  if (!cell) return;
  
  const hint = document.createElement('div');
  hint.className = 'score-hint';
  hint.classList.add(data.valid ? 'score-hint-valid' : 'score-hint-invalid');
  hint.textContent = data.score;
  cell.appendChild(hint);
}

function removeScoreHint() {
  document.querySelectorAll('.score-hint').forEach(el => el.remove());
}

function showBoardScoreIndicator(tilesPlayed, score) {
  // Remove any existing indicator
  document.querySelectorAll('.board-score-indicator').forEach(el => el.remove());
  
  // Find the last tile position to anchor the indicator
  const lastTile = tilesPlayed[tilesPlayed.length - 1];
  const cell = document.querySelector(`.board-cell[data-row="${lastTile.row}"][data-col="${lastTile.col}"]`);
  if (!cell) return;
  
  const indicator = document.createElement('div');
  indicator.className = 'board-score-indicator';
  indicator.textContent = `+${score}`;
  cell.appendChild(indicator);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    indicator.classList.add('fade-out');
    setTimeout(() => indicator.remove(), 500);
  }, 3000);
}
