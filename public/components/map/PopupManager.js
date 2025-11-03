// Popup manager module - handles gym popup creation and management
import { useAppStore } from '../../store/index.js';
import { fetchGymById } from '../../services/api.js';
import { MAP_CONFIG } from '../../lib/constants.js';
import { useAuth } from '../../store/index.js';
import { toast } from '../Toast.js';
import { createPopupContent } from './PopupContent.js';

// Helper function to convert HTTP URLs to HTTPS
function ensureHttps(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/^http:\/\//, 'https://');
}

// Helper functions
function normalizeGymData(gymFeature) {
  const imageUrl = gymFeature.properties.image_primary_url || gymFeature.properties.image;
  return {
    id: gymFeature.properties.id,
    name: gymFeature.properties.name,
    address: gymFeature.properties.address,
    city: gymFeature.properties.city,
    country_code: gymFeature.properties.country_code,
    tel: gymFeature.properties.tel,
    image: ensureHttps(imageUrl),
    smell_avg: gymFeature.properties.smell_avg,
    smell_votes: gymFeature.properties.smell_votes,
    difficulty_avg: gymFeature.properties.difficulty_avg,
    difficulty_votes: gymFeature.properties.difficulty_votes || 0,
    parking_availability_avg: gymFeature.properties.parking_availability_avg,
    parking_votes: gymFeature.properties.parking_votes,
    pet_friendly_avg: gymFeature.properties.pet_friendly_avg,
    pet_friendly_votes: gymFeature.properties.pet_friendly_votes,
    styles: gymFeature.properties.styles,
    style_vote_count: gymFeature.properties.style_vote_count || 0,
    utilities: gymFeature.properties.utilities || {},
    lng: gymFeature.geometry.coordinates[0],
    lat: gymFeature.geometry.coordinates[1],
  };
}

export function createPopupManager(map, passwordModal = null) {
  let votePanel = null;
  let gymPopup = null;
  let currentGymId = null;
  let pendingGymId = null; // Track which gym is currently being fetched
  let pendingGymForVote = null; // Store gym to vote on after login
  
  function setVotePanel(panel) {
    votePanel = panel;
  }
  
  function setPasswordModal(modal) {
    passwordModal = modal;
  }
  
  function attachVoteButtonHandler(gym) {
    const voteBtn = gymPopup?.getElement()?.querySelector('.gym-popup-vote-btn');
    if (!voteBtn) return;
    
    // Clone and replace to ensure clean event handler
    const newVoteBtn = voteBtn.cloneNode(true);
    voteBtn.parentNode.replaceChild(newVoteBtn, voteBtn);
    newVoteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Check if user is logged in (has user_id)
      const auth = useAuth();
      
      if (!auth.isLoggedIn) {
        // User not logged in - show login modal first
        pendingGymForVote = gym; // Store gym to vote on after login
        if (passwordModal && passwordModal.show) {
          // Set up one-time callback to show vote panel after login
          const showVoteAfterLogin = () => {
            if (pendingGymForVote && votePanel) {
              // Small delay to ensure login state is updated
              setTimeout(() => {
                votePanel.showVotePanel(pendingGymForVote);
                pendingGymForVote = null;
              }, 200);
            }
          };
          
          // Register callback for this login session only
          if (passwordModal.onLoginSuccess) {
            const originalCallback = passwordModal.onLoginSuccess;
            // Temporarily override callback
            passwordModal.onLoginSuccess(showVoteAfterLogin);
          }
          
          passwordModal.show('register');
        } else {
          toast.warning('Please log in to vote');
        }
      } else {
        // User is logged in - show vote panel directly
        if (votePanel) {
          votePanel.showVotePanel(gym);
        }
      }
    });
  }

