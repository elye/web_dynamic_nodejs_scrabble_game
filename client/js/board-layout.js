// ============================================
// Board Layout — Adaptive board sizing for landscape/square screens
//
// On landscape/square viewports (width >= height):
//   • Always fits the entire board on screen (no overflow)
//   • Board fills min(availW, availH) so it's fully visible
//   • When cells are very small (< 30% of rack tile), enables the
//     auto-zoom/pan mechanism (board-zoom-enabled class)
//   • Sets --cell-size CSS variable for proportional font scaling
// ============================================

(function BoardLayoutModule() {
  'use strict';

  // Row-header width (22px) + grid border (4px) + 14 gaps (28px) = 54px overhead
  var WRAPPER_OVERHEAD = 54;
  // Col-header height (~18px) + margin (2px)
  var COL_HEADER_OVERHEAD = 20;
  // Zoom threshold: enable zoom when cell < 30% of rack tile
  var ZOOM_RATIO = 0.3;

  function shouldApplyLayout() {
    return window.innerWidth >= window.innerHeight;
  }

  /** Measure the rendered rack tile width. Falls back to 48. */
  function getRackTileSize() {
    var el = document.querySelector('.rack-tile, .rack-slot-empty');
    if (el) {
      var w = el.getBoundingClientRect().width;
      if (w > 0) return w;
    }
    return 48;
  }

  /** Measure --board-cell-size from actual grid, for proportional fonts. */
  function updateCellSizeVar() {
    var grid = document.getElementById('board-grid');
    if (!grid) return;
    var gridW = grid.clientWidth;
    if (gridW > 0) {
      // grid border = 4px, 14 gaps × 2px = 28px
      var cellSize = (gridW - 4 - 28) / 15;
      if (cellSize > 0) {
        document.documentElement.style.setProperty('--board-cell-size', cellSize + 'px');
      }
    }
  }

  function layout() {
    var wrapper = document.querySelector('.board-wrapper');
    if (!wrapper) return;

    // Only apply in landscape/square viewports
    if (!shouldApplyLayout()) {
      wrapper.style.width = '';
      wrapper.style.maxWidth = '';
      wrapper.classList.remove('board-zoom-enabled');
      // Still update cell size variable for proportional fonts
      updateCellSizeVar();
      if (window.BoardPan) window.BoardPan.checkPannable();
      return;
    }

    var container = document.querySelector('.board-container');
    if (!container) return;

    // Reset inline sizing so we get the container's flex-allocated dimensions
    wrapper.style.width = '';
    wrapper.style.maxWidth = '';
    // Force reflow so clientWidth/Height are fresh
    void container.offsetHeight;

    var W = container.clientWidth;
    var H = container.clientHeight;
    if (W <= 0 || H <= 0) return;

    var rackTileSize = getRackTileSize();

    // The wrapper is taller than wide because of col headers.
    // To fit the wrapper fully: wrapper_width = board_size,
    // wrapper_height ≈ board_size - row_headers + col_headers = board_size - 2.
    // But to be safe, account for col-header overhead:
    // max wrapper width such that height fits = H - COL_HEADER_OVERHEAD + row_headers
    // grid_height = wrapper_width - 22; wrapper_height = grid_height + COL_HEADER_OVERHEAD
    // wrapper_height <= H  →  wrapper_width - 22 + COL_HEADER_OVERHEAD <= H
    //                      →  wrapper_width <= H + 22 - COL_HEADER_OVERHEAD = H + 2
    var maxByHeight = H + 22 - COL_HEADER_OVERHEAD;
    var boardSize = Math.min(W, maxByHeight);

    wrapper.style.width = boardSize + 'px';
    wrapper.style.maxWidth = boardSize + 'px';

    // Compute the actual cell size and expose as CSS variable
    var cellSize = (boardSize - WRAPPER_OVERHEAD) / 15;
    if (cellSize > 0) {
      document.documentElement.style.setProperty('--board-cell-size', cellSize + 'px');
    }

    // Enable zoom when cells are significantly smaller than rack tiles
    var enableZoom = cellSize < rackTileSize * ZOOM_RATIO;
    wrapper.classList.toggle('board-zoom-enabled', enableZoom);

    if (window.BoardPan) {
      setTimeout(function () { window.BoardPan.checkPannable(); }, 50);
    }
  }

  // Debounced resize handler
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 100);
  });

  // Re-layout when the game screen becomes visible
  function initObserver() {
    var gs = document.getElementById('game-screen');
    if (!gs) return;
    var observer = new MutationObserver(function () {
      if (gs.classList.contains('active')) {
        setTimeout(layout, 50);
      }
    });
    observer.observe(gs, { attributes: true, attributeFilter: ['class'] });
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initObserver();
      setTimeout(layout, 100);
    });
  } else {
    initObserver();
    setTimeout(layout, 100);
  }

  window.BoardLayout = { layout: layout };
})();
