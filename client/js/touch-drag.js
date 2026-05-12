// ============================================
// Touch Drag Support for mobile browsers
// Mirrors the HTML5 drag-and-drop interactions for touchscreen devices
// ============================================

(function initTouchDrag() {
  let activeDrag = null; // { tileId, ghost, offsetX, offsetY, sourceType }

  function createGhost(el) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.id = 'touch-drag-ghost';
    ghost.style.cssText = `
      position: fixed;
      width: ${rect.width}px;
      height: ${rect.height}px;
      pointer-events: none;
      opacity: 0.85;
      z-index: 9999;
      border-radius: 6px;
      transform: scale(1.1);
      transition: none;
    `;
    document.body.appendChild(ghost);
    return ghost;
  }

  function moveGhost(touch) {
    if (!activeDrag) return;
    activeDrag.ghost.style.left = (touch.clientX - activeDrag.offsetX) + 'px';
    activeDrag.ghost.style.top  = (touch.clientY - activeDrag.offsetY) + 'px';
  }

  function getElementUnderTouch(touch) {
    activeDrag.ghost.style.display = 'none';
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    activeDrag.ghost.style.display = '';
    return el;
  }

  function endDrag(touch) {
    if (!activeDrag) return;
    activeDrag.ghost.remove();
    const target = getElementUnderTouch(touch);
    activeDrag.ghost.remove(); // ensure removed
    const { tileId, sourceType } = activeDrag;
    activeDrag = null;

    if (!target) return;

    // Drop onto a board cell
    const cell = target.closest('.board-cell');
    if (cell) {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);
      if (sourceType === 'board') {
        handleTileDrop('board:' + tileId, row, col);
      } else {
        handleTileDrop(tileId, row, col);
      }
      return;
    }

    // Drop back onto the rack
    const rackContainer = target.closest('#tile-rack');
    if (rackContainer && sourceType === 'board') {
      returnBoardTileToRack(tileId);
    }
  }

  // Listen for touchstart on rack tiles and board pending tiles
  document.addEventListener('touchstart', (e) => {
    const el = e.target.closest('.rack-tile, .board-tile.new-tile');
    if (!el) return;

    const tileId = el.dataset.tileId;
    if (!tileId) return;

    const touch = e.touches[0];
    const rect  = el.getBoundingClientRect();
    const ghost = createGhost(el);

    const offsetX = touch.clientX - rect.left;
    const offsetY = touch.clientY - rect.top;

    ghost.style.left = (touch.clientX - offsetX) + 'px';
    ghost.style.top  = (touch.clientY - offsetY) + 'px';

    activeDrag = {
      tileId,
      ghost,
      offsetX,
      offsetY,
      sourceType: el.classList.contains('board-tile') ? 'board' : 'rack',
    };

    // Deselect any click-selected rack tile when a drag starts
    if (typeof clearRackSelection === 'function') clearRackSelection();

    e.preventDefault(); // prevent scroll while dragging
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!activeDrag) return;
    moveGhost(e.touches[0]);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (!activeDrag) return;
    endDrag(e.changedTouches[0]);
  });

  document.addEventListener('touchcancel', () => {
    if (!activeDrag) return;
    activeDrag.ghost.remove();
    activeDrag = null;
  });
})();
