// ============================================
// Mobile Board Zoom  (board-zoom.js)
//
// Zooms .board-wrapper via CSS transform so one board cell ≈ one rack tile.
// Two triggers:
//   • Tap a board cell  → toggle zoom in/out on that cell (CSS transition).
//   • Drag a rack/board tile → zoom tracks the cell under the finger via a
//                              requestAnimationFrame lerp loop; zooms out
//                              automatically when the drag ends.
//
// Transform strategy
//   transform-origin is fixed at "0 0" (set in the CSS media query, never
//   changed by JS).  The visible area is controlled by a "translate(tx, ty)"
//   prepended to the scale term:
//
//       wrapper transform = translate(tx, ty) scale(S)
//
//   With origin 0 0, CSS applies the matrix T(tx,ty)*S, so a local point
//   (px, py) maps to screen as:
//       screenX = wrapperNaturalLeft + px*S + tx
//       screenY = wrapperNaturalTop  + py*S + ty
//
//   To keep the target cell centre at its *unscaled* on-screen position:
//       tx = cellCenterX * (1 - S)
//       ty = cellCenterY * (1 - S)
//
//   tx and ty are clamped to [wrapperW*(1-S), 0] × [wrapperH*(1-S), 0]
//   so the scaled board always covers the container (no grey space).
//
// Lerp (drag smoothing)
//   Each RAF frame:
//       txCurrent += (txTarget - txCurrent) * LERP   (LERP = 0.18)
//       tyCurrent += (tyTarget - tyCurrent) * LERP
//   txTarget / tyTarget are updated whenever the finger enters a new cell.
//   The loop runs while isDragging; on drag-end the loop is cancelled and
//   a 0.2 s CSS ease transition animates back to the identity transform.
//
// Only activates on mobile (window.innerWidth ≤ 768).
// Does NOT modify touch-drag.js — listens to the same touch events in parallel.
// ============================================

