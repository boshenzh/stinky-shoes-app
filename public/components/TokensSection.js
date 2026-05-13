// API Token management section, embedded inside the Account modal.
// One token per user. States: loading → (empty | has-token | create-form | reveal | revoke-confirm | rotate-confirm | needs-password | error).
import { listTokens, createToken, rotateToken, revokeToken } from '../services/api.js';
import { toast } from './Toast.js';

const NAME_MAXLEN = 64;

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function humanizeRelativeTime(iso) {
  if (!iso) return 'never used';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function createTokensSection({ container, auth, onNeedPassword }) {
  if (!container) {
    return { mount() {}, unmount() {}, refresh() {} };
  }

  // The component's local mutable state. `token` holds the freshly minted raw
  // value during the reveal screen; it's wiped as soon as the user dismisses it.
  let state = {
    view: 'loading',          // 'loading' | 'empty' | 'has-token' | 'create-form' | 'reveal' | 'revoke-confirm' | 'rotate-confirm' | 'needs-password' | 'error'
    activeToken: null,        // { id, name, token_prefix, last_used_at, created_at }
    rawToken: null,           // raw string, only set during 'reveal'
    error: null,              // string
    busy: false,
  };

  function setState(patch) {
    state = { ...state, ...patch };
    render();
  }

  // Re-read auth at each call — the user may have logged in / set a password since mount().
  function currentCreds() {
    const { username, password } = auth || {};
    return { username, password };
  }

  async function load() {
    const { username, password } = currentCreds();
    if (!username || !password) {
      setState({ view: 'needs-password', error: null });
      return;
    }
    setState({ view: 'loading', error: null });
    try {
      const rows = await listTokens({ username, password });
      const active = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      setState({ view: active ? 'has-token' : 'empty', activeToken: active });
    } catch (e) {
      if (e.status === 401 || e.code === 'User has no password set. Set a password via /api/auth/register first.') {
        setState({ view: 'needs-password' });
        return;
      }
      setState({ view: 'error', error: e.message });
    }
  }

  // --- handlers ---------------------------------------------------------

  function onCreateClick() {
    setState({ view: 'create-form', error: null });
  }
  function onRotateClick() {
    setState({ view: 'rotate-confirm', error: null });
  }
  function onRevokeClick() {
    setState({ view: 'revoke-confirm', error: null });
  }
  function onBack() {
    setState({ view: state.activeToken ? 'has-token' : 'empty', error: null, rawToken: null });
  }

  async function doCreate(name) {
    const creds = currentCreds();
    if (state.busy) return;
    setState({ busy: true, error: null });
    try {
      const minted = await createToken({ ...creds, name });
      setState({
        busy: false,
        view: 'reveal',
        rawToken: minted.token,
        activeToken: { id: minted.id, name: minted.name, token_prefix: minted.token_prefix, last_used_at: null, created_at: minted.created_at },
      });
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  }

  async function doRotate(name) {
    if (state.busy) return;
    setState({ busy: true, error: null });
    try {
      const minted = await rotateToken({ ...currentCreds(), name });
      setState({
        busy: false,
        view: 'reveal',
        rawToken: minted.token,
        activeToken: { id: minted.id, name: minted.name, token_prefix: minted.token_prefix, last_used_at: null, created_at: minted.created_at },
      });
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  }

  async function doRevoke() {
    if (state.busy || !state.activeToken) return;
    setState({ busy: true, error: null });
    try {
      await revokeToken(state.activeToken.id, currentCreds());
      setState({ busy: false, view: 'empty', activeToken: null, rawToken: null });
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  }

  // --- views ------------------------------------------------------------

  function viewLoading() {
    return `<div class="text-center text-xs text-gray-500 py-2">Loading…</div>`;
  }

  function viewNeedsPassword() {
    return `
      <div class="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-800 leading-snug">
        Set a password on your account first — API tokens need it.
      </div>
      <button data-act="need-password" class="mt-2 w-full px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm active:scale-95 touch-manipulation">
        Set / reset password
      </button>
    `;
  }

  function viewError() {
    return `
      <div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 leading-snug">${escapeHtml(state.error || 'Something went wrong')}</div>
      <button data-act="reload" class="mt-2 w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-xs sm:text-sm rounded-lg">Try again</button>
    `;
  }

  function viewEmpty() {
    return `
      <div class="text-xs sm:text-sm text-gray-600 leading-snug mb-2">
        Use one API token to let a script or AI agent vote as you. Treat it like a password.
      </div>
      <button data-act="create-open" class="w-full px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm active:scale-95 touch-manipulation">
        + Create API token
      </button>
    `;
  }

  function viewHasToken() {
    const t = state.activeToken;
    return `
      <div class="px-2.5 sm:px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 space-y-0.5">
        <div class="flex items-baseline gap-2">
          <span class="text-xs text-gray-500 w-12 shrink-0">Name</span>
          <span class="text-xs sm:text-sm font-medium text-gray-800 truncate">${escapeHtml(t.name)}</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-xs text-gray-500 w-12 shrink-0">Prefix</span>
          <code class="text-xs font-mono text-gray-700 truncate">${escapeHtml(t.token_prefix)}…</code>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-xs text-gray-500 w-12 shrink-0">Used</span>
          <span class="text-xs text-gray-600">${escapeHtml(humanizeRelativeTime(t.last_used_at))}</span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 mt-2">
        <button data-act="rotate-open" class="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs sm:text-sm font-semibold rounded-lg active:scale-95 touch-manipulation">Rotate</button>
        <button data-act="revoke-open" class="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-800 text-xs sm:text-sm font-semibold rounded-lg active:scale-95 touch-manipulation">Revoke</button>
      </div>
    `;
  }

  function viewCreateForm({ rotating }) {
    const heading = rotating ? 'Rotate token' : 'Create token';
    const warn = rotating
      ? 'Replacing the current token. Scripts using the old one will stop working immediately.'
      : 'This token will be able to vote as you. You will see it ONCE.';
    const defaultName = rotating ? (state.activeToken?.name || '') : '';
    const errBlock = state.error
      ? `<div class="px-2 py-1 mt-1.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">${escapeHtml(state.error)}</div>`
      : '';
    return `
      <div class="text-xs sm:text-sm font-semibold text-gray-700 mb-1.5">${heading}</div>
      <label class="block text-xs text-gray-500 mb-1">Name (e.g. "my laptop", "claude-mcp")</label>
      <input data-role="name" type="text" maxlength="${NAME_MAXLEN}" value="${escapeHtml(defaultName)}"
             class="w-full h-9 sm:h-10 border-2 border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
      <div class="px-2.5 py-1.5 mt-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-snug">⚠ ${warn}</div>
      ${errBlock}
      <div class="grid grid-cols-2 gap-2 mt-2">
        <button data-act="cancel" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-xs sm:text-sm font-semibold rounded-lg active:scale-95 touch-manipulation">Cancel</button>
        <button data-act="${rotating ? 'do-rotate' : 'do-create'}" class="px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xs sm:text-sm font-semibold rounded-lg active:scale-95 touch-manipulation ${state.busy ? 'opacity-50 cursor-not-allowed' : ''}" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Working…' : (rotating ? 'Rotate' : 'Create')}
        </button>
      </div>
    `;
  }

  function viewReveal() {
    return `
      <div class="px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs sm:text-sm text-green-800">✅ Token created.</div>
      <div class="mt-2 flex items-stretch gap-2">
        <code data-role="raw" class="flex-1 min-w-0 px-2.5 py-2 font-mono text-xs sm:text-sm bg-gray-50 border border-gray-300 rounded-lg select-all break-all">${escapeHtml(state.rawToken || '')}</code>
        <button data-act="copy" class="px-3 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg shrink-0 active:scale-95 touch-manipulation">Copy</button>
      </div>
      <div class="mt-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-snug">
        Copy it now — this is the only time it will be shown.
      </div>
      <button data-act="done-reveal" class="mt-2 w-full px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white text-xs sm:text-sm font-semibold rounded-lg active:scale-95 touch-manipulation">
        I've saved it
      </button>
    `;
  }

  function viewRevokeConfirm() {
    const errBlock = state.error
      ? `<div class="px-2 py-1 mt-1.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">${escapeHtml(state.error)}</div>`
      : '';
    return `
      <div class="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 leading-snug">
        Revoke "${escapeHtml(state.activeToken?.name || 'token')}"? Scripts using it will stop working immediately.
      </div>
      ${errBlock}
      <div class="grid grid-cols-2 gap-2 mt-2">
        <button data-act="cancel" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-xs sm:text-sm font-semibold rounded-lg active:scale-95 touch-manipulation">Cancel</button>
        <button data-act="do-revoke" class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold rounded-lg active:scale-95 touch-manipulation ${state.busy ? 'opacity-50 cursor-not-allowed' : ''}" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Revoking…' : 'Revoke'}
        </button>
      </div>
    `;
  }

  // --- render -----------------------------------------------------------

  function render() {
    let html;
    switch (state.view) {
      case 'loading':           html = viewLoading(); break;
      case 'needs-password':    html = viewNeedsPassword(); break;
      case 'error':             html = viewError(); break;
      case 'empty':             html = viewEmpty(); break;
      case 'has-token':         html = viewHasToken(); break;
      case 'create-form':       html = viewCreateForm({ rotating: false }); break;
      case 'rotate-confirm':    html = viewCreateForm({ rotating: true }); break;
      case 'reveal':            html = viewReveal(); break;
      case 'revoke-confirm':    html = viewRevokeConfirm(); break;
      default:                  html = viewLoading();
    }
    container.innerHTML = html;
    wireActions();
  }

  function wireActions() {
    container.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.getAttribute('data-act');
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        switch (act) {
          case 'create-open':   return onCreateClick();
          case 'rotate-open':   return onRotateClick();
          case 'revoke-open':   return onRevokeClick();
          case 'cancel':        return onBack();
          case 'reload':        return load();
          case 'need-password': return onNeedPassword?.();
          case 'do-create': {
            const name = container.querySelector('[data-role="name"]')?.value?.trim() || '';
            if (!name) return setState({ error: 'Name is required.' });
            return doCreate(name);
          }
          case 'do-rotate': {
            const name = container.querySelector('[data-role="name"]')?.value?.trim() || '';
            return doRotate(name);
          }
          case 'do-revoke':     return doRevoke();
          case 'copy': {
            const raw = container.querySelector('[data-role="raw"]')?.textContent || '';
            try {
              await navigator.clipboard.writeText(raw);
              toast.success('Token copied to clipboard');
            } catch {
              toast.warning('Copy failed — select the token and copy manually');
            }
            return;
          }
          case 'done-reveal':
            return setState({ rawToken: null, view: state.activeToken ? 'has-token' : 'empty' });
        }
      });
    });
  }

  return {
    mount() {
      load();
    },
    unmount() {
      // Drop the in-memory raw token, if any, when the modal closes.
      state = { view: 'loading', activeToken: null, rawToken: null, error: null, busy: false };
      container.innerHTML = '';
    },
    refresh: load,
  };
}
