// ============================================
// Board Pan — Mouse drag-to-scroll for constrained board
//
// When the board overflows its container (doesn't fit at full size),
// this module enables panning via click-and-drag on desktop.
// Touch panning works natively via overflow:auto on the scroll container.
//
// In portrait orientation the scroll container is .game-layout (the
// board is full-width and the entire layout scrolls), whereas in
// landscape it is .board-container (the board overflows internally).
//
// Adds .board-pannable class when the board overflows (enables grab cursor).
// Adds .board-pan-active class during a drag (enables grabbing cursor).
// Suppresses click events after a pan gesture to avoid accidental cell clicks.
// ============================================

(function BoardPan() {
  'use strict';

  var PAN_THRESHOLD = 5; // px movement before pan commits

  var boardArea = null;     // element that receives mousedown (.board-container)
  var scrollTarget = null;  // element that actually scrolls
  var pendingPan = null;
  var isPanning = false;
  var didPan = false;

  function isPortrait() {
    return window.matchMedia('(orientation: portrait)').matches;
  }

  function init() {
    boardArea = document.querySelector('.board-container');
    if (!boardArea) return;

    updateScrollTarget();
    checkPannable();

    window.addEventListener('resize', function () {
      updateScrollTarget();
      checkPannable();
    });

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        updateScrollTarget();
        checkPannable();
      });
      ro.observe(boardArea);
    }

    boardArea.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Suppress click after pan to avoid accidental cell clicks
    boardArea.addEventListener('click', function (e) {
      if (didPan) {
        e.stopPropagation();
        e.preventDefault();
        didPan = false;
      }
    }, true); // capture phase
  }

  function updateScrollTarget() {
    if (isPortrait()) {
      scrollTarget = document.querySelector('.game-layout');
    } else {
      scrollTarget = boardArea;
    }
  }

  function checkPannable() {
    if (!scrollTarget || !boardArea) return;
    var pannable = scrollTarget.scrollHeight > scrollTarget.clientHeight + 2 ||
                   scrollTarget.scrollWidth > scrollTarget.clientWidth + 2;
    boardArea.classList.toggle('board-pannable', pannable);
  }

  function onMouseDown(e) {
    if (!scrollTarget) return;
    // Don't initiate pan from committed tiles or interactive elements
    if (e.target.closest('.board-tile:not(.new-tile)')) return;
    if (e.button !== 0) return;

    // Only pan when the scroll target actually overflows
    if (scrollTarget.scrollHeight <= scrollTarget.clientHeight + 2 &&
        scrollTarget.scrollWidth <= scrollTarget.clientWidth + 2) return;

    pendingPan = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: scrollTarget.scrollLeft,
      scrollTop: scrollTarget.scrollTop,
    };
    didPan = false;
  }

  function onMouseMove(e) {
    if (!pendingPan) return;

    var dx = e.clientX - pendingPan.startX;
    var dy = e.clientY - pendingPan.startY;

    if (!isPanning) {
      if (Math.sqrt(dx * dx + dy * dy) < PAN_THRESHOLD) return;
      isPanning = true;
      didPan = true;
      boardArea.classList.add('board-pan-active');
    }

    scrollTarget.scrollLeft = pendingPan.scrollLeft - dx;
    scrollTarget.scrollTop = pendingPan.scrollTop - dy;
  }

  function onMouseUp() {
    pendingPan = null;
    if (isPanning) {
      isPanning = false;
      boardArea.classList.remove('board-pan-active');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  window.BoardPan = { checkPannable: function () { updateScrollTarget(); checkPannable(); } };
})();