(function BoardZoom() {
  'use strict';

  // Width of a rack tile on mobile — must match `.rack-tile { width: 40px }`
  // in styles.css @media (max-width: 600px).
  var RACK_TILE_WIDTH = 40;

  // Drag threshold in px — keep in sync with touch-drag.js.
  var DRAG_THRESHOLD = 8;

  // Lerp factor per frame (~60 fps feels responsive at 0.18).
  var LERP = 0.18;

  // ---- Module state ----
  var isDragging     = false;  // true once drag crosses DRAG_THRESHOLD
  var dragStartPos   = null;   // { x, y } from touchstart over a tile element
  var dragOrigin     = null;   // 'board' or 'rack' — which element started the drag
  var isZoomed          = false;  // true whenever any zoom is active
  var placedTilesCenter = null;   // { row, col } centre of new-tile bounding box, or null

  // Transform state — mirrors the inline style; kept in sync at all times.
  var txCurrent = 0;
  var tyCurrent = 0;
  var txTarget  = 0;
  var tyTarget  = 0;
  var zoomScale = 1;
  var sCurrent  = 1;  // lerped scale; starts at 1 (unzoomed)
  var sTarget   = 1;  // target scale for the lerp loop

  // requestAnimationFrame handle; non-null only while the lerp loop runs.
  var rafId = null;

  // Cached unscaled layout measurements; null-ed on resize/orientation-change.
  var measurements = null;

  // Pan gesture state — free-finger panning while zoomed (no tile drag active).
  var isPanning  = false;
  var panStartX  = null;
  var panStartY  = null;
  var panStartTx = null;
  var panStartTy = null;

  // Last recorded touch position — used to compute velocity for edge-scroll direction gating.
  var lastTouchX = 0;
  var lastTouchY = 0;

  // Dwell-based edge-scroll state.
  var edgeScrollDwellTimer = null;   // setTimeout handle
  var edgeScrollActive     = false;  // true once dwell period has elapsed
  var edgeScrollLastZone   = null;   // which zone the finger is in: 'top'|'right'|'bottom'|'left'|null

  // ---- Helpers ----

  function isMobile() {
    return window.innerWidth <= 600;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Write the current translate+scale transform to .board-wrapper. */
  function applyTransform(tx, ty, s) {
    var wrapper = document.querySelector('.board-wrapper');
    if (!wrapper) return;
    wrapper.style.transform =
      'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
  }

  /**
   * Measure .board-wrapper and #board-grid in their *unscaled* layout state.
   *
   * Temporarily clears the inline transform (no browser paint occurs because
   * we restore it in the same JS task before the next frame), reads
   * getBoundingClientRect, then restores the previous transform.
   *
   * Results are cached in `measurements` until a resize/orientation-change
   * invalidates them.
   */
  function ensureMeasurements() {
    if (measurements) return measurements;

    var wrapper = document.querySelector('.board-wrapper');
    var grid    = document.getElementById('board-grid');
    if (!wrapper || !grid) return null;

    // Clear inline transform so rects reflect unscaled layout geometry.
    wrapper.style.transition = 'none';
    wrapper.style.transform  = 'none';
    void wrapper.offsetWidth; // synchronous reflow — no paint yet

    var wr  = wrapper.getBoundingClientRect();
    var gr  = grid.getBoundingClientRect();
    var bc  = document.querySelector('.board-container');
    var bcr = bc ? bc.getBoundingClientRect() : wr;
    var cw  = gr.width  / 15;
    var ch  = gr.height / 15;
    var s   = (cw > 0) ? Math.max(1, RACK_TILE_WIDTH / cw) : 1;

    measurements = {
      wrapperW    : wr.width,
      wrapperH    : wr.height,
      gridOffX    : gr.left - wr.left,  // grid origin in wrapper-local coords
      gridOffY    : gr.top  - wr.top,
      cellW       : cw,
      cellH       : ch,
      scale       : s,
      // Container centre in wrapper-local coords — used to centre cells in view.
      containerCX : (bcr.left + bcr.width  / 2) - wr.left,
      containerCY : (bcr.top  + bcr.height / 2) - wr.top
    };

    // Restore the live transform before the browser paints.
    applyTransform(txCurrent, tyCurrent, sCurrent);
    return measurements;
  }

  /**
   * Compute the clamped (tx, ty) that keeps the centre of cell (row, col)
   * at its unscaled on-screen position after scaling by m.scale.
   */
  function targetForCell(m, row, col) {
    var cx = m.gridOffX + col * m.cellW + m.cellW / 2;
    var cy = m.gridOffY + row * m.cellH + m.cellH / 2;
    // Place the cell centre at the container centre (wrapper-local coords):
    //   containerCX = cx * S + tx  →  tx = containerCX - cx * S
    var txIdeal = m.containerCX - cx * m.scale;
    var tyIdeal = m.containerCY - cy * m.scale;
    return {
      tx: clamp(txIdeal, m.wrapperW * (1 - m.scale), 0),
      ty: clamp(tyIdeal, m.wrapperH * (1 - m.scale), 0)
    };
  }

  /**
   * Returns the board { row, col } that visually covers the screen point (x, y).
   * getBoundingClientRect accounts for CSS transforms, so this works while zoomed.
   */
  function cellAtPoint(x, y) {
    var grid = document.getElementById('board-grid');
    if (!grid) return null;
    var r = grid.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    var col = Math.min(14, Math.max(0, Math.floor((x - r.left) / r.width  * 15)));
    var row = Math.min(14, Math.max(0, Math.floor((y - r.top)  / r.height * 15)));
    return { row: row, col: col };
  }

  /**
   * Compute the centre cell of all currently-placed (.new-tile) cells plus any
   * directly adjacent existing tiles.  Result is stored in `placedTilesCenter`
   * and used as the fallback initial zoom target when dragging starts off-board.
   */
  function computePlacedTilesCenter() {
    var grid = document.getElementById('board-grid');
    if (!grid) { placedTilesCenter = null; return; }

    var newTiles = grid.querySelectorAll('.board-tile.new-tile');
    if (!newTiles.length) { placedTilesCenter = null; return; }

    var rows = [], cols = [];
    var i, cell, r, c;

    for (i = 0; i < newTiles.length; i++) {
      // .new-tile is on the .board-tile child; row/col are on the parent .board-cell
      cell = newTiles[i].closest('.board-cell');
      if (!cell) continue;
      r = parseInt(cell.dataset.row, 10);
      c = parseInt(cell.dataset.col, 10);
      rows.push(r);
      cols.push(c);

      // Include orthogonal neighbours that already carry a tile.
      var nbrs = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (var j = 0; j < nbrs.length; j++) {
        var nr = nbrs[j][0], nc = nbrs[j][1];
        if (nr < 0 || nr > 14 || nc < 0 || nc > 14) continue;
        var nbrCell = grid.querySelector(
          '.board-cell[data-row="' + nr + '"][data-col="' + nc + '"]'
        );
        if (nbrCell && nbrCell.querySelector('.board-tile') &&
            !nbrCell.querySelector('.board-tile.new-tile')) {
          rows.push(nr);
          cols.push(nc);
        }
      }
    }

    var minRow = rows[0], maxRow = rows[0];
    var minCol = cols[0], maxCol = cols[0];
    for (i = 1; i < rows.length; i++) {
      if (rows[i] < minRow) minRow = rows[i];
      if (rows[i] > maxRow) maxRow = rows[i];
    }
    for (i = 1; i < cols.length; i++) {
      if (cols[i] < minCol) minCol = cols[i];
      if (cols[i] > maxCol) maxCol = cols[i];
    }

    placedTilesCenter = {
      row: Math.round((minRow + maxRow) / 2),
      col: Math.round((minCol + maxCol) / 2)
    };
  }

  // ---- RAF lerp loop ----

  function rafStep() {
    txCurrent += (txTarget - txCurrent) * LERP;
    tyCurrent += (tyTarget - tyCurrent) * LERP;
    sCurrent  += (sTarget  - sCurrent)  * LERP;
    applyTransform(txCurrent, tyCurrent, sCurrent);
    if (isDragging || isPanning) {
      rafId = requestAnimationFrame(rafStep);
    } else {
      rafId = null;
    }
  }

  function startRaf() {
    if (!rafId) {
      rafId = requestAnimationFrame(rafStep);
    }
  }

  function stopRaf() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ---- Edge-scroll dwell helpers ----

  function startEdgeDwell(zone) {
    if (edgeScrollLastZone === zone && (edgeScrollDwellTimer || edgeScrollActive)) return; // already in this zone
    cancelEdgeDwell();
    edgeScrollLastZone = zone;
    edgeScrollDwellTimer = setTimeout(function () {
      edgeScrollDwellTimer = null;
      edgeScrollActive = true;
    }, 250);
  }

  function cancelEdgeDwell() {
    if (edgeScrollDwellTimer) {
      clearTimeout(edgeScrollDwellTimer);
      edgeScrollDwellTimer = null;
    }
    edgeScrollActive = false;
    edgeScrollLastZone = null;
  }

  // ---- Core zoom functions ----

  /**
   * Zoom to the cell at (row, col).
   *
   * smooth = true  (default) → CSS 0.2 s ease transition; used for tap-zoom.
   * smooth = false           → updates the RAF lerp target; used during drag.
   */
  function zoomToCell(row, col, smooth) {
    if (!isMobile()) return;
    smooth = (smooth !== false);

    var m = ensureMeasurements();
    if (!m) return;

    var t = targetForCell(m, row, col);
    zoomScale = m.scale;

    var wrapper = document.querySelector('.board-wrapper');
    if (!wrapper) return;

    if (smooth) {
      // Tap-zoom path: CSS transition.
      // Cancel any running RAF and lock the current animated position so the
      // transition starts from the correct visual state.
      stopRaf();
      sTarget = zoomScale;
      wrapper.style.transition = 'none';
      applyTransform(txCurrent, tyCurrent, sCurrent);
      void wrapper.offsetWidth; // commit

      txCurrent = t.tx;
      tyCurrent = t.ty;
      sCurrent  = zoomScale;  // CSS transition owns the animation; sync sCurrent to end state
      wrapper.style.transition = 'transform 0.2s ease';
      applyTransform(t.tx, t.ty, zoomScale);
    } else {
      // Drag path: update lerp target; the RAF loop moves txCurrent toward it.
      txTarget = t.tx;
      tyTarget = t.ty;
      startRaf();
    }

    wrapper.classList.add('board-zoomed');
    isZoomed = true;
  }

  /**
   * Remove the zoom transform from .board-wrapper.
   *
   * smooth = true  (default) → cancel RAF, then CSS 0.2 s ease to identity.
   * smooth = false           → instant reset (resize / touchcancel).
   */
  function zoomOut(smooth) {
    smooth = (smooth !== false);
    var wrapper = document.querySelector('.board-wrapper');
    if (!wrapper) return;

    stopRaf();

    if (smooth) {
      // Lock the last lerped position, then let CSS animate to identity.
      wrapper.style.transition = 'none';
      applyTransform(txCurrent, tyCurrent, sCurrent);
      void wrapper.offsetWidth; // commit

      wrapper.style.transition = 'transform 0.2s ease';
      wrapper.style.transform  = 'translate(0px,0px) scale(1)';
    } else {
      wrapper.style.transition = 'none';
      wrapper.style.transform  = ''; // remove inline → CSS default (no transform)
    }

    txCurrent = 0;
    tyCurrent = 0;
    txTarget  = 0;
    tyTarget  = 0;
    zoomScale = 1;
    sCurrent  = 1;
    sTarget   = 1;

    wrapper.classList.remove('board-zoomed');
    isZoomed   = false;
    isPanning  = false;
    dragOrigin = null;
    panStartX  = null;
    panStartY  = null;
    panStartTx = null;
    panStartTy = null;
    cancelEdgeDwell();
  }

  // ---- Touch event listeners ----
  // Most listeners are passive:true.  The touchmove listener is passive:false
  // so it can call e.preventDefault() to suppress page scroll during a pan gesture.

  // touchstart: detect the start of a potential tile drag or free-finger pan.
  document.addEventListener('touchstart', function (e) {
    if (!isMobile()) return;
    var touch  = e.touches[0];
    var tileEl = e.target.closest('.rack-tile, .board-tile.new-tile');
    if (tileEl) {
      dragStartPos = { x: touch.clientX, y: touch.clientY };
      isDragging   = false;
      dragOrigin   = tileEl.classList.contains('board-tile') ? 'board' : 'rack';
    } else if (isZoomed && e.target.closest('.board-container, .board-wrapper')) {
      // Snap scale to its target so no scale animation runs during pan —
      // prevents the ongoing scale lerp from feeling like translation lag.
      sCurrent   = sTarget;
      panStartX  = touch.clientX;
      panStartY  = touch.clientY;
      panStartTx = txCurrent;
      panStartTy = tyCurrent;
      // Seed velocity tracking at finger position so first pan delta is 0, not huge.
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      isPanning  = false;
    }
  }, { passive: true });

  // touchmove: commit to drag once threshold crossed; edge-scroll when the
  // drag point enters the outer 15 % margin of the visible container.
  // While the finger stays inside the safe zone the board remains stationary.
  // passive:false so we can call preventDefault() during a free-finger pan.
  document.addEventListener('touchmove', function (e) {
    if (!isMobile()) return;
    var touch  = e.touches[0];
    var touchX = touch.clientX;
    var touchY = touch.clientY;

    // --- Pan gesture (free-finger pan while zoomed, no tile drag) ---
    if (!isDragging && panStartX !== null) {
      var pdx = touchX - panStartX;
      var pdy = touchY - panStartY;
      if (!isPanning && Math.sqrt(pdx * pdx + pdy * pdy) >= 4) {
        isPanning = true;
      }
      if (isPanning) {
        e.preventDefault(); // suppress page scroll while the board is being panned
        // Apply delta-from-last-position directly for zero-lag 1:1 tracking.
        var pm = ensureMeasurements();
        if (pm) {
          var S = pm.scale;
          var ddx = touchX - lastTouchX;  // delta since last event
          var ddy = touchY - lastTouchY;
          var ptx = clamp(txCurrent + ddx, pm.wrapperW * (1 - S), 0);
          var pty = clamp(tyCurrent + ddy, pm.wrapperH * (1 - S), 0);
          txCurrent = txTarget = ptx;
          tyCurrent = tyTarget = pty;
          applyTransform(txCurrent, tyCurrent, sCurrent);
        }
      }
    }

    // Save previous position for velocity calculations, then advance tracking.
    var prevTouchX = lastTouchX;
    var prevTouchY = lastTouchY;
    lastTouchX = touchX;
    lastTouchY = touchY;

    if (!dragStartPos) return;

    if (!isDragging) {
      var dx = touchX - dragStartPos.x;
      var dy = touchY - dragStartPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

      // Drag threshold crossed — ensure layout is measured (once per session).
      var m = ensureMeasurements();
      if (!m) return;

      isDragging  = true;
      isZoomed    = true;
      var wrapperEl = document.querySelector('.board-wrapper');
      if (wrapperEl) wrapperEl.classList.add('board-zoomed');

      // Reset velocity tracking to current position so the first edge-scroll
      // frame computes velocity = 0 (not touchY - 0 = huge positive number).
      lastTouchX = touchX;
      lastTouchY = touchY;

      zoomScale = m.scale;

      // If tiles are already on the board, the zoom position is locked —
      // do NOT update txTarget/tyTarget so the view stays exactly where it was
      // when the first tile was placed.  Edge-scroll (below) still runs normally.
      if (document.querySelectorAll('.board-tile.new-tile').length > 0) {
        console.log('[BoardZoom] drag-start locked: tiles already on board');
        sTarget = zoomScale;  // sCurrent is already at zoomScale from prior drag — no jump
        startRaf();
      } else {
        sTarget  = m.scale;
        sCurrent = (!isZoomed || sCurrent < 1.05) ? 1 : zoomScale;  // lerp from 1 if unzoomed
        // Compute placed-tile bounding box for the off-board fallback (Bug 2).
        computePlacedTilesCenter();

        // Zoom to the cell under the finger if on the board; otherwise use the
        // placed-tiles centre (Bug 2) or the board centre as a fallback.
        var initCell = cellAtPoint(touchX, touchY);
        if (initCell) {
          console.log('[BoardZoom] drag-start cell detected:', initCell.row, initCell.col);
          var t0 = targetForCell(m, initCell.row, initCell.col);
          txTarget = t0.tx;
          tyTarget = t0.ty;
        } else {
          var fallback = placedTilesCenter || { row: 7, col: 7 };
          console.log('[BoardZoom] drag-start off-board; fallback cell:', fallback.row, fallback.col);
          var tf = targetForCell(m, fallback.row, fallback.col);
          txTarget = tf.tx;
          tyTarget = tf.ty;
        }
        startRaf();
      }
    }

    if (!measurements) return;

    // Edge-scroll: only pan when the drag point enters the outer 15 % margin
    // of the visible container.  Inside the safe zone the board stays locked.
    var container = document.querySelector('.board-container');
    if (!container) return;

    var cr      = container.getBoundingClientRect();
    var marginX = cr.width  * 0.15;
    var marginY = cr.height * 0.15;
    var safeLeft   = cr.left   + marginX;
    var safeRight  = cr.right  - marginX;
    var safeTop    = cr.top    + marginY;
    var safeBottom = cr.bottom - marginY;

    if (isDragging) {
      // Only consider edge zones when the finger is actually inside the container.
      // If it's outside (e.g. in the rack area or page header), cancel dwell.
      var fingerInsideContainer = (
        touchX >= cr.left && touchX <= cr.right &&
        touchY >= cr.top  && touchY <= cr.bottom
      );

      // Determine which edge zone the finger is in (only one zone at a time, prioritise Y).
      var currentZone = null;
      if (fingerInsideContainer) {
        if (touchY < safeTop)         currentZone = 'top';
        else if (touchY > safeBottom) currentZone = 'bottom';
        else if (touchX < safeLeft)   currentZone = 'left';
        else if (touchX > safeRight)  currentZone = 'right';
      }

      if (currentZone) {
        startEdgeDwell(currentZone);
      } else {
        cancelEdgeDwell(); // finger left all edge zones or exited container
      }

      if (edgeScrollActive && currentZone) {
        var newTx = txTarget;
        var newTy = tyTarget;
        var maxScrollPerEvent = 40;
        var depth;

        if (currentZone === 'left') {
          depth = Math.min(1, (safeLeft - touchX) / marginX);
          newTx = txTarget + depth * depth * maxScrollPerEvent;
        } else if (currentZone === 'right') {
          depth = Math.min(1, (touchX - safeRight) / marginX);
          newTx = txTarget - depth * depth * maxScrollPerEvent;
        } else if (currentZone === 'top') {
          depth = Math.min(1, (safeTop - touchY) / marginY);
          newTy = tyTarget + depth * depth * maxScrollPerEvent;
        } else if (currentZone === 'bottom') {
          depth = Math.min(1, (touchY - safeBottom) / marginY);
          newTy = tyTarget - depth * depth * maxScrollPerEvent;
        }

        var S = measurements.scale;
        txTarget = clamp(newTx, measurements.wrapperW * (1 - S), 0);
        tyTarget = clamp(newTy, measurements.wrapperH * (1 - S), 0);
      }
    }
  }, { passive: false });

  // touchend: finish drag; persist zoom if new-tile cells remain on the board.
  // Use setTimeout so touch-drag.js has a chance to place the tile in the DOM
  // before we check for .board-tile.new-tile elements.
  document.addEventListener('touchend', function (e) {
    if (!isMobile()) return;

    if (isDragging) {
      isDragging = false;
    }
    cancelEdgeDwell();
    dragStartPos = null;
    dragOrigin   = null;
    isPanning    = false;
    panStartX    = null;
    // Defer by one task so the tile-placement DOM update lands first.
    setTimeout(checkZoomPersistence, 0);
  }, { passive: true });

  // touchcancel: some browsers fire this immediately after a successful drop,
  // before touch-drag.js has placed the tile.  Use a short delay and defer to
  // checkZoomPersistence so we don't blindly zoom out when tiles are on the board.
  document.addEventListener('touchcancel', function () {
    if (!isMobile()) return;
    cancelEdgeDwell();
    dragStartPos = null;
    dragOrigin   = null;
    isDragging   = false;
    isPanning    = false;
    panStartX    = null;
    // Small delay so any synchronous tile placement that preceded the cancel
    // is reflected in the DOM before we decide whether to zoom out.
    setTimeout(function () {
      var newTiles = document.querySelectorAll('.board-tile.new-tile');
      if (newTiles.length === 0) {
        zoomOut(false); // instant — no tiles to show, reset immediately
      }
      // else: tiles still on board — keep zoom position
    }, 50);
  }, { passive: true });

  // resize / orientation-change: layout is stale — invalidate cache and reset.
  function onViewportChange() {
    measurements = null; // force re-measure on next zoom
    if (isZoomed) zoomOut(false);
    isDragging   = false;
    dragStartPos = null;
  }
  window.addEventListener('resize',            onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);

  // ---- checkZoomPersistence ----

  /**
   * Called at the end of every touchend and by external modules after tile
   * operations (place, cancel, submit, pass, exchange).
   *
   * If any .board-tile.new-tile elements remain on the board the zoom is kept
   * at its current position.  When all such tiles are gone, zooms out with a
   * smooth CSS transition.
   */
  function checkZoomPersistence() {
    if (!isMobile()) return;
    var newTiles = document.querySelectorAll('.board-tile.new-tile');
    if (newTiles.length === 0) {
      zoomOut(true);
    }
    // else: tiles still on board — keep current zoom position
  }

  // ---- Public API (optional external use) ----
  window.BoardZoom = { zoomToCell: zoomToCell, zoomOut: zoomOut, checkZoomPersistence: checkZoomPersistence };

})();
