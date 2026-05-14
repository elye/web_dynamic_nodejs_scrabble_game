// ============================================
// Auth - Logto login/logout state
// ============================================

let _authResolve;
window._authReady = new Promise(resolve => { _authResolve = resolve; });

function showSignedIn(displayName) {
  document.getElementById('username-row').classList.add('hidden');
  const signedInRow = document.getElementById('auth-signed-in-row');
  signedInRow.classList.remove('hidden');
  document.getElementById('auth-username-display').textContent = displayName;

  const statsBtn = document.getElementById('stats-btn');
  if (statsBtn) statsBtn.classList.remove('hidden');
  const usernameInput = document.getElementById('username-input');
  if (usernameInput) {
    usernameInput.value = displayName.slice(0, 20);
  }
}

function showSignedOut() {
  document.getElementById('username-row').classList.remove('hidden');
}

(async function initAuth() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) { showSignedOut(); _authResolve(); return; }
    const { isAuthenticated, user } = await res.json();

    if (isAuthenticated && user) {
      const displayName = user.name || user.email || user.sub || 'Player';
      showSignedIn(displayName);

      window._logtoUserId = user.sub || null;
      localStorage.setItem('scrabble_was_signed_in', '1');

      // If WS already connected (e.g. reconnect), send userId update
      if (window.ws && window.ws.readyState === WebSocket.OPEN && window._logtoUserId) {
        window.ws.send(JSON.stringify({ type: 'UPDATE_USER_ID', userId: window._logtoUserId }));
      }
    } else {
      // Not authenticated on server — check if user was previously signed in
      if (localStorage.getItem('scrabble_was_signed_in') === '1') {
        // Show loading overlay and auto re-authenticate
        localStorage.removeItem('scrabble_was_signed_in');
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.style.display = 'flex';
        window.location.href = '/sign-in';
        return; // page will navigate away
      }
      showSignedOut();
    }
  } catch (_) {
    showSignedOut();
  }
  _authResolve();
})();

// Clear the "was signed in" flag when user explicitly signs out
document.addEventListener('DOMContentLoaded', () => {
  const signOutBtn = document.querySelector('.auth-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      localStorage.removeItem('scrabble_was_signed_in');
    });
  }
});
