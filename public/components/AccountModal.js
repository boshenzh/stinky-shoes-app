// Account Modal - shows user stats, regions, farthest gyms, and password setup
import { fetchUserStats } from '../services/api.js';
import { getUsername, getUserId } from '../lib/username.js';

export function createAccountModal() {
  const modal = document.getElementById('accountModal');
  const closeBtn = document.getElementById('closeAccountModal');
  const usernameEl = document.getElementById('accountUsername');
  const gymCountEl = document.getElementById('accountGymCount');
  const regionChartEl = document.getElementById('accountRegionChart');
  const farthestGymsEl = document.getElementById('accountFarthestGyms');
  const stinkiestGymEl = document.getElementById('accountStinkiestGym');
  const setupPasswordBtn = document.getElementById('accountSetupPasswordBtn');

  // Create pie chart for region distribution
  function createRegionPieChart(regionStats) {
    const regions = Object.entries(regionStats);
    if (regions.length === 0) {
      return '<div class="text-center py-4 text-sm text-gray-500 italic">No region data available</div>';
    }

    const total = regions.reduce((sum, [_, count]) => sum + count, 0);
    if (total === 0) {
      return '<div class="text-center py-4 text-sm text-gray-500 italic">No region data available</div>';
    }
    
    const colors = [
      '#ef4446', '#3b82f6', '#f97316', '#22c55e', 
      '#a855f7', '#ec4899', '#14b8a6', '#f59e0b'
    ];

    const size = 150; // Base size for SVG viewBox
    const center = size / 2;
    const radius = size / 2 - 5;
    let currentAngle = -Math.PI / 2;
    
    const slices = regions.map(([region, count], index) => {
      const percentage = (count / total) * 100;
      const angle = (count / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      
      // Handle full circle case (100% - single region)
      let path;
      if (Math.abs(angle - 2 * Math.PI) < 0.001) {
        // Full circle - use circle path
        path = `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.01} ${center - radius} Z`;
      } else {
        const x1 = center + radius * Math.cos(startAngle);
        const y1 = center + radius * Math.sin(startAngle);
        const x2 = center + radius * Math.cos(endAngle);
        const y2 = center + radius * Math.sin(endAngle);
        
        const largeArcFlag = angle > Math.PI ? 1 : 0;
        path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
      }
      
      currentAngle = endAngle;
      
      return {
        region,
        count,
        percentage: percentage.toFixed(1),
        path,
        color: colors[index % colors.length],
        startAngle,
        endAngle
      };
    });

    const paths = slices.map(s => 
      `<path d="${s.path}" fill="${s.color}" stroke="#ffffff" stroke-width="2" />`
    ).join('');

    const legend = slices.map((s, i) => `
      <div class="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
        <div class="w-3 h-3 sm:w-4 sm:h-4 rounded flex-shrink-0" style="background-color: ${s.color};"></div>
        <span class="font-medium text-gray-700 flex-1 truncate text-xs sm:text-sm">${s.region}</span>
        <span class="text-gray-500 text-xs sm:text-sm">${s.count} (${s.percentage}%)</span>
      </div>
    `).join('');

    const chartSize = window.innerWidth < 640 ? 120 : size;
    
    return `
      <div class="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4">
        <div class="flex-shrink-0">
          <svg width="${chartSize}" height="${chartSize}" viewBox="0 0 ${size} ${size}" class="drop-shadow-sm">
            ${paths}
          </svg>
        </div>
        <div class="flex-1 space-y-1 sm:space-y-1.5 min-w-0 w-full sm:w-auto">
          ${legend}
        </div>
      </div>
    `;
  }

  // Format distance
  function formatDistance(km) {
    if (km >= 1000) {
      return `${(km / 1000).toFixed(1)}k km`;
    }
    return `${km.toFixed(0)} km`;
  }

  // Show modal with user stats
  async function show() {
    const userId = getUserId();
    const username = getUsername();
    
    if (!userId) {
      alert('Please log in to view your account');
      return;
    }

    try {
      // Show modal immediately with loading state
      if (!modal) {
        console.error('Account modal element not found');
        alert('Account modal not found. Please refresh the page.');
        return;
      }
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (usernameEl) usernameEl.textContent = username || 'Loading...';
      if (gymCountEl) gymCountEl.innerHTML = '<div class="text-center text-xs text-gray-500">Loading...</div>';
      if (regionChartEl) regionChartEl.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">Loading chart...</div>';
      if (farthestGymsEl) farthestGymsEl.innerHTML = '<div class="text-center text-xs text-gray-500">Calculating...</div>';
      if (stinkiestGymEl) stinkiestGymEl.innerHTML = '<div class="text-center text-xs text-gray-500">Calculating...</div>';

      // Fetch user stats using user_id as source of truth
      const stats = await fetchUserStats(userId);
      if (!stats) {
        console.error('fetchUserStats returned null/undefined');
        throw new Error('Failed to fetch user stats - no data returned');
      }
      
      // Debug: log stats to help diagnose issues
      console.log('Account stats received:', {
        gymsVisited: stats.gymsVisited,
        hasStinkiestGym: !!stats.stinkiestGym,
        stinkiestGym: stats.stinkiestGym,
        regionStats: stats.regionStats,
        regionStatsKeys: stats.regionStats ? Object.keys(stats.regionStats) : null,
        regionStatsLength: stats.regionStats ? Object.keys(stats.regionStats).length : 0
      });

      // Update username (from API response, fallback to stored username)
      if (usernameEl) {
        usernameEl.textContent = `👤 ${stats.username || username || 'User'}`;
      }

      // Update region chart - show even if user has only visited one gym
      if (regionChartEl) {
        if (stats.regionStats && Object.keys(stats.regionStats).length > 0) {
          console.log('Rendering pie chart with regionStats:', stats.regionStats);
          regionChartEl.innerHTML = createRegionPieChart(stats.regionStats);
        } else if (stats.gymsVisited >= 1) {
          // Show a message if user has visited gyms but no region data
          console.log('No region data available, showing message');
          regionChartEl.innerHTML = '<div class="text-center py-4 text-sm text-gray-500 italic">Region data not available for visited gym(s)</div>';
        } else {
          // Show message if no gyms visited
          console.log('No gyms visited');
          regionChartEl.innerHTML = '<div class="text-center py-4 text-sm text-gray-500 italic">Visit gyms to see region distribution</div>';
        }
      }

      // Update farthest gyms (match popup card style) - only show the farthest pair
      if (farthestGymsEl && stats.farthestGyms) {
        if (stats.farthestGyms.length === 0) {
          farthestGymsEl.innerHTML = '<div class="text-center text-xs sm:text-sm text-gray-500 italic">Go to more than 2 gyms to unlock this!</div>';
        } else {
          const farthestPair = stats.farthestGyms[0];
          farthestGymsEl.innerHTML = `
            <div class="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-orange-50 border border-orange-200">
              <span class="text-orange-600 font-bold text-base sm:text-lg flex-shrink-0">🥇</span>
              <div class="flex-1 min-w-0">
                <div class="text-xs sm:text-sm font-bold text-orange-700">${formatDistance(farthestPair.distance)} apart</div>
                <div class="text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">${farthestPair.gym1.name} ↔ ${farthestPair.gym2.name}</div>
              </div>
            </div>
          `;
        }
      }

      // Update stinkiest gym (match popup card style)
      if (stinkiestGymEl) {
        if (stats.stinkiestGym && stats.stinkiestGym.smell_avg > 0) {
          const gym = stats.stinkiestGym;
          stinkiestGymEl.innerHTML = `
            <div class="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-red-50 border border-red-200">
              <span class="text-red-600 font-bold text-base sm:text-lg flex-shrink-0">💨</span>
              <div class="flex-1 min-w-0">
                <div class="text-xs sm:text-sm font-bold text-red-700 truncate">${gym.name || 'Unknown Gym'}</div>
                <div class="text-xs text-gray-500 mt-0.5 sm:mt-1">${gym.smell_avg || 0}<span class="text-gray-500">/100</span></div>
                ${gym.city ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${gym.city}</div>` : ''}
              </div>
            </div>
          `;
        } else {
          stinkiestGymEl.innerHTML = '<div class="text-center text-xs sm:text-sm text-gray-500 italic">No smelly gyms visited yet</div>';
        }
      }

      // Update gym count (match popup card style)
      if (gymCountEl) {
        const gymCount = stats.gymsVisited || 0;
        gymCountEl.innerHTML = `
          <div class="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-blue-50 border border-blue-200">
            <span class="text-blue-600 font-bold text-base sm:text-lg flex-shrink-0">🏋️</span>
            <div class="flex-1 min-w-0">
              <div class="text-xs sm:text-sm font-bold text-blue-700">${gymCount} gym${gymCount !== 1 ? 's' : ''}</div>
            </div>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading account stats:', error);
      console.error('Error details:', error.message, error.stack);
      
      // Show more detailed error message
      const errorMsg = error.message || 'Unknown error';
      alert(`Failed to load account information: ${errorMsg}. Check console for details.`);
      
      // Still show basic info
      if (usernameEl) usernameEl.textContent = username;
      if (gymCountEl) gymCountEl.innerHTML = `<div class="text-center text-xs text-red-500">Failed to load: ${errorMsg}</div>`;
      if (regionChartEl) regionChartEl.innerHTML = `<div class="text-center py-4 text-sm text-red-500">Failed to load region data: ${errorMsg}</div>`;
      if (farthestGymsEl) farthestGymsEl.innerHTML = `<div class="text-center text-xs text-red-500">Failed to load farthest gyms: ${errorMsg}</div>`;
      if (stinkiestGymEl) stinkiestGymEl.innerHTML = `<div class="text-center text-xs text-red-500">Failed to load stinkiest gym: ${errorMsg}</div>`;
    }
  }

  // Hide modal
  function hide() {
    modal?.classList.add('hidden');
  }

  // Wire up event listeners
  closeBtn?.addEventListener('click', hide);
  
  // Close on background click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      hide();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal?.classList.contains('hidden')) {
      hide();
    }
  });

  // Password setup button - will be handled by app.js
  function onSetupPassword(callback) {
    setupPasswordBtn?.addEventListener('click', () => {
      hide();
      if (callback) callback();
    });
  }

  return {
    show,
    hide,
    onSetupPassword,
  };
}

