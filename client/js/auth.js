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
  if (typeof updateFormalButtonAccess === 'function') updateFormalButtonAccess();
  if (typeof updateHintAccess === 'function') updateHintAccess();
  if (typeof updateTimeButtonAccess === 'function') updateTimeButtonAccess();
}

function showSignedOut() {
  document.getElementById('username-row').classList.remove('hidden');
  if (typeof updateFormalButtonAccess === 'function') updateFormalButtonAccess();
  if (typeof updateHintAccess === 'function') updateHintAccess();
  if (typeof updateTimeButtonAccess === 'function') updateTimeButtonAccess();
}

// Derive a suggested display name from Logto user data
function deriveSuggestedName(userData) {
  if (!userData) return '';
  const raw = userData.name || userData.username ||
    (userData.email ? userData.email.split('@')[0] : '');
  if (!raw) return '';
  // Keep only letters, numbers, spaces, hyphens, underscores; trim to 20 chars
  return raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 20);
}

// Show username setup modal for first-time logged-in users
async function showUsernameSetup(userData) {
  const modal = document.getElementById('username-setup-modal');
  const input = document.getElementById('username-setup-input');
  const btn = document.getElementById('username-setup-btn');
  const statusEl = document.getElementById('username-setup-status');
  const errorEl = document.getElementById('username-setup-error');

  modal.classList.remove('hidden');
  input.value = '';
  btn.disabled = true;
  statusEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  // Pre-populate with a suggested name from user data
  const suggested = deriveSuggestedName(userData);
  if (suggested && suggested.length >= 2) {
    try {
      const res = await fetch(`/api/profile/check-name?name=${encodeURIComponent(suggested)}`);
      const data = await res.json();
      if (data.available) {
        input.value = suggested;
      } else {
        const suffix = Math.floor(100 + Math.random() * 9000);
        input.value = (suggested + suffix).slice(0, 20);
      }
    } catch {
      input.value = suggested;
    }
    // Trigger the input event so availability check runs on the pre-filled value
    input.dispatchEvent(new Event('input'));
  }

  let checkTimeout = null;

  input.addEventListener('input', () => {
    const name = input.value.trim();
    clearTimeout(checkTimeout);
    btn.disabled = true;
    errorEl.classList.add('hidden');

    if (name.length < 2) {
      statusEl.textContent = '';
      statusEl.classList.add('hidden');
      return;
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
      statusEl.textContent = 'Only letters, numbers, spaces, hyphens, underscores';
      statusEl.style.color = 'var(--accent-danger)';
      statusEl.classList.remove('hidden');
      return;
    }

    statusEl.textContent = 'Checking...';
    statusEl.style.color = 'var(--text-secondary)';
    statusEl.classList.remove('hidden');

    checkTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/check-name?name=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (data.available) {
          statusEl.textContent = '✓ Available';
          statusEl.style.color = 'var(--accent-success, #4caf50)';
          btn.disabled = false;
        } else {
          statusEl.textContent = data.error || '✗ Already taken';
          statusEl.style.color = 'var(--accent-danger)';
          btn.disabled = true;
        }
      } catch {
        statusEl.textContent = 'Could not check availability';
        statusEl.style.color = 'var(--accent-danger)';
      }
      statusEl.classList.remove('hidden');
    }, 400);
  });

  return new Promise((resolve) => {
    btn.addEventListener('click', async () => {
      const name = input.value.trim();
      btn.disabled = true;
      btn.textContent = 'Saving...';
      errorEl.classList.add('hidden');

      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name }),
        });
        const data = await res.json();
        if (!res.ok) {
          errorEl.textContent = data.error || 'Failed to set username';
          errorEl.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Set Username';
          return;
        }
        modal.classList.add('hidden');
        resolve(name);
      } catch {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Set Username';
      }
    });
  });
}

(async function initAuth() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) { showSignedOut(); _authResolve(); return; }
    const { isAuthenticated, user, profile } = await res.json();

    if (isAuthenticated && user) {
      window._logtoUserId = user.sub || null;
      localStorage.setItem('scrabble_was_signed_in', '1');

      let displayName;
      if (profile && profile.displayName) {
        // User has a stored display name
        displayName = profile.displayName;
      } else {
        // First-time login — prompt user to choose a username
        displayName = await showUsernameSetup(user);
      }

      showSignedIn(displayName);

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
