// Main application orchestrator
import { getSmell } from './lib/storage.js';
import { getConfig, fetchGymsByBbox, fetchAllGyms, fetchVotedGymIds } from './services/api.js';
import { createMapManager } from './components/MapManager.js';
import { createGymList } from './components/GymList.js';
import { initPasswordModal } from './components/PasswordModal.js';
import { createAccountModal } from './components/AccountModal.js';
import { useAppStore } from './store/index.js';
import { getUsername, getPassword, getUserId } from './lib/username.js';
import { createGymListToggle } from './components/GymListToggle.js';
import { createGymListSort } from './components/GymListSort.js';

// Initialize gym list collapse/expand on mobile - now handled by GymListToggle component
function initGymListToggle() {
  return createGymListToggle();
}

async function initApp() {
  try {
    // Get Protomaps API key from config (optional - can use demo PMTiles without key)
    const config = await getConfig();
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

    mapManager.map.on('moveend', updateListForViewport);
    mapManager.map.on('zoomend', updateListForViewport);

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
    
    // Initialize account modal
    const accountModal = createAccountModal();
    
    // Wire up password setup button in account modal
    accountModal.onSetupPassword(() => {
      const username = getUsername();
      const hasPassword = getPassword();
      if (passwordModal && passwordModal.show) {
        if (hasPassword) {
          // User has password, show login mode (can reset)
          passwordModal.show('login', username);
        } else {
          // No password, show register mode
          passwordModal.show('register', username);
        }
      }
    });
    
    // Function to update button text based on login state
    function updateAccountButton() {
      const manageAccountBtn = document.getElementById('manageAccountBtn');
      if (!manageAccountBtn) return;
      
      const userId = getUserId();
      // Find the text span (the span that contains "Login" or "Stats")
      const textSpan = manageAccountBtn.querySelector('span:last-child');
      if (textSpan) {
        if (userId) {
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
      const userId = getUserId();
      
      if (userId) {
        // User is logged in (has user_id), show stats modal
        console.log('Opening account modal...');
        if (accountModal && accountModal.show) {
          accountModal.show();
        } else {
          console.error('Account modal not initialized');
          alert('Account modal not initialized. Please refresh the page.');
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

    // Load all gym data
    console.log('Fetching all gyms from database...');
    let geojson = await fetchAllGyms();
    console.log(`Loaded ${geojson.features.length} gyms`);
    
    // Fetch voted gym IDs for current user
    const username = getUsername();
    let votedGymIds = [];
    if (username) {
      try {
        votedGymIds = await fetchVotedGymIds(username);
        console.log(`User has voted on ${votedGymIds.length} gyms`);
      } catch (error) {
        console.error('Error fetching voted gym IDs:', error);
      }
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
      mapManager.addGymsLayer(geojson, onGymClick, votedGymIds);
      gymList.setAll(all);
    } catch (error) {
      console.error('Error adding layers:', error);
    }

    // Refresh data function (refetches all gyms and updates vote data)
    async function refreshData() {
      console.log('Refreshing gym data...');
      geojson = await fetchAllGyms();
      mapManager.updateGymsData(geojson);
      all = geojson.features.map(f => ({
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
        const username = getUsername();
        if (username) {
          try {
            const newVotedGymIds = await fetchVotedGymIds(username);
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

    // Initial render
    gymList.setAll(all);

    // Handle mobile tap for Buy Me a Coffee button
    const buyMeCoffeeBtn = document.getElementById('buyMeCoffeeBtn');
    if (buyMeCoffeeBtn) {
      let touchTimeout;
      buyMeCoffeeBtn.addEventListener('touchstart', (e) => {
        clearTimeout(touchTimeout);
        buyMeCoffeeBtn.classList.add('buy-me-coffee-btn-active');
      });
      buyMeCoffeeBtn.addEventListener('touchend', (e) => {
        touchTimeout = setTimeout(() => {
          buyMeCoffeeBtn.classList.remove('buy-me-coffee-btn-active');
        }, 2000);
      });
      // Remove active state when user leaves the button
      buyMeCoffeeBtn.addEventListener('touchcancel', () => {
        clearTimeout(touchTimeout);
        buyMeCoffeeBtn.classList.remove('buy-me-coffee-btn-active');
      });
    }

    // Handle mobile tap for Feedback button
    const feedbackBtn = document.getElementById('feedbackBtn');
    if (feedbackBtn) {
      let feedbackTouchTimeout;
      feedbackBtn.addEventListener('touchstart', (e) => {
        clearTimeout(feedbackTouchTimeout);
        feedbackBtn.classList.add('feedback-btn-active');
      });
      feedbackBtn.addEventListener('touchend', (e) => {
        feedbackTouchTimeout = setTimeout(() => {
          feedbackBtn.classList.remove('feedback-btn-active');
        }, 2000);
      });
      // Remove active state when user leaves the button
      feedbackBtn.addEventListener('touchcancel', () => {
        clearTimeout(feedbackTouchTimeout);
        feedbackBtn.classList.remove('feedback-btn-active');
      });

      // Configure feedbackfin with user info if available
      const username = getUsername();
      const userId = getUserId();
      if (window.feedbackfin && window.feedbackfin.config) {
        window.feedbackfin.config.user = {
          name: username || null,
          id: userId || null,
        };
      }
    }

  } catch (e) {
    console.error('Error initializing app', e);
  }
}

window.addEventListener('load', initApp);