async function refreshPopupForGym(gymId) {
    const gymIdStr = String(gymId);
    const currentGymIdStr = currentGymId ? String(currentGymId) : null;
    
    if (!gymPopup || currentGymIdStr !== gymIdStr) {
      return;
    }
    
    try {
      const gymFeature = await fetchGymById(gymId);
      if (!gymFeature) {
        console.error('Failed to fetch gym data for refresh');
        return;
      }
      
      // Check if popup is still showing the same gym (avoid race condition)
      if (currentGymIdStr !== String(currentGymId)) {
        return;
      }
      
      const gym = normalizeGymData(gymFeature);
      const popupContent = createPopupContent(gym);
      gymPopup.setHTML(popupContent);
      attachVoteButtonHandler(gym);
    } catch (err) {
      console.error('Failed to refresh popup:', err);
    }
  }

  async function showGymPopup(gymId, lngLat) {
    // Store the gym ID we're about to fetch
    const requestedGymId = String(gymId);
    currentGymId = gymId;
    pendingGymId = requestedGymId;

    // Close existing popup immediately
    if (gymPopup) {
      gymPopup.remove();
      gymPopup = null;
    }

    // Center map on gym location
    const isMobile = window.innerWidth < 640;
    const currentZoom = map.getZoom();
    const targetZoom = Math.max(
      currentZoom, 
      isMobile ? MAP_CONFIG.POPUP_ZOOM_MOBILE : MAP_CONFIG.POPUP_ZOOM
    );
    
    const padding = isMobile 
      ? { top: 100, bottom: 100, left: 20, right: 20 } 
      : { top: 50, bottom: 50, left: 50, right: 50 };
    
    map.easeTo({
      center: lngLat,
      zoom: targetZoom,
      padding: padding,
      duration: 500,
      essential: true
    });

    // Show loading popup
    gymPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: isMobile ? 'calc(100vw - 16px)' : '400px',
      className: 'gym-popup',
      anchor: 'bottom',
      offset: isMobile ? [0, -5] : [0, -10]
    })
      .setLngLat(lngLat)
      .setHTML('<div class="p-4 text-center text-gray-500">Loading...</div>')
      .addTo(map);

    try {
      const gymFeature = await fetchGymById(gymId);
      
      // Check if this request is still valid (user might have clicked another marker)
      if (pendingGymId !== requestedGymId || currentGymId === null) {
        // This request is stale, ignore it
        if (gymPopup && String(currentGymId) === requestedGymId) {
          // Only remove if it's still showing the same gym
        } else {
          return; // Another popup was opened, ignore this result
        }
      }
      
      if (!gymFeature) {
        if (gymPopup && String(currentGymId) === requestedGymId) {
          gymPopup.setHTML('<div class="p-4 text-center text-red-500">Failed to load gym data</div>');
        }
        return;
      }

      // Double-check the popup is still showing the requested gym
      if (!gymPopup || String(currentGymId) !== requestedGymId) {
        return; // User clicked another marker, ignore this result
      }

      const gym = normalizeGymData(gymFeature);
      const popupContent = createPopupContent(gym);
      gymPopup.setHTML(popupContent);
      attachVoteButtonHandler(gym);
      pendingGymId = null; // Clear pending flag on success
    } catch (err) {
      console.error('Failed to fetch gym data:', err);
      // Only update popup if it's still showing the same gym
      if (gymPopup && String(currentGymId) === requestedGymId) {
        gymPopup.setHTML('<div class="p-4 text-center text-red-500">Failed to load gym data</div>');
      }
      pendingGymId = null;
    }
  }

  // Listen for gym refresh events
  window.addEventListener('gym:refresh', async (e) => {
    const gymId = e.detail;
    if (gymId && currentGymId === gymId) {
      await refreshPopupForGym(gymId);
    }
  });

  return {
    showGymPopup,
    refreshPopupForGym,
    setVotePanel,
    setPasswordModal,
    get popup() { return gymPopup; },
    get currentGymId() { return currentGymId; },
    createPopupContent, // Expose for external use if needed
  };
}