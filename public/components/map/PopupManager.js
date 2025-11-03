// Popup manager module - handles gym popup creation and management
import { useAppStore } from '../../store/index.js';
import { formatDistance } from '../../lib/ui-utils.js';
import { haversineMeters } from '../../lib/geo.js';
import { fetchGymById } from '../../services/api.js';
import { STYLE_COLORS, MAP_CONFIG } from '../../lib/constants.js';
import { useAuth } from '../../store/index.js';

// Constants
const UTILITY_NAMES = {
  toprope: 'Toprope',
  lead: 'Lead',
  kilterboard: 'Kilterboard',
  moon_board: 'Moon Board',
  tension_board: 'Tension board',
  spraywall: 'Spraywall',
  sauna: 'Sauna',
  shower: 'Shower',
  bike_rack: 'Bike Rack',
};

const UTILITY_EMOJIS = {
  toprope: '🧗',
  lead: '🧗',
  kilterboard: '📱',
  moon_board: '🌙',
  tension_board: '💪',
  spraywall: '🎨',
  sauna: '🔥',
  shower: '🚿',
  bike_rack: '🚲',
};

const DIFFICULTY_LABELS = {
  [-3]: 'Super Soft',
  [-2]: 'Soft',
  [-1]: 'Bit Soft',
  [0]: 'Average',
  [1]: 'Bit Hard',
  [2]: 'Hard',
  [3]: 'Super Hard',
};

const UTILITY_TAG_BG_COLOR = '#fae4d4';
const METRIC_CARD_BASE_CLASSES = 'flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg flex-1 min-w-[calc(50%-0.375rem)]';

// Color calculation utilities
function getSmellColors(value) {
  if (value <= 20) return { text: 'text-green-600', border: 'border-green-300' };
  if (value <= 40) return { text: 'text-green-500', border: 'border-green-200' };
  if (value <= 60) return { text: 'text-yellow-600', border: 'border-yellow-400' };
  if (value <= 80) return { text: 'text-orange-600', border: 'border-orange-400' };
  return { text: 'text-red-600', border: 'border-red-400' };
}

function getSmellText(value) {
  if (value <= 20) return 'Fresh';
  if (value <= 40) return 'Slight Odor';
  if (value <= 60) return 'Moderate Smell';
  if (value <= 80) return 'Strong Odor';
  return 'Cave of Despair';
}

function getDifficultyColors(value) {
  if (value <= -2) return { text: 'text-green-600', border: 'border-green-300' };
  if (value <= -0.5) return { text: 'text-green-500', border: 'border-green-200' };
  if (value <= 0.5) return { text: 'text-yellow-600', border: 'border-yellow-400' };
  if (value <= 2) return { text: 'text-red-500', border: 'border-red-200' };
  return { text: 'text-red-600', border: 'border-red-400' };
}

function getDifficultyText(value) {
  const rounded = Math.round(value);
  return DIFFICULTY_LABELS[rounded] || (value < 0 ? 'Bit Soft' : 'Bit Hard');
}

