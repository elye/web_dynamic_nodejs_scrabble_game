// ============================================
// Touch Drag Support for mobile browsers
// Mirrors the HTML5 drag-and-drop interactions for touchscreen devices
// Tap (no movement) falls through to the click-to-select handler.
// Drag (movement > threshold) shows a ghost and hides the original tile.
// ============================================

(function initTouchDrag() {
  const DRAG_THRESHOLD = 8; // px — movement needed to commit to drag vs tap

  let pendingTouch = null; // touch that might become a drag (before threshold)
  let activeDrag   = null; // confirmed drag in progress

  function createGhost(el) {
    const rect  = el.getBoundingClientRect();
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
    // Append to the fullscreen element when active, otherwise document.body.
    // In fullscreen mode only the fullscreen element and its descendants are
    // rendered, so a ghost on document.body would be invisible.
    const container = document.fullscreenElement || document.webkitFullscreenElement || document.body;
    container.appendChild(ghost);
    return ghost;
  }

  // Calculate the rack insert index based on the touch X position.
  // Walks through rack tile elements and returns the index of the first tile
  // whose midpoint is to the right of the touch — i.e. "insert before that tile".
  function getRackInsertIndex(touchX) {
    const tiles = document.querySelectorAll('#tile-rack .rack-tile');
    for (let i = 0; i < tiles.length; i++) {
      const rect = tiles[i].getBoundingClientRect();
      if (touchX < rect.left + rect.width / 2) return i;
    }
    return tiles.length; // insert at end
  }

  function endDrag(touch) {
    if (!activeDrag) return;
    const { el, tileId, sourceType, ghost } = activeDrag;
    activeDrag = null;

    // Hide ghost to find the element underneath the finger
    ghost.style.display = 'none';
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    ghost.remove();
    el.style.visibility = ''; // restore original tile (handleTileDrop will remove it from rack)

    if (!target) return;

    // Drop onto a board cell
    const cell = target.closest('.board-cell');
    if (cell) {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);
      handleTileDrop(sourceType === 'board' ? 'board:' + tileId : tileId, row, col);
      return;
    }

    // Drop onto the rack area (both rack reorder and board-to-rack return)
    const rackContainer  = target.closest('#tile-rack');
    const targetRackTile = target.closest('.rack-tile');
    if (rackContainer) {
      const insertIdx = getRackInsertIndex(touch.clientX);
      if (sourceType === 'rack') {
        // Reorder rack tile to the precise drop position
        if (typeof reorderRackTileToIndex === 'function') {
          reorderRackTileToIndex(tileId, insertIdx);
        }
      } else if (sourceType === 'board') {
        // Return board tile to rack at the precise drop position
        if (typeof returnBoardTileToRackAt === 'function') {
          returnBoardTileToRackAt(tileId, insertIdx);
        } else {
          returnBoardTileToRack(tileId);
        }
      }
    }
  }

  // ---- Event listeners ----

  // touchstart: record position but don't prevent default yet (lets taps fire clicks)
  document.addEventListener('touchstart', (e) => {
    const el = e.target.closest('.rack-tile, .board-tile.new-tile');
    if (!el) return;
    const tileId = el.dataset.tileId;
    if (!tileId) return;
    const touch = e.touches[0];
    pendingTouch = {
      el,
      tileId,
      startX: touch.clientX,
      startY: touch.clientY,
      sourceType: el.classList.contains('board-tile') ? 'board' : 'rack',
    };
  }, { passive: true }); // passive = true so scroll isn't blocked until drag starts

  // touchmove: upgrade to drag once threshold is crossed; then prevent scroll
  document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];

    if (pendingTouch && !activeDrag) {
      const dx = touch.clientX - pendingTouch.startX;
      const dy = touch.clientY - pendingTouch.startY;
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

      // Threshold crossed — commit to drag
      const { el, tileId, sourceType, startX, startY } = pendingTouch;
      pendingTouch = null;

      const rect    = el.getBoundingClientRect();
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;
      const ghost   = createGhost(el);
      ghost.style.left = (touch.clientX - offsetX) + 'px';
      ghost.style.top  = (touch.clientY - offsetY) + 'px';

      // Hide the original tile so it looks like it was picked up
      el.style.visibility = 'hidden';

      // Deselect any previously click-selected tile
      if (typeof clearRackSelection === 'function') clearRackSelection();

      activeDrag = { tileId, ghost, offsetX, offsetY, sourceType, el };
    }

    if (activeDrag) {
      activeDrag.ghost.style.left = (touch.clientX - activeDrag.offsetX) + 'px';
      activeDrag.ghost.style.top  = (touch.clientY - activeDrag.offsetY) + 'px';
      e.preventDefault(); // prevent page scroll while dragging
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    pendingTouch = null;
    if (!activeDrag) return; // was a tap — click handler will fire normally
    endDrag(e.changedTouches[0]);
  });

  document.addEventListener('touchcancel', () => {
    pendingTouch = null;
    if (!activeDrag) return;
    activeDrag.el.style.visibility = '';
    activeDrag.ghost.remove();
    activeDrag = null;
  });

  function cancelActiveDrag() {
    if (activeDrag) {
      activeDrag.el.style.visibility = '';
      activeDrag.ghost.remove();
      activeDrag = null;
    }
    pendingTouch = null;
  }

  window.TouchDrag = { cancelActiveDrag: cancelActiveDrag };
})();

