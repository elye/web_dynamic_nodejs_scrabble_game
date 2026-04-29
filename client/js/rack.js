// ============================================
// Tile Rack Management
// ============================================

let rackTiles = []; // { id, letter, points, isBlank, chosenLetter }

function initRack() {
  renderRack();
  
  document.getElementById('shuffle-btn').addEventListener('click', shuffleRack);
  document.getElementById('sort-btn').addEventListener('click', sortRack);
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