// Helper function to convert HTTP URLs to HTTPS
function ensureHttps(url) {
  if (!url || typeof url !== 'string') return url;
  // Replace http:// with https:// for external URLs
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

function getDirectionsUrl(gym, userLocation) {
  if (!gym.address) return null;
  
  const isChina = gym.country_code && (
    gym.country_code.toUpperCase() === 'CN' || 
    gym.country_code.toUpperCase() === 'CHINA' ||
    gym.country_code.toUpperCase() === 'CHN'
  );
  
  if (isChina) {
    const cityParam = gym.city ? `&city=${encodeURIComponent(gym.city)}` : '';
    return `https://uri.amap.com/search?keyword=${encodeURIComponent(gym.name)}${cityParam}`;
  }
  
  const destination = encodeURIComponent(
    gym.name + 
    (gym.city ? `, ${gym.city}` : '') + 
    (gym.country_code ? `, ${gym.country_code}` : '')
  );
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${userLocation ? `&origin=${userLocation[1]},${userLocation[0]}` : ''}`;
}

function calculateDistance(userLocation, gym) {
  if (!userLocation || gym.lat == null || gym.lng == null) {
    return 'N/A';
  }
  const meters = haversineMeters(userLocation[1], userLocation[0], gym.lat, gym.lng);
  return formatDistance(meters);
}

// Metric card generators
function createMetricCard({ icon, label, value, valueDisplay, bgColor, textColor, borderColor, emptyState }) {
  if (value !== null && value !== undefined) {
    return `
      <div class="${METRIC_CARD_BASE_CLASSES} ${bgColor} border ${borderColor}">
        <span class="${textColor} font-bold text-sm flex-shrink-0">${icon}</span>
        <div class="min-w-0">
          <div class="text-xs text-gray-600">${label}</div>
          <div class="text-xs sm:text-sm font-bold ${textColor}">${valueDisplay}</div>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="${METRIC_CARD_BASE_CLASSES} ${bgColor} border ${borderColor} border-dashed">
      <span class="${textColor} font-bold text-sm flex-shrink-0">${icon}</span>
      <div class="min-w-0">
        <div class="text-xs text-gray-600">${label}</div>
        <div class="text-xs text-gray-500 italic">No votes yet</div>
        ${emptyState || ''}
      </div>
    </div>
  `;
}

function createSmellCard(gym) {
  if (gym.smell_avg !== null && gym.smell_avg !== undefined) {
    const colors = getSmellColors(gym.smell_avg);
    const smellText = getSmellText(gym.smell_avg);
    return createMetricCard({
      icon: '💨',
      label: 'Smell',
      value: gym.smell_avg,
      valueDisplay: smellText,
      bgColor: 'bg-yellow-50',
      textColor: colors.text,
      borderColor: colors.border,
    });
  }
  
  return createMetricCard({
    icon: '💨',
    label: 'Smell',
    value: null,
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-600',
    borderColor: 'border-yellow-200',
    emptyState: '<div class="text-xs text-yellow-500 font-medium mt-0.5">Be the first! 🎯</div>',
  });
}

function createDifficultyCard(gym) {
  if (gym.difficulty_avg !== null && gym.difficulty_avg !== undefined) {
    const colors = getDifficultyColors(gym.difficulty_avg);
    const difficultyText = getDifficultyText(gym.difficulty_avg);
    return createMetricCard({
      icon: '🧗',
      label: 'Difficulty',
      value: gym.difficulty_avg,
      valueDisplay: difficultyText,
      bgColor: 'bg-red-50',
      textColor: colors.text,
      borderColor: colors.border,
    });
  }
  
  return createMetricCard({
    icon: '🧗',
    label: 'Difficulty',
    value: null,
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
    borderColor: 'border-red-200',
    emptyState: '<div class="text-xs text-red-600 mt-0.5">Be the first! 🎯</div>',
  });
}

function createParkingCard(gym) {
  return createMetricCard({
    icon: '🚗',
    label: 'Parking',
    value: gym.parking_availability_avg,
    valueDisplay: gym.parking_availability_avg !== null && gym.parking_availability_avg !== undefined 
      ? `${gym.parking_availability_avg}<span class="text-xs text-gray-500">/100</span>`
      : null,
    bgColor: 'bg-green-50',
    textColor: 'text-green-600',
    borderColor: 'border-green-200',
    emptyState: '<div class="text-xs text-green-600 mt-0.5">Be the first! 🎯</div>',
  });
}

function createPetFriendlyCard(gym) {
  return createMetricCard({
    icon: '🐕',
    label: 'Pet-Friendly',
    value: gym.pet_friendly_avg,
    valueDisplay: gym.pet_friendly_avg !== null && gym.pet_friendly_avg !== undefined
      ? `${gym.pet_friendly_avg}<span class="text-xs text-gray-500">/100</span>`
      : null,
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    borderColor: 'border-purple-200',
    emptyState: '<div class="text-xs text-purple-600 mt-0.5">Be the first! 🎯</div>',
  });
}

// Style distribution utilities
function createStylePieChart(styles) {
  const crimpy = styles.crimpy || 0;
  const dynos = styles.dynos || 0;
  const overhang = styles.overhang || 0;
  const slab = styles.slab || 0;
  const total = crimpy + dynos + overhang + slab;
  
  if (total === 0) {
    return '<div class="text-center py-2 text-xs text-gray-500 italic">No style votes yet</div>';
  }
  
  const size = 80;
  const center = size / 2;
  const radius = size / 2;
  let currentAngle = -Math.PI / 2;
  
  const slices = [
    { key: 'crimpy', value: crimpy, color: STYLE_COLORS.crimpy },
    { key: 'dynos', value: dynos, color: STYLE_COLORS.dynos },
    { key: 'overhang', value: overhang, color: STYLE_COLORS.overhang },
    { key: 'slab', value: slab, color: STYLE_COLORS.slab }
  ].filter(s => s.value > 0);
  
  const paths = slices.map(slice => {
    const angle = (slice.value / total) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    
    const largeArcFlag = slice.value / total > 0.5 ? 1 : 0;
    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
    
    currentAngle = endAngle;
    return `<path d="${path}" fill="${slice.color}" stroke="#ffffff" stroke-width="1.5" />`;
  }).join('');
  
  return `
    <div class="flex items-center gap-3">
      <div class="flex-shrink-0">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="drop-shadow-sm">
          ${paths}
        </svg>
      </div>
      <div class="flex-1 space-y-1">
        ${slices.map(slice => `
          <div class="flex items-center gap-2 text-xs">
            <div class="w-3 h-3 rounded" style="background-color: ${slice.color};"></div>
            <span class="font-medium text-gray-700 capitalize">${slice.key}</span>
            <span class="text-gray-500">${slice.value}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function createUtilitiesTags(utilities) {
  const utilitiesList = Object.entries(utilities)
    .filter(([key, data]) => data && data.exists === true)
    .map(([key, data]) => ({
      key,
      name: UTILITY_NAMES[key] || key,
      emoji: UTILITY_EMOJIS[key] || '✅',
      upvotes: data.upvotes || 0,
      downvotes: data.downvotes || 0,
      total_recent_votes: data.total_recent_votes || 0,
    }))
    .sort((a, b) => b.upvotes - a.upvotes);
  
  if (utilitiesList.length === 0) return '';
  
  return `
    <div class="mt-2 pt-2 border-t border-gray-100">
      <div class="flex flex-wrap gap-1.5">
        ${utilitiesList.map(util => `
          <div class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200" style="background-color: ${UTILITY_TAG_BG_COLOR};">
            <span class="text-xs">${util.emoji}</span>
            <span class="text-xs font-medium text-gray-700">${util.name}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function createStyleDistributionSection(styles, styleVoteCount, utilities) {
  const hasStyleData = styles && (
    styles.crimpy !== undefined || 
    styles.dynos !== undefined || 
    styles.overhang !== undefined || 
    styles.slab !== undefined
  );
  
  const styleChart = createStylePieChart(styles || {});
  const utilitiesTags = createUtilitiesTags(utilities || {});
  
  if (hasStyleData) {
    return `
      <div class="pt-1.5 sm:pt-2 border-t border-gray-100">
        <div class="text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2">
          🧗 Styles${styleVoteCount > 0 ? ` <span class="text-gray-500 font-normal">(${styleVoteCount} votes)</span>` : ''}
        </div>
        ${styleChart}
        ${utilitiesTags}
      </div>
    `;
  }
  
  return `
    <div class="pt-1.5 sm:pt-2 border-t border-gray-100">
      <div class="text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2">🧗 Styles</div>
      <div class="text-center py-1.5 sm:py-2 text-xs text-gray-500 italic">No style votes yet</div>
      <div class="text-center text-xs text-gray-600 mt-1">Be the first to vote! 🎯</div>
      ${utilitiesTags}
    </div>
  `;
}

// Main popup content generator
function createPopupContent(gym) {
  const userLocation = useAppStore.getState().userLocation;
  const distanceText = calculateDistance(userLocation, gym);
  const directionsUrl = getDirectionsUrl(gym, userLocation);
  
  return `
    <div class="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden w-full max-w-[calc(100vw-2rem)] sm:max-w-sm relative" style="font-family: system-ui, -apple-system, sans-serif;">
      ${gym.image ? `
        <div class="w-full h-24 sm:h-32 bg-gradient-to-br from-orange-100 to-red-100 overflow-hidden">
          <img src="${gym.image}" class="w-full h-full object-cover" alt="${gym.name || 'Gym'}" />
        </div>
      ` : ''}
      
      <div class="p-3 sm:p-4 space-y-2 sm:space-y-3 pb-10 sm:pb-12">
        <!-- Gym Header -->
        <div>
          <h3 class="text-base sm:text-lg font-bold text-gray-900 mb-1">${gym.name || 'Climbing Gym'}</h3>
          ${gym.address ? `
            <p class="text-xs sm:text-sm text-gray-600 flex items-center gap-1">
              <span>📍</span>
              <span class="break-words">${gym.address}</span>
            </p>
          ` : ''}
        </div>
        
        <!-- Distance & Directions -->
        <div class="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm flex-wrap">
          ${distanceText !== 'N/A' ? `
            <div class="flex items-center gap-1 text-gray-700">
              <span class="text-blue-500 text-sm sm:text-base">🗺️</span>
              <span class="font-medium">${distanceText}</span>
            </div>
          ` : ''}
          ${directionsUrl ? `
            <a 
              href="${directionsUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="px-2 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-semibold rounded-md hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm hover:shadow-md cursor-pointer touch-manipulation active:scale-95 flex items-center justify-center gap-1"
              title="Get Directions"
            >
              <span class="text-xs">📍</span>
              <span class="text-xs hidden sm:inline">Directions</span>
            </a>
          ` : ''}
          ${gym.tel ? `
            <div class="flex items-center gap-1 text-gray-700">
              <span class="text-gray-500 text-sm sm:text-base">📞</span>
              <span class="break-all">${gym.tel}</span>
            </div>
          ` : ''}
        </div>
        
        <!-- Metrics Grid -->
        <div class="flex flex-wrap gap-1.5 sm:gap-2 pt-2 border-t border-gray-100">
          ${createSmellCard(gym)}
          ${createDifficultyCard(gym)}
          ${createParkingCard(gym)}
          ${createPetFriendlyCard(gym)}
        </div>
        
        <!-- Style Distribution & Utilities -->
        ${createStyleDistributionSection(gym.styles, gym.style_vote_count || 0, gym.utilities)}
      </div>
      
      <!-- Footnote - Bottom Left -->
      <div class="absolute bottom-1.5 sm:bottom-2 left-1.5 sm:left-2">
        <p class="text-xs text-gray-400 italic">Scores are averaged from recent 100 votes.</p>
      </div>
      
      <!-- Vote Button - Bottom Right -->
      <div class="absolute bottom-1.5 sm:bottom-2 right-1.5 sm:right-2">
        <button 
          class="gym-popup-vote-btn px-2.5 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-semibold rounded-md hover:from-orange-600 hover:to-red-600 transition-all shadow-sm hover:shadow-md cursor-pointer touch-manipulation active:scale-95 flex items-center justify-center gap-1"
          data-gym-id="${gym.id}"
        >
          <span class="text-xs">Vote</span>
          <span class="text-xs">→</span>
        </button>
      </div>
    </div>
  `;
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
          alert('Please log in to vote');
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