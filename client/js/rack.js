// ============================================
// Tile Rack Management
// ============================================

let rackTiles = []; // { id, letter, points, isBlank, chosenLetter }

function initRack() {
  renderRack();
  
  document.getElementById('shuffle-btn').addEventListener('click', shuffleRack);
  document.getElementById('sort-btn').addEventListener('click', recallAllTiles);
  
  // Allow dropping board tiles back onto the rack
  const rackContainer = document.getElementById('tile-rack');
  rackContainer.addEventListener('dragover', (e) => {
    const types = e.dataTransfer.types;
    if (types.includes('text/plain')) {
      e.preventDefault();
      rackContainer.classList.add('rack-drop-target');
    }
  });
  rackContainer.addEventListener('dragleave', () => {
    rackContainer.classList.remove('rack-drop-target');
  });
  rackContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    rackContainer.classList.remove('rack-drop-target');
    const tileId = e.dataTransfer.getData('text/plain');
    if (tileId.startsWith('board:')) {
      const actualTileId = tileId.substring(6);
      returnBoardTileToRack(actualTileId);
    }
  });
}

function renderRack() {
  const rack = document.getElementById('tile-rack');
  rack.innerHTML = '';
  
  // Render tiles
  for (const tile of rackTiles) {
    const el = createRackTileElement(tile);
    rack.appendChild(el);
  }
  
  // Empty slots
  for (let i = rackTiles.length; i < 7; i++) {
    const slot = document.createElement('div');
    slot.className = 'rack-slot-empty';
    rack.appendChild(slot);
  }
}

function createRackTileElement(tile) {
  const el = document.createElement('div');
  el.className = 'rack-tile';
  if (tile.isBlank) el.classList.add('blank-tile');
  el.dataset.tileId = tile.id;
  el.draggable = true;
  
  const displayLetter = tile.isBlank ? ' ' : tile.letter;
  el.innerHTML = `<span class="tile-letter">${displayLetter}</span>`;
  
  if (!tile.isBlank && tile.points > 0) {
    el.innerHTML += `<span class="tile-points">${tile.points}</span>`;
  }
  
  // Click to select
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectedRackTile && selectedRackTile.id === tile.id) {
      selectedRackTile = null;
      clearRackSelection();
    } else {
      selectedRackTile = tile;
      highlightRackTile(tile.id);
    }
  });
  
  // Drag start
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', tile.id);
    el.classList.add('dragging');
    selectedRackTile = null;
    clearRackSelection();
  });
  
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    // Clean up any drop indicators
    document.querySelectorAll('.rack-tile').forEach(t => t.classList.remove('rack-drag-over'));
  });
  
  // Allow dropping other rack tiles onto this one to reorder
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Show indicator for both rack-to-rack and board-to-rack drops
    const dragging = document.querySelector('.rack-tile.dragging');
    if (dragging && dragging !== el) {
      el.classList.add('rack-drag-over');
    } else if (!dragging) {
      // Could be a board tile being dragged to rack
      el.classList.add('rack-drag-over');
    }
  });
  
  el.addEventListener('dragleave', () => {
    el.classList.remove('rack-drag-over');
  });
  
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('rack-drag-over');
    
    const draggedTileId = e.dataTransfer.getData('text/plain');
    
    // Handle board tile being returned to a specific rack position
    if (draggedTileId.startsWith('board:')) {
      const actualTileId = draggedTileId.substring(6);
      const toIdx = rackTiles.findIndex(t => t.id === tile.id);
      if (toIdx === -1) return;
      returnBoardTileToRackAt(actualTileId, toIdx);
      return;
    }
    
    // Handle rack-to-rack reorder
    const fromIdx = rackTiles.findIndex(t => t.id === draggedTileId);
    const toIdx = rackTiles.findIndex(t => t.id === tile.id);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    
    // Move the tile from fromIdx to toIdx
    const [movedTile] = rackTiles.splice(fromIdx, 1);
    rackTiles.splice(toIdx, 0, movedTile);
    renderRack();
  });
  
  return el;
}

function highlightRackTile(tileId) {
  document.querySelectorAll('.rack-tile').forEach(el => {
    el.classList.toggle('selected', el.dataset.tileId === tileId);
  });
}

function clearRackSelection() {
  selectedRackTile = null;
  document.querySelectorAll('.rack-tile').forEach(el => {
    el.classList.remove('selected');
  });
}

function addTileToRack(tile) {
  rackTiles.push(tile);
  renderRack();
}

function removeTileFromRack(tileId) {
  const idx = rackTiles.findIndex(t => t.id === tileId);
  if (idx === -1) return null;
  const tile = rackTiles.splice(idx, 1)[0];
  renderRack();
  return tile;
}

function setRack(tiles) {
  rackTiles = tiles.map(t => ({
    id: t.id,
    letter: t.letter,
    points: t.points,
    isBlank: t.isBlank,
    chosenLetter: t.chosenLetter,
  }));
  renderRack();
}

function shuffleRack() {
  for (let i = rackTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rackTiles[i], rackTiles[j]] = [rackTiles[j], rackTiles[i]];
  }
  renderRack();
}

function sortRack() {
  rackTiles.sort((a, b) => {
    const la = a.isBlank ? 'ZZ' : a.letter;
    const lb = b.isBlank ? 'ZZ' : b.letter;
    return la.localeCompare(lb);
  });
  renderRack();
}
