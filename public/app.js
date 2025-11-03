// Main application orchestrator
import { getSmell } from './lib/storage.js';
import { getConfig, fetchGymsByBbox, fetchAllGyms, fetchVotedGymIds } from './services/api.js';
import { createMapManager } from './components/MapManager.js';
import { createGymList } from './components/GymList.js';
import { initPasswordModal } from './components/PasswordModal.js';
import { createAccountModal } from './components/AccountModal.js';
import { useAppStore, useAuth } from './store/index.js';
import { createGymListToggle } from './components/GymListToggle.js';
import { createGymListSort } from './components/GymListSort.js';
import { inject } from '@vercel/analytics';
import { showLoading, hideLoading } from './components/LoadingIndicator.js';
import { toast } from './components/Toast.js';

// Initialize Vercel Analytics
inject();

// Initialize gym list collapse/expand on mobile - now handled by GymListToggle component
function initGymListToggle() {
  return createGymListToggle();
}

async function initApp() {
  try {
    // Show loading indicator
    showLoading('Initializing map...');
    
    // Ensure map container exists and is visible
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      console.error('[App] Map container not found!');
      hideLoading();
      toast.error('Map container not found. Please refresh the page.');
      return;
    }
    
    // Ensure container has dimensions
    if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
      console.warn('[App] Map container has zero dimensions, waiting for layout...');
      // Wait a bit for layout to settle
      await new Promise(resolve => setTimeout(resolve, 200));
      if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
        console.error('[App] Map container still has zero dimensions');
        hideLoading();
        toast.error('Map container is not visible. Please refresh the page.');
        return;
      }
    }
    
    console.log('[App] Initializing app...');
    showLoading('Loading map configuration...');
    
    // Get Protomaps API key from config (optional - can use demo PMTiles without key)
    let config;
    try {
      config = await getConfig();
    } catch (error) {
      console.error('[App] Failed to fetch config, using defaults:', error);
      config = { protomapsKey: '' }; // Use default fallback
    }
    
    showLoading('Creating map...');
    const mapManager = createMapManager({ 
      protomapsApiKey: config.protomapsKey || ''
    });

    // Initialize components
    const gymList = createGymList(mapManager.map, getSmell);

    // Wire up component interactions - clicking on list item shows map popup
    const onGymClick = (g) => {
      // Close any existing popup
      if (mapManager.gymPopup) {
        mapManager.gymPopup.remove();
      }
      // Show popup at gym location on map
      mapManager.showGymPopup(g.id, [g.lng, g.lat]);
    };
    gymList.setOnGymClick(onGymClick);

    // Initialize gym list toggle and sort functionality
    const toggleState = initGymListToggle();
    createGymListSort(gymList, toggleState);

    // Subscribe to viewport changes and update list
    function updateListForViewport() {
      // Preserve mobile expanded state during render
      const wasExpanded = toggleState?.isExpanded();
      const currentHeight = toggleState?.getCurrentHeight();
      
      gymList.render(); // Re-render list with current bbox
      
      // Restore height if needed on mobile
      if (wasExpanded && currentHeight && toggleState) {
        requestAnimationFrame(() => {
          toggleState.preserveHeight();
        });
      }
      
      const center = mapManager.map.getCenter();
      useAppStore.getState().setViewport({
        center: [center.lng, center.lat],
        zoom: mapManager.map.getZoom(),
      });
    }

    // Note: Viewport updates are now handled by handleViewportChange above
    // which calls updateListForViewport after loading gyms

    // Mode switcher button
    const modeSwitcher = document.getElementById('modeSwitcher');
    const modeSwitcherIcon = document.getElementById('modeSwitcherIcon');
    const modeSwitcherText = document.getElementById('modeSwitcherText');
    
    if (modeSwitcher) {
      modeSwitcher.addEventListener('click', () => {
        const currentMode = gymList.getMode();
        const newMode = currentMode === 'stinky' ? 'difficulty' : 'stinky';
        gymList.setMode(newMode);
        mapManager.setMode(newMode); // Update map icons
        
        // Update button text and icon
        if (newMode === 'stinky') {
          modeSwitcherIcon.textContent = '💨';
          modeSwitcherText.textContent = 'Stinky';
        } else {
          modeSwitcherIcon.textContent = '📊';
          modeSwitcherText.textContent = 'Difficulty';
        }
      });
    }

    // Initialize password modal
    const passwordModal = initPasswordModal();
    
    // Set password modal reference in map manager (for vote button login redirect)
    mapManager.setPasswordModal(passwordModal);
    
    // Initialize account modal
    const accountModal = createAccountModal();
    
    // Wire up password setup button in account modal
    accountModal.onSetupPassword(() => {
      const auth = useAuth();
      if (passwordModal && passwordModal.show) {
        if (auth.password) {
          // User has password, show login mode (can reset)
          passwordModal.show('login', auth.username);
        } else {
          // No password, show register mode
          passwordModal.show('register', auth.username);
        }
      }
    });
    
    // Function to update button text based on login state
    function updateAccountButton() {
      const manageAccountBtn = document.getElementById('manageAccountBtn');
      if (!manageAccountBtn) return;
      
      const auth = useAuth();
      // Find the text span (the span that contains "Login" or "Stats")
      const textSpan = manageAccountBtn.querySelector('span:last-child');
      if (textSpan) {
        if (auth.isLoggedIn) {
          // User is logged in, show "Stats"
          textSpan.textContent = 'Statistics';
        } else {
          // User is not logged in, show "Login"
          textSpan.textContent = 'Login';
        }
      }
    }
    
    // Update button text on initial load
    updateAccountButton();
    
    // Login/Stats button - show login modal if not logged in, stats modal if logged in
    const manageAccountBtn = document.getElementById('manageAccountBtn');
    manageAccountBtn?.addEventListener('click', () => {
      const auth = useAuth();
      
      if (auth.isLoggedIn) {
        // User is logged in (has user_id), show stats modal
        console.log('Opening account modal...');
        if (accountModal && accountModal.show) {
          accountModal.show();
        } else {
          console.error('Account modal not initialized');
          toast.error('Account modal not initialized. Please refresh the page.');
        }
      } else {
        // No user_id, show login modal
        if (passwordModal && passwordModal.show) {
          passwordModal.show('register');
        }
      }
    });
    
    // Update button after successful login/register
    if (passwordModal && passwordModal.onLoginSuccess) {
      passwordModal.onLoginSuccess(() => {
        updateAccountButton();
      });
    }

    // Fetch voted gym IDs for current user (do this first, before loading gyms)
    const auth = useAuth();
    let votedGymIds = [];
    if (auth.username && auth.isLoggedIn) {
      try {
        votedGymIds = await fetchVotedGymIds(auth.username);
        console.log(`[App] User has voted on ${votedGymIds.length} gyms`);
      } catch (error) {
        console.error('[App] Error fetching voted gym IDs:', error);
      }
    }

    // Load gyms in viewport first (much faster than loading all 17k+ gyms)
    console.log('[App] Fetching gyms in viewport...');
    const loadGymsForViewport = async () => {
      showLoading('Loading gyms...');
      const startTime = performance.now();
      let geojson;
      
      try {
        const bounds = mapManager.map.getBounds();
        geojson = await fetchGymsByBbox(bounds);
        const loadTime = performance.now() - startTime;
        console.log(`[App] Loaded ${geojson.features.length} gyms in viewport in ${loadTime.toFixed(0)}ms`);
        
        if (!geojson || !geojson.features || geojson.features.length === 0) {
          hideLoading();
          console.warn('[App] WARNING: No gyms in viewport! This could indicate:');
          console.warn('[App] 1. Database connection issue');
          console.warn('[App] 2. Empty database in production');
          console.warn('[App] 3. API endpoint not working');
          toast.warning('No gyms found in this area. Try zooming out or moving the map.');
          return;
        }
      } catch (error) {
        hideLoading();
        console.error('[App] Error loading gyms:', error);
        toast.error('Failed to load gyms. Please try again.');
        return;
      }

      let all = geojson.features.map(f => ({
        id: f.properties.id,
        name: f.properties.name,
        address: f.properties.address,
        city: f.properties.city,
        country_code: f.properties.country_code,
        tel: f.properties.tel,
        image: f.properties.image,
        smell_avg: f.properties.smell_avg,
        smell_votes: f.properties.smell_votes,
        difficulty_avg: f.properties.difficulty_avg,
        difficulty_votes: f.properties.difficulty_votes,
        parking_availability_avg: f.properties.parking_availability_avg,
        parking_votes: f.properties.parking_votes,
        pet_friendly_avg: f.properties.pet_friendly_avg,
        pet_friendly_votes: f.properties.pet_friendly_votes,
        styles: f.properties.styles,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }));

      // Add gyms layer - MapLayers.js handles style loading internally
      try {
        const layerStartTime = performance.now();
        mapManager.addGymsLayer(geojson, onGymClick, votedGymIds);
        const layerTime = performance.now() - layerStartTime;
        console.log(`[App] Added ${geojson.features.length} markers to map in ${layerTime.toFixed(0)}ms`);
        gymList.setAll(all);
        hideLoading();
      } catch (error) {
        hideLoading();
        console.error('[App] Error adding layers:', error);
        toast.error('Failed to display gyms on map. Please refresh the page.');
      }
    };

    // Wait for map to be ready before loading gyms
    const addLayersWhenReady = () => {
      // Check if map is ready
      const isReady = mapManager.map.isStyleLoaded() && mapManager.map.loaded();
      
      if (isReady) {
        console.log('[App] Map is ready, loading gyms...');
        loadGymsForViewport();
      } else {
        showLoading('Waiting for map to load...');
        console.log('[App] Waiting for map to load...');
        
        // Wait for both style.load and load events (style.load is fired when style is loaded, load is fired when map is ready)
        let styleLoaded = false;
        let mapLoaded = false;
        
        const checkAndLoad = () => {
          if (styleLoaded && mapLoaded) {
            console.log('[App] Map fully loaded, loading gyms...');
            loadGymsForViewport();
          }
        };
        
        mapManager.map.once('style.load', () => {
          console.log('[App] Map style loaded');
          styleLoaded = true;
          showLoading('Map style loaded, preparing gyms...');
          checkAndLoad();
        });
        
        mapManager.map.once('load', () => {
          console.log('[App] Map loaded');
          mapLoaded = true;
          checkAndLoad();
        });
        
        // Fallback timeout in case events don't fire
        setTimeout(() => {
          if (!styleLoaded || !mapLoaded) {
            console.warn('[App] Map load timeout, attempting to load gyms anyway...');
            // Check if map is at least partially ready
            if (mapManager.map.isStyleLoaded() || mapManager.map.loaded()) {
              loadGymsForViewport();
            } else {
              // Retry once more after another delay
              setTimeout(() => {
                console.log('[App] Retrying gym load...');
                showLoading('Retrying...');
                loadGymsForViewport();
              }, 1000);
            }
          }
        }, 5000); // 5 second timeout
      }
    };
    
    addLayersWhenReady();

    // Also reload gyms when viewport changes (but debounced)
    let viewportUpdateTimeout;
    const handleViewportChange = () => {
      clearTimeout(viewportUpdateTimeout);
      viewportUpdateTimeout = setTimeout(() => {
        loadGymsForViewport().then(() => {
          updateListForViewport();
        });
      }, 300); // Debounce viewport updates
    };

    mapManager.map.on('moveend', handleViewportChange);
    mapManager.map.on('zoomend', handleViewportChange);

    // Refresh data function (refetches gyms in viewport and updates vote data)
    async function refreshData() {
      console.log('[App] Refreshing gym data for viewport...');
      const bounds = mapManager.map.getBounds();
      const geojson = await fetchGymsByBbox(bounds);
      mapManager.updateGymsData(geojson);
      const all = geojson.features.map(f => ({
        id: f.properties.id,
        name: f.properties.name,
        address: f.properties.address,
        city: f.properties.city,
        country_code: f.properties.country_code,
        tel: f.properties.tel,
        image: f.properties.image,
        smell_avg: f.properties.smell_avg,
        smell_votes: f.properties.smell_votes,
        difficulty_avg: f.properties.difficulty_avg,
        difficulty_votes: f.properties.difficulty_votes,
        parking_availability_avg: f.properties.parking_availability_avg,
        parking_votes: f.properties.parking_votes,
        pet_friendly_avg: f.properties.pet_friendly_avg,
        pet_friendly_votes: f.properties.pet_friendly_votes,
        styles: f.properties.styles,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }));
      gymList.setAll(all);
      // Update viewport in store
      const center = mapManager.map.getCenter();
      useAppStore.getState().setViewport({
        center: [center.lng, center.lat],
        zoom: mapManager.map.getZoom(),
      });
    }


    // Listen for gym refresh events (from voting)
    window.addEventListener('gym:refresh', async (e) => {
      const gymId = e.detail;
      if (gymId) {
        // Refresh voted gym IDs and update map
        const auth = useAuth();
        if (auth.username && auth.isLoggedIn) {
          try {
            const newVotedGymIds = await fetchVotedGymIds(auth.username);
            if (mapManager.setVotedGyms) {
              mapManager.setVotedGyms(newVotedGymIds);
            }
          } catch (error) {
            console.error('Error refreshing voted gym IDs:', error);
          }
        }
        // Refresh all data
        await refreshData();
      }
    });

    // Note: Initial render is handled by loadGymsForViewport() which calls gymList.setAll()

    // Handle mobile tap for Buy Me a Coffee button
    const buyMeCoffeeBtn = document.getElementById('buyMeCoffeeBtn');
    if (buyMeCoffeeBtn) {
      let touchTimeout;
      buyMeCoffeeBtn.addEventListener('touchstart', (e) => {
        clearTimeout(touchTimeout);
        buyMeCoffeeBtn.classList.add('buy-me-coffee-btn-active');
      }, { passive: true });
      buyMeCoffeeBtn.addEventListener('touchend', (e) => {
        touchTimeout = setTimeout(() => {
          buyMeCoffeeBtn.classList.remove('buy-me-coffee-btn-active');
        }, 2000);
      }, { passive: true });
      // Remove active state when user leaves the button
      buyMeCoffeeBtn.addEventListener('touchcancel', () => {
        clearTimeout(touchTimeout);
        buyMeCoffeeBtn.classList.remove('buy-me-coffee-btn-active');
      }, { passive: true });
    }

    // Handle mobile tap for Feedback button
    const feedbackBtn = document.getElementById('feedbackBtn');
    if (feedbackBtn) {
      let feedbackTouchTimeout;
      feedbackBtn.addEventListener('touchstart', (e) => {
        clearTimeout(feedbackTouchTimeout);
        feedbackBtn.classList.add('feedback-btn-active');
      }, { passive: true });
      feedbackBtn.addEventListener('touchend', (e) => {
        feedbackTouchTimeout = setTimeout(() => {
          feedbackBtn.classList.remove('feedback-btn-active');
        }, 2000);
      }, { passive: true });
      // Remove active state when user leaves the button
      feedbackBtn.addEventListener('touchcancel', () => {
        clearTimeout(feedbackTouchTimeout);
        feedbackBtn.classList.remove('feedback-btn-active');
      }, { passive: true });

      // Configure feedbackfin with user info if available
      const auth = useAuth();
      if (window.feedbackfin && window.feedbackfin.config) {
        window.feedbackfin.config.user = {
          name: auth.username || null,
          id: auth.userId || null,
        };
      }
    }

  } catch (e) {
    hideLoading();
    console.error('Error initializing app', e);
    toast.error('Failed to initialize app. Please refresh the page.');
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure all elements are rendered
    setTimeout(initApp, 100);
  });
} else {
  // DOM already loaded
  setTimeout(initApp, 100);
}

