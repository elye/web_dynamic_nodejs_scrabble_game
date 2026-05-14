// ============================================
// Auth - Logto login/logout state
// ============================================

let _authResolve;
window._authReady = new Promise(resolve => { _authResolve = resolve; });

(async function initAuth() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) { _authResolve(); return; }
    const { isAuthenticated, user } = await res.json();

    if (isAuthenticated && user) {
      const displayName = user.name || user.email || user.sub || 'Player';

      // Show signed-in row, hide the username input row
      document.getElementById('username-row').classList.add('hidden');
      const signedInRow = document.getElementById('auth-signed-in-row');
      signedInRow.classList.remove('hidden');
      document.getElementById('auth-username-display').textContent = displayName;

      // Store userId for WebSocket JOIN_LOBBY message
      window._logtoUserId = user.sub || null;
      // Show stats button for signed-in users
      const statsBtn = document.getElementById('stats-btn');
      if (statsBtn) statsBtn.classList.remove('hidden');
      // Keep username input populated for the WebSocket JOIN_LOBBY message
      const usernameInput = document.getElementById('username-input');
      if (usernameInput) {
        usernameInput.value = displayName.slice(0, 20);
      }

      // If WS already connected (e.g. reconnect), send userId update
      if (window.ws && window.ws.readyState === WebSocket.OPEN && window._logtoUserId) {
        window.ws.send(JSON.stringify({ type: 'UPDATE_USER_ID', userId: window._logtoUserId }));
      }
    }
    // If not signed in: the default username row (input + sign-in button) is already visible
  } catch (_) {
    // Auth endpoint unreachable — fail silently, game still works without auth
  }
  _authResolve();
})();
