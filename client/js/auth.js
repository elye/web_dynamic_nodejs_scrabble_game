// ============================================
// Auth - Logto login/logout state
// ============================================

(async function initAuth() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) return;
    const { isAuthenticated, user } = await res.json();

    const authBar = document.getElementById('auth-bar');
    const signedIn = document.getElementById('auth-signed-in');
    const signedOut = document.getElementById('auth-signed-out');

    authBar.classList.remove('hidden');

    if (isAuthenticated && user) {
      const displayName = user.name || user.email || user.sub || 'Player';
      document.getElementById('auth-username-display').textContent = displayName;
      signedIn.classList.remove('hidden');

      // Pre-fill the username input with the Logto display name
      const usernameInput = document.getElementById('username-input');
      if (usernameInput && !usernameInput.value) {
        usernameInput.value = displayName.slice(0, 20);
      }
    } else {
      signedOut.classList.remove('hidden');
    }
  } catch (_) {
    // Auth endpoint unreachable — fail silently, game still works without auth
  }
})();
