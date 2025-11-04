// Gym list component
import { getStinkScore, stinkBgStyleAttr, inBbox, formatDistance, haversineMeters } from '../lib/utils.js';
import { useAppStore } from '../store/index.js';
import { MAP_CONFIG } from '../lib/constants.js';
import { getSmellText, getSmellColors, getDifficultyText, getDifficultyColors } from './map/PopupContent.js';
import { fetchGymsByRegion } from '../services/api.js';

export function createGymList(map) {
  const $list = document.getElementById('gymList');
  let all = [];
  let regionGyms = []; // Store all gyms in the current region
  let currentRegion = null; // Store current region key to detect changes
  let onGymClickFn = null;
  let currentMode = 'stinky'; // 'stinky' or 'difficulty'
  let sortOrder = 'desc'; // 'asc' or 'desc'

  function setMode(mode) {
    if (mode === 'stinky' || mode === 'difficulty') {
      currentMode = mode;
      render();
    }
  }

  function getMode() {
    return currentMode;
  }

  function toggleSortOrder() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    render();
  }

  function getSortOrder() {
    return sortOrder;
  }

  function setOnGymClick(fn) {
    onGymClickFn = fn;
  }

  function setAll(newAll) {
    all = newAll;
    render();
  }

  async function render() {
    if (!$list) return;
    const $container = document.getElementById('gymListContainer');
    const $headerMobile = document.getElementById('gymListHeader');
    const $headerDesktop = document.getElementById('gymListHeaderDesktop');
    const $headerCollapsed = document.getElementById('gymListHeaderCollapsed');
    const $iconCollapsed = document.getElementById('gymListIconCollapsed');
    
    const b = map.getBounds();
    const center = b.getCenter();
    const zoom = map.getZoom();
    
    // Determine region level based on zoom level
    // Zoom < 8: country level
    // Zoom >= 8 and < CITY_ZOOM_THRESHOLD: state level
    // Zoom >= CITY_ZOOM_THRESHOLD: city level
    const isCountryLevel = zoom < 8;
    const isStateLevel = zoom >= 8 && zoom < MAP_CONFIG.CITY_ZOOM_THRESHOLD;
    const isCityLevel = zoom >= MAP_CONFIG.CITY_ZOOM_THRESHOLD;
    
    // Find gyms near the center (small bbox around center) to determine the region
    // Use a small bbox around the center instead of the entire viewport
    const centerLng = center.lng;
    const centerLat = center.lat;
    const bboxSize = 0.1; // Small bbox around center (about 10km)
    const centerBbox = {
      getWest: () => centerLng - bboxSize,
      getSouth: () => centerLat - bboxSize,
      getEast: () => centerLng + bboxSize,
      getNorth: () => centerLat + bboxSize,
    };
    const gymsNearCenter = all.filter(g => inBbox(g, centerBbox));
    
    // Fallback: if no gyms near center, use closest gyms
    let gymsInView;
    if (gymsNearCenter.length === 0) {
      // Find closest gyms to center
      const gymsWithDistance = all.map(g => {
        if (g.lat == null || g.lng == null) return { gym: g, distance: Infinity };
        const distance = haversineMeters(centerLat, centerLng, g.lat, g.lng);
        return { gym: g, distance };
      });
      gymsWithDistance.sort((a, b) => a.distance - b.distance);
      gymsInView = gymsWithDistance.slice(0, 10).map(item => item.gym);
    } else {
      gymsInView = gymsNearCenter;
    }
    
    if (gymsInView.length === 0) {
      if ($container) $container.classList.add('hidden');
      if ($list) $list.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center">No gyms in view</div>';
      return;
    }
    
    // Find the most common region based on zoom level from gyms near center
    // Country level: use country_code only
    // State level: use state + country_code
    // City level: use city + country_code (fallback to state + country_code)
    const regionCounts = {};
    gymsInView.forEach(g => {
      let regionKey;
      if (isCountryLevel) {
        // Country level: use country only
        regionKey = g.country_code || 'Unknown';
      } else if (isStateLevel) {
        // State level: use state + country
        if (g.state && g.state.trim()) {
          regionKey = `${g.state}, ${g.country_code || 'Unknown'}`;
        } else {
          regionKey = g.country_code || 'Unknown';
        }
      } else {
        // City level: use city + country (fallback to state + country)
        if (g.city && g.city.trim()) {
          regionKey = `${g.city}, ${g.country_code || 'Unknown'}`;
        } else if (g.state && g.state.trim()) {
          regionKey = `${g.state}, ${g.country_code || 'Unknown'}`;
        } else {
          regionKey = g.country_code || 'Unknown';
        }
      }
      regionCounts[regionKey] = (regionCounts[regionKey] || 0) + 1;
    });
    
    // Get the most common region
    const mostCommonRegion = Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // Parse the region to get city/state and country_code
    let regionCity = null;
    let regionState = null;
    let regionCountry = null;
    
    if (isCountryLevel) {
      // Country level: region is just the country
      regionCountry = mostCommonRegion;
    } else if (isStateLevel) {
      // State level: parse state and country
      if (mostCommonRegion.includes(', ')) {
        const parts = mostCommonRegion.split(', ');
        if (parts.length >= 2) {
          regionCountry = parts[parts.length - 1];
          regionState = parts[0]; // At state level, first part is always the state
        }
      } else {
        regionCountry = mostCommonRegion;
      }
    } else {
      // City level: parse city/state and country
      if (mostCommonRegion.includes(', ')) {
        const parts = mostCommonRegion.split(', ');
        if (parts.length >= 2) {
          regionCountry = parts[parts.length - 1];
          // Check if first part is city or state by looking at original gyms
          const firstPart = parts[0];
          const hasCity = gymsInView.some(g => g.city && g.city.trim() === firstPart);
          if (hasCity) {
            regionCity = firstPart;
          } else {
            regionState = firstPart;
          }
        }
      } else {
        regionCountry = mostCommonRegion;
      }
    }
    
    // Create region key to detect changes
    const regionKey = `${regionCountry || ''}-${regionState || ''}-${regionCity || ''}`;
    
    // Fetch all gyms in the region if region changed
    if (regionKey !== currentRegion) {
      currentRegion = regionKey;
      try {
        const regionFeatures = await fetchGymsByRegion(regionCountry, regionState, regionCity);
        regionGyms = regionFeatures.features.map(f => ({
          id: f.properties.id,
          name: f.properties.name,
          address: f.properties.address,
          city: f.properties.city,
          state: f.properties.state,
          country_code: f.properties.country_code,
          tel: f.properties.tel,
          image: f.properties.image,
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          smell_avg: f.properties.smell_avg,
          smell_votes: f.properties.smell_votes || 0,
          difficulty_avg: f.properties.difficulty_avg,
          difficulty_votes: f.properties.difficulty_votes || 0,
          parking_availability_avg: f.properties.parking_availability_avg,
          parking_votes: f.properties.parking_votes || 0,
          pet_friendly_avg: f.properties.pet_friendly_avg,
          pet_friendly_votes: f.properties.pet_friendly_votes || 0,
          styles: f.properties.styles,
          style_vote_count: f.properties.style_vote_count || 0,
          utilities: f.properties.utilities || {},
        }));
      } catch (error) {
        console.error('Error fetching gyms by region:', error);
        // Fallback to filtering from all gyms in viewport
        regionGyms = all.filter(g => {
          const gymCountry = g.country_code || 'Unknown';
          
          if (isCountryLevel) {
            return gymCountry === regionCountry;
          } else if (isStateLevel) {
            if (regionState) {
              return g.state && g.state.trim() === regionState && gymCountry === regionCountry;
            } else {
              return gymCountry === regionCountry;
            }
          } else {
            if (regionCity) {
              return g.city && g.city.trim() === regionCity && gymCountry === regionCountry;
            } else if (regionState) {
              return g.state && g.state.trim() === regionState && gymCountry === regionCountry;
            } else {
              return gymCountry === regionCountry;
            }
          }
        });
      }
    }
    
    let displayGyms;
    
    if (currentMode === 'stinky') {
      // Stinky mode: sort by smell (highest first), then by distance (closest first)
      const userLoc = useAppStore.getState().userLocation;
      const withStink = regionGyms.map(g => {
        const stink = getStinkScore(g);
        let distance = null;
        if (userLoc && g.lat != null && g.lng != null) {
          distance = haversineMeters(userLoc[1], userLoc[0], g.lat, g.lng);
        }
        return { ...g, stink, distance };
      });
      
      withStink.sort((a, b) => {
        // First sort by stink
        const av = a.stink;
        const bv = b.stink;
        const stinkComparison = sortOrder === 'desc' ? bv - av : av - bv; // desc: higher first, asc: lower first
        
        if (av != null && bv != null) {
          if (bv !== av) {
            return stinkComparison;
          }
          // If stink is equal, sort by distance (closer first)
          if (a.distance != null && b.distance != null) {
            return a.distance - b.distance;
          }
          if (a.distance == null) return 1;
          if (b.distance == null) return -1;
          return 0;
        }
        if (av == null && bv == null) {
          // Both null, sort by distance
          if (a.distance != null && b.distance != null) {
            return a.distance - b.distance;
          }
          if (a.distance == null) return 1;
          if (b.distance == null) return -1;
          return 0;
        }
        if (av == null) return 1;
        if (bv == null) return -1;
        return stinkComparison;
      });
      displayGyms = withStink.slice(0, 5);
      
      // Update header with region name based on zoom level
      let regionLabel;
      if (isCountryLevel) {
        regionLabel = regionCountry;
      } else if (isStateLevel) {
        regionLabel = regionState ? `${regionState}, ${regionCountry}` : regionCountry;
      } else {
        regionLabel = regionCity ? `${regionCity}, ${regionCountry}` : (regionState ? `${regionState}, ${regionCountry}` : regionCountry);
      }
      const headerText = `💨 Top 5 in ${regionLabel}`;
      const collapsedText = `TOP 5 Stink`;
      if ($headerMobile) $headerMobile.textContent = headerText;
      if ($headerDesktop) $headerDesktop.textContent = headerText;
      if ($headerCollapsed) $headerCollapsed.textContent = collapsedText;
      if ($iconCollapsed) $iconCollapsed.textContent = '💨';
    } else {
      // Difficulty mode: sort by difficulty
      const withDifficulty = regionGyms.filter(g => g.difficulty_avg !== null);
      withDifficulty.sort((a, b) => {
        const av = a.difficulty_avg;
        const bv = b.difficulty_avg;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sortOrder === 'desc' ? bv - av : av - bv; // desc: higher first, asc: lower first
      });
      displayGyms = withDifficulty.slice(0, 5);
      
      // Update header with region name based on zoom level
      let regionLabel;
      if (isCountryLevel) {
        regionLabel = regionCountry;
      } else if (isStateLevel) {
        regionLabel = regionState ? `${regionState}, ${regionCountry}` : regionCountry;
      } else {
        regionLabel = regionCity ? `${regionCity}, ${regionCountry}` : (regionState ? `${regionState}, ${regionCountry}` : regionCountry);
      }
      const headerText = `📊 Top 5 in ${regionLabel}`;
      const collapsedText = `TOP 5 Difficult`;
      if ($headerMobile) $headerMobile.textContent = headerText;
      if ($headerDesktop) $headerDesktop.textContent = headerText;
      if ($headerCollapsed) $headerCollapsed.textContent = collapsedText;
      if ($iconCollapsed) $iconCollapsed.textContent = '🧗';
    }

    // Show/hide container - always show unless there are no gyms in view at all
    if ($container) {
      const hasGymsInView = gymsInView.length > 0;
      $container.classList.toggle('hidden', !hasGymsInView);
      
      // On mobile, collapse list if no gyms
      if (!hasGymsInView) {
        const $list = document.getElementById('gymList');
        const $toggleIcon = document.getElementById('gymListToggleIcon');
        if ($list && window.innerWidth < 640) {
          $list.style.maxHeight = '0';
          if ($toggleIcon) $toggleIcon.style.transform = 'rotate(0deg)';
        }
      }
    }

    // Show appropriate message if no gyms to display in current mode
    if (displayGyms.length === 0) {
      let regionLabel;
      if (isCountryLevel) {
        regionLabel = regionCountry;
      } else if (isStateLevel) {
        regionLabel = regionState ? `${regionState}, ${regionCountry}` : regionCountry;
      } else {
        regionLabel = regionCity ? `${regionCity}, ${regionCountry}` : (regionState ? `${regionState}, ${regionCountry}` : regionCountry);
      }
      if (currentMode === 'difficulty') {
        $list.innerHTML = `<div class="p-4 text-sm text-gray-500 text-center">No gyms rated with difficulty in ${regionLabel} yet</div>`;
      } else {
        $list.innerHTML = `<div class="p-4 text-sm text-gray-500 text-center">No gyms in ${regionLabel}</div>`;
      }
      return;
    }

    $list.innerHTML = displayGyms.map((g, idx) => `
      <button data-id="${g.id}" class="w-full text-left p-2 sm:p-3 hover:bg-gray-50/80 focus:bg-gray-50/80 transition-colors border-b border-gray-100/50 last:border-0 group" ${stinkBgStyleAttr(g.stink)}>
        <div class="flex items-start gap-2 sm:gap-3">
          <div class="relative flex-shrink-0">
            <div class="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
              ${g.image ? `<img src="${g.image}" class="h-full w-full object-cover" alt="${g.name}" loading="lazy"/>` : '<span class="text-xl sm:text-2xl">🧗</span>'}
            </div>
            ${idx === 0 ? '<div class="absolute -top-1 -right-1 h-2.5 w-2.5 sm:h-3 sm:w-3 bg-red-500 rounded-full border-2 border-white"></div>' : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-xs sm:text-sm text-gray-900 truncate group-hover:text-red-600 transition-colors">${g.name}</div>
            ${g.address ? `<div class="text-xs text-gray-500 truncate mt-0.5">${g.address}</div>` : ''}
            ${g.distance != null ? `<div class="text-xs text-gray-600 mt-0.5">📍 ${formatDistance(g.distance)}</div>` : ''}
            <div class="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-1.5">
              ${currentMode === 'stinky' && g.smell_avg !== null ? (() => {
                const smellText = getSmellText(g.smell_avg);
                const smellColors = getSmellColors(g.smell_avg);
                // Choose icon based on stink level
                let stinkIcon = '💨'; // Default icon
                if (smellText === 'Cave of Despair') {
                  stinkIcon = '💩'; // Poop icon for worst smell
                } else if (smellText === 'Fresh') {
                  stinkIcon = '🌿'; // Grass icon for fresh
                }
                return `
                  <div class="flex items-center gap-1">
                    <span class="text-xs font-medium ${smellColors.text}">${stinkIcon} ${smellText}</span>
                    <span class="text-xs text-gray-400">(${g.smell_votes || 0})</span>
                  </div>
                `;
              })() : ''}
              ${currentMode === 'difficulty' && g.difficulty_avg !== null ? (() => {
                const difficultyText = getDifficultyText(g.difficulty_avg);
                const difficultyColors = getDifficultyColors(g.difficulty_avg);
                // Choose icon based on difficulty level
                let difficultyIcon = '🧗'; // Default icon (climber for Average)
                if (difficultyText.includes('Hard')) {
                  difficultyIcon = '🪨'; // Rock icon for all hard levels (Bit Hard, Hard, Super Hard)
                } else if (difficultyText.includes('Soft')) {
                  difficultyIcon = '🪜'; // Staircase icon for all soft levels (Super Soft, Soft, Bit Soft)
                }
                return `
                  <div class="flex items-center gap-1">
                    <span class="text-xs font-medium ${difficultyColors.text}">${difficultyIcon} ${difficultyText}</span>
                  </div>
                `;
              })() : ''}
            </div>
          </div>
          <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>
      </button>
    `).join('');

    $list.querySelectorAll('button[data-id]')?.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const g = displayGyms.find(x => x.id === id) || all.find(x => x.id === id);
        if (!g) return;
        const isMobile = window.innerWidth < 640;
        const targetZoom = Math.max(map.getZoom(), isMobile ? MAP_CONFIG.POPUP_ZOOM_MOBILE : MAP_CONFIG.POPUP_ZOOM);
        map.easeTo({ center: [g.lng, g.lat], zoom: targetZoom });
        if (onGymClickFn) onGymClickFn(g);
      });
    });
  }

  return { render, setAll, setOnGymClick, setMode, getMode, toggleSortOrder, getSortOrder };
}

