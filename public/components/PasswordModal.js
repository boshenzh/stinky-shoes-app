// Password modal component for registration/login
import { register, login, checkUser } from '../services/api.js';
import { useAuth } from '../store/index.js';

export function initPasswordModal() {
  const modal = document.getElementById('passwordModal');
  const closeBtn = document.getElementById('passwordModalClose');
  const form = document.getElementById('passwordForm');
  const usernameInput = document.getElementById('passwordUsername');
  const passwordInput = document.getElementById('passwordPassword');
  const submitBtn = document.getElementById('passwordSubmit');
  const statusEl = document.getElementById('passwordStatus');
  const titleEl = document.getElementById('passwordModalTitle');
  
  let isRegisterMode = false;
  let onSuccessCallback = null;
  let onLoginSuccessCallback = null;

  // Set global login success callback (called after any successful login/register)
  function onLoginSuccess(callback) {
    onLoginSuccessCallback = callback;
  }

  function show(mode = 'register', username = null, onSuccess = null) {
    isRegisterMode = mode === 'register';
    onSuccessCallback = onSuccess;
    
    if (titleEl) {
      titleEl.textContent = isRegisterMode ? 'Register / Set Password' : 'Login';
    }
    
    if (usernameInput) {
      const auth = useAuth();
      usernameInput.value = username || auth.username || '';
      usernameInput.disabled = !!username;
    }
    
    if (passwordInput) {
      passwordInput.value = '';
    }
    
    const submitTextEl = document.getElementById('passwordSubmitText');
    if (submitTextEl) {
      submitTextEl.textContent = isRegisterMode ? 'Register' : 'Login';
    } else if (submitBtn) {
      submitBtn.textContent = isRegisterMode ? 'Register' : 'Login';
    }
    
    if (statusEl) {
      statusEl.textContent = '';
    }
    
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function close() {
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium';
    }
    // Reset form validation states
    if (usernameInput) {
      usernameInput.classList.remove('border-red-500');
    }
    if (passwordInput) {
      passwordInput.classList.remove('border-red-500');
    }
    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    const username = usernameInput?.value.trim();
    const password = passwordInput?.value;
    
    // Clear previous status
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium';
    }
    
    // Validate username
    if (!username || !isValidUsername(username)) {
      if (statusEl) {
        statusEl.textContent = '⚠️ Invalid username. Must be 3-20 characters (letters, numbers, underscores, or hyphens)';
        statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-red-600';
      }
      if (usernameInput) {
        usernameInput.focus();
        usernameInput.classList.add('border-red-500');
        setTimeout(() => usernameInput?.classList.remove('border-red-500'), 3000);
      }
      return;
    }
    
    // Validate password if provided
    if (password && password.length > 0 && password.length < 6) {
      if (statusEl) {
        statusEl.textContent = '⚠️ Password must be at least 6 characters';
        statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-red-600';
      }
      if (passwordInput) {
        passwordInput.focus();
        passwordInput.classList.add('border-red-500');
        setTimeout(() => passwordInput?.classList.remove('border-red-500'), 3000);
      }
      return;
    }
    
    // Disable submit button
    if (submitBtn) {
      submitBtn.disabled = true;
      const submitTextEl = document.getElementById('passwordSubmitText');
      if (submitTextEl) {
        submitTextEl.textContent = '...';
      } else {
        submitBtn.textContent = '...';
      }
    }
    
    // Register without password
    if (isRegisterMode && (!password || password.length === 0)) {
      try {
        // First check if user already exists and has a password
        const check = await checkUser(username);
        if (check.exists && check.has_password) {
          if (statusEl) {
            statusEl.textContent = '⚠️ User already exists with a password. Please login or provide the password.';
            statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-red-600';
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            const submitTextEl = document.getElementById('passwordSubmitText');
            if (submitTextEl) {
              submitTextEl.textContent = 'Register';
            } else {
              submitBtn.textContent = 'Register';
            }
          }
          return;
        }
        
        // User doesn't exist or doesn't have password - proceed with registration
        const result = await register(username, null);
        const auth = useAuth();
        if (result.user_id) {
          auth.login(result.user_id, username, null);
        }
        if (statusEl) {
          statusEl.textContent = '✅ Username registered! Password is optional.';
          statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-green-600';
        }
        setTimeout(() => {
          close();
          if (onLoginSuccessCallback) onLoginSuccessCallback();
          if (onSuccessCallback) {
            onSuccessCallback(username, null);
          }
        }, 1000);
        return;
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `❌ ${err.message || 'Registration failed'}`;
          statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-red-600';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          const submitTextEl = document.getElementById('passwordSubmitText');
          if (submitTextEl) {
            submitTextEl.textContent = 'Register';
          } else {
            submitBtn.textContent = 'Register';
          }
        }
        return;
      }
    }
    
    // Login without password (if user has no password set)
    if (!isRegisterMode && (!password || password.length === 0)) {
      try {
        const check = await checkUser(username);
        if (check.exists && check.has_password) {
          if (statusEl) {
            statusEl.textContent = '⚠️ Password is required for this account';
            statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-red-600';
          }
          if (passwordInput) passwordInput.focus();
          if (submitBtn) {
            submitBtn.disabled = false;
            const submitTextEl = document.getElementById('passwordSubmitText');
            if (submitTextEl) {
              submitTextEl.textContent = 'Login';
            } else {
              submitBtn.textContent = 'Login';
            }
          }
          return;
        }
        const auth = useAuth();
        if (check.user_id) {
          auth.login(check.user_id, username, null);
        }
        if (statusEl) {
          statusEl.textContent = '✅ Logged in (no password set)';
          statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-green-600';
        }
        setTimeout(() => {
          close();
          if (onLoginSuccessCallback) onLoginSuccessCallback();
          if (onSuccessCallback) {
            onSuccessCallback(username, null);
          }
        }, 1000);
        return;
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `❌ ${err.message || 'Login failed'}`;
          statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-red-600';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          const submitTextEl = document.getElementById('passwordSubmitText');
          if (submitTextEl) {
            submitTextEl.textContent = 'Login';
          } else {
            submitBtn.textContent = 'Login';
          }
        }
        return;
      }
    }
    
    // Disable submit button for password register/login
    if (submitBtn) {
      submitBtn.disabled = true;
      const submitTextEl = document.getElementById('passwordSubmitText');
      if (submitTextEl) {
        submitTextEl.textContent = '...';
      } else {
        submitBtn.textContent = '...';
      }
    }
    
    // Handle register/login with password
    try {
      let result;
      if (isRegisterMode) {
        result = await register(username, password);
      } else {
        result = await login(username, password);
      }
      
      const auth = useAuth();
      if (result.user_id) {
        auth.login(result.user_id, username, password);
      } else {
        // Still update password even if no user_id (shouldn't happen but handle gracefully)
        auth.setPassword(password);
      }
      
      if (statusEl) {
        statusEl.textContent = `✅ ${result.message || 'Success!'}`;
        statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-green-600';
      }
      
      setTimeout(() => {
        close();
        if (onLoginSuccessCallback) onLoginSuccessCallback();
        if (onSuccessCallback) {
          onSuccessCallback(username, password);
        }
      }, 1000);
      
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `❌ ${err.message || 'Failed'}`;
        statusEl.className = 'text-xs sm:text-sm text-center min-h-[1.5rem] font-medium text-red-600';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        const submitTextEl = document.getElementById('passwordSubmitText');
        if (submitTextEl) {
          submitTextEl.textContent = isRegisterMode ? 'Register' : 'Login';
        } else {
          submitBtn.textContent = isRegisterMode ? 'Register' : 'Login';
        }
      }
    }
  }

  closeBtn?.addEventListener('click', close);
  form?.addEventListener('submit', handleSubmit);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      close();
    }
  });

  return { show, close, onLoginSuccess };
}

function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

