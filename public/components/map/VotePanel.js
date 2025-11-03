// Vote panel module - handles vote panel UI and submission
import { ensureUsername, getPassword } from '../../lib/username.js';
import { submitVote, fetchMyVote, fetchMyUtilityVotes, submitUtilityVote } from '../../services/api.js';
import { STYLE_COLORS } from '../../lib/constants.js';

const UTILITIES = {
  training: [
    { name: 'Toprope', key: 'toprope' },
    { name: 'Lead', key: 'lead' },
    { name: 'Kilterboard', key: 'kilterboard' },
    { name: 'Moon Board', key: 'moon_board' },
    { name: 'Tension board', key: 'tension_board' },
    { name: 'Spraywall', key: 'spraywall' },
  ],
  other: [
    { name: 'Sauna', key: 'sauna' },
    { name: 'Shower', key: 'shower' },
    { name: 'Bike Rack', key: 'bike_rack' },
  ],
};

export function createVotePanel(popupManager) {
  async function showVotePanel(gym) {
    if (!gym) return;

    // Get username first
    const username = ensureUsername();
    if (!username) {
      alert('Please enter a username to vote');
      return;
    }

    // Default values
    let defaultSmell = 50;
    let defaultDifficulty = 0;
    let defaultParking = 50;
    let defaultPet = 50;
    
    // Store initial values to track if user changed them
    const initialValues = {
      smell: 50,
      difficulty: 0,
      parking: 50,
      pet: 50,
      styles: {
        crimpy: 25,
        dynos: 25,
        overhang: 25,
        slab: 25,
      }
    };
    
    // Style percentages default to 25% each
    let defaultStyles = {
      crimpy: 25,
      dynos: 25,
      overhang: 25,
      slab: 25,
    };

    // Utility votes default to no vote (null)
    let defaultUtilityVotes = {};
    Object.values(UTILITIES).flat().forEach(util => {
      defaultUtilityVotes[util.key] = null;
    });
    
    // Track which fields the user has actually interacted with
    const interactedFields = {
      smell: false,
      difficulty: false,
      parking: false,
      pet: false,
      styles: false,
    };

    // Try to fetch previous vote and utility votes
    try {
      const previousVote = await fetchMyVote(gym.id, username);
      const previousUtilityVotes = await fetchMyUtilityVotes(gym.id, username);
      defaultUtilityVotes = { ...defaultUtilityVotes, ...previousUtilityVotes };
      
      if (previousVote) {
        // Prefill with previous vote values and update initial values
        if (previousVote.smell !== null && previousVote.smell !== undefined) {
          defaultSmell = previousVote.smell;
          initialValues.smell = previousVote.smell;
        }
        if (previousVote.difficulty !== null && previousVote.difficulty !== undefined) {
          defaultDifficulty = previousVote.difficulty;
          initialValues.difficulty = previousVote.difficulty;
        }
        if (previousVote.parking_availability !== null && previousVote.parking_availability !== undefined) {
          defaultParking = previousVote.parking_availability;
          initialValues.parking = previousVote.parking_availability;
        }
        if (previousVote.pet_friendly !== null && previousVote.pet_friendly !== undefined) {
          defaultPet = previousVote.pet_friendly;
          initialValues.pet = previousVote.pet_friendly;
        }
        
        // Prefill style percentages if available
        if (previousVote.style_percentages) {
          const sp = previousVote.style_percentages;
          if (sp.crimpy !== null || sp.dynos !== null || sp.overhang !== null || sp.slab !== null) {
            // If any style percentage exists, use them (fill missing ones with 0)
            defaultStyles = {
              crimpy: sp.crimpy !== null && sp.crimpy !== undefined ? sp.crimpy : 0,
              dynos: sp.dynos !== null && sp.dynos !== undefined ? sp.dynos : 0,
              overhang: sp.overhang !== null && sp.overhang !== undefined ? sp.overhang : 0,
              slab: sp.slab !== null && sp.slab !== undefined ? sp.slab : 0,
            };
            // Normalize to 100% if total is not 0
            const total = defaultStyles.crimpy + defaultStyles.dynos + defaultStyles.overhang + defaultStyles.slab;
            if (total > 0 && total !== 100) {
              const factor = 100 / total;
              defaultStyles.crimpy = Math.round(defaultStyles.crimpy * factor);
              defaultStyles.dynos = Math.round(defaultStyles.dynos * factor);
              defaultStyles.overhang = Math.round(defaultStyles.overhang * factor);
              defaultStyles.slab = 100 - defaultStyles.crimpy - defaultStyles.dynos - defaultStyles.overhang;
            }
            // Update initial values
            initialValues.styles = {
              crimpy: defaultStyles.crimpy,
              dynos: defaultStyles.dynos,
              overhang: defaultStyles.overhang,
              slab: defaultStyles.slab,
            };
          }
        }
      }
    } catch (err) {
      // Continue with default values if fetch fails
    }

    // Create voting form HTML
    const voteFormHTML = `
      <div class="space-y-4">
        <!-- Smell Slider -->
        <div>
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="font-medium text-gray-700">💨 Smell</span>
            <span class="text-sm font-bold text-red-600" id="vote-smell-val">${defaultSmell}</span>
          </div>
          <input 
            type="range" 
            id="vote-smell-slider" 
            min="0" 
            max="100" 
            value="${defaultSmell}"
            class="w-full h-2 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-lg appearance-none cursor-pointer accent-red-500"
            style="background: linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 100%);"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Pleasant</span>
            <span>Stinky</span>
          </div>
        </div>

        <!-- Difficulty Slider -->
        <div>
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="font-medium text-gray-700">🧗 Difficulty</span>
            <span class="text-sm font-bold text-blue-600" id="vote-diff-val">${defaultDifficulty}</span>
          </div>
          <input 
            type="range" 
            id="vote-diff-slider" 
            min="-3" 
            max="3" 
            step="1"
            value="${defaultDifficulty}"
            class="w-full h-2 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-lg appearance-none cursor-pointer accent-red-500"
            style="background: linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 100%);"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Very Soft (-3)</span>
            <span>Very Hard (+3)</span>
          </div>
        </div>

        <!-- Parking Slider -->
        <div>
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="font-medium text-gray-700">🚗 Parking</span>
            <span class="text-sm font-bold text-green-600" id="vote-parking-val">${defaultParking}</span>
          </div>
          <input 
            type="range" 
            id="vote-parking-slider" 
            min="0" 
            max="100" 
            value="${defaultParking}"
            class="w-full h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-lg appearance-none cursor-pointer accent-red-500"
            style="background: linear-gradient(to right, #ef4444 0%, #eab308 50%, #22c55e 100%);"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>None</span>
            <span>Plentiful</span>
          </div>
        </div>

        <!-- Pet-Friendly Slider -->
        <div>
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="font-medium text-gray-700">🐕 Pet-Friendly</span>
            <span class="text-sm font-bold text-purple-600" id="vote-pet-val">${defaultPet}</span>
          </div>
          <input 
            type="range" 
            id="vote-pet-slider" 
            min="0" 
            max="100" 
            value="${defaultPet}"
            class="w-full h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-lg appearance-none cursor-pointer accent-red-500"
            style="background: linear-gradient(to right, #ef4444 0%, #eab308 50%, #22c55e 100%);"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Not Allowed</span>
            <span>Welcome</span>
          </div>
        </div>

        <!-- Interactive Pie Chart Style Distribution -->
        <div class="pt-3 border-t border-gray-200">
          <div class="text-sm font-semibold text-gray-700 mb-3">🧗 Styles <span class="text-xs text-gray-400">Click!</span></div>
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0 relative" id="vote-pie-chart-container">
              <svg width="100" height="100" viewBox="0 0 100 100" class="drop-shadow-sm" id="vote-pie-chart-svg">
                <g id="vote-pie-chart-slices"></g>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="grid grid-cols-2 gap-2">
                <button class="vote-style-tag flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-white border border-gray-200 hover:border-red-400 hover:bg-red-50 hover:shadow-sm active:scale-95 transition-all cursor-pointer font-medium text-gray-700" data-style="crimpy">
                  <div class="w-3 h-3 rounded bg-red-500 flex-shrink-0"></div>
                  <span class="flex-1 text-left text-xs">Crimpy</span>
                </button>
                <button class="vote-style-tag flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:shadow-sm active:scale-95 transition-all cursor-pointer font-medium text-gray-700" data-style="dynos">
                  <div class="w-3 h-3 rounded bg-blue-500 flex-shrink-0"></div>
                  <span class="flex-1 text-left text-xs">Dynos</span>
                </button>
                <button class="vote-style-tag flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-white border border-gray-200 hover:border-orange-400 hover:bg-orange-50 hover:shadow-sm active:scale-95 transition-all cursor-pointer font-medium text-gray-700" data-style="overhang">
                  <div class="w-3 h-3 rounded bg-orange-500 flex-shrink-0"></div>
                  <span class="flex-1 text-left text-xs">Overhang</span>
                </button>
                <button class="vote-style-tag flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-white border border-gray-200 hover:border-green-400 hover:bg-green-50 hover:shadow-sm active:scale-95 transition-all cursor-pointer font-medium text-gray-700" data-style="slab">
                  <div class="w-3 h-3 rounded bg-green-500 flex-shrink-0"></div>
                  <span class="flex-1 text-left text-xs">Slab</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Utility Votes Section -->
        <div class="pt-3 border-t border-gray-200">
          <div class="text-sm font-semibold text-gray-700 mb-3">🏋️ Did you see these?</div>
          <div class="grid grid-cols-2 gap-2 mb-4">
            ${UTILITIES.training.map(util => {
              const userVote = defaultUtilityVotes[util.key] || null;
              return `
                <div class="flex items-center gap-2 p-2 rounded-md bg-gray-50 border border-gray-200">
                  <span class="text-xs font-medium text-gray-700 flex-1">${util.name}</span>
                  <div class="flex items-center gap-1">
                    <button 
                      class="utility-vote-btn utility-upvote ${userVote === 1 ? 'active' : ''} 
                             flex items-center justify-center w-6 h-6 rounded border transition-all 
                             ${userVote === 1 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-white border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-600'}
                             active:scale-90"
                      data-utility="${util.key}"
                      data-vote="upvote"
                      title="Available"
                    >
                      <span class="text-xs">👍</span>
                    </button>
                    <button 
                      class="utility-vote-btn utility-downvote ${userVote === -1 ? 'active' : ''} 
                             flex items-center justify-center w-6 h-6 rounded border transition-all 
                             ${userVote === -1 ? 'bg-red-100 border-red-400 text-red-700' : 'bg-white border-gray-300 text-gray-400 hover:border-red-400 hover:text-red-600'}
                             active:scale-90"
                      data-utility="${util.key}"
                      data-vote="downvote"
                      title="Not Available"
                    >
                      <span class="text-xs">👎</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pt-3 border-t border-gray-200">
          <div class="text-sm font-semibold text-gray-700 mb-3">Or these?</div>
          <div class="grid grid-cols-2 gap-2 mb-4">
            ${UTILITIES.other.map(util => {
              const userVote = defaultUtilityVotes[util.key] || null;
              return `
                <div class="flex items-center gap-2 p-2 rounded-md bg-gray-50 border border-gray-200">
                  <span class="text-xs font-medium text-gray-700 flex-1">${util.name}</span>
                  <div class="flex items-center gap-1">
                    <button 
                      class="utility-vote-btn utility-upvote ${userVote === 1 ? 'active' : ''} 
                             flex items-center justify-center w-6 h-6 rounded border transition-all 
                             ${userVote === 1 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-white border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-600'}
                             active:scale-90"
                      data-utility="${util.key}"
                      data-vote="upvote"
                      title="Available"
                    >
                      <span class="text-xs">👍</span>
                    </button>
                    <button 
                      class="utility-vote-btn utility-downvote ${userVote === -1 ? 'active' : ''} 
                             flex items-center justify-center w-6 h-6 rounded border transition-all 
                             ${userVote === -1 ? 'bg-red-100 border-red-400 text-red-700' : 'bg-white border-gray-300 text-gray-400 hover:border-red-400 hover:text-red-600'}
                             active:scale-90"
                      data-utility="${util.key}"
                      data-vote="downvote"
                      title="Not Available"
                    >
                      <span class="text-xs">👎</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <button 
          class="vote-submit-btn w-full px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold rounded-lg hover:from-orange-600 hover:to-red-600 transition-all shadow-md hover:shadow-lg cursor-pointer touch-manipulation mt-4"
          data-gym-id="${gym.id}"
        >
          Submit Vote →
        </button>
      </div>
    `;

    // Set content and open vote panel
    const votePanel = document.getElementById('votePanel');
    const votePanelContent = document.getElementById('votePanelContent');
    if (!votePanel || !votePanelContent) return;

    votePanelContent.innerHTML = voteFormHTML;
    votePanel.classList.remove('hidden');

    const smellSlider = votePanelContent.querySelector('#vote-smell-slider');
    const smellVal = votePanelContent.querySelector('#vote-smell-val');
    const diffSlider = votePanelContent.querySelector('#vote-diff-slider');
    const diffVal = votePanelContent.querySelector('#vote-diff-val');
    const parkingSlider = votePanelContent.querySelector('#vote-parking-slider');
    const parkingVal = votePanelContent.querySelector('#vote-parking-val');
    const petSlider = votePanelContent.querySelector('#vote-pet-slider');
    const petVal = votePanelContent.querySelector('#vote-pet-val');

    smellSlider?.addEventListener('input', (e) => {
      if (smellVal) smellVal.textContent = e.target.value;
      interactedFields.smell = true;
    });
    diffSlider?.addEventListener('input', (e) => {
      if (diffVal) diffVal.textContent = e.target.value;
      interactedFields.difficulty = true;
    });
    parkingSlider?.addEventListener('input', (e) => {
      if (parkingVal) parkingVal.textContent = e.target.value;
      interactedFields.parking = true;
    });
    petSlider?.addEventListener('input', (e) => {
      if (petVal) petVal.textContent = e.target.value;
      interactedFields.pet = true;
    });

    // Interactive pie chart for style distribution
    const pieSlicesGroup = votePanelContent.querySelector('#vote-pie-chart-slices');
    const styleValues = {
      crimpy: { percentage: defaultStyles.crimpy !== undefined ? defaultStyles.crimpy : 25, color: STYLE_COLORS.crimpy, label: 'Crimpy' },
      dynos: { percentage: defaultStyles.dynos !== undefined ? defaultStyles.dynos : 25, color: STYLE_COLORS.dynos, label: 'Dynos' },
      overhang: { percentage: defaultStyles.overhang !== undefined ? defaultStyles.overhang : 25, color: STYLE_COLORS.overhang, label: 'Overhang' },
      slab: { percentage: defaultStyles.slab !== undefined ? defaultStyles.slab : 25, color: STYLE_COLORS.slab, label: 'Slab' }
    };

    // Add click handlers to style tags
    const styleTags = votePanelContent.querySelectorAll('.vote-style-tag');
    styleTags.forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        const styleKey = tag.getAttribute('data-style');
        if (styleKey && styleValues[styleKey]) {
          tag.classList.add('scale-95');
          setTimeout(() => {
            tag.classList.remove('scale-95');
          }, 150);
          adjustStyle(styleKey, 5);
        }
      });
    });

    // Create and render pie chart
    function renderPieChart() {
      if (!pieSlicesGroup) return;
      
      pieSlicesGroup.innerHTML = '';
      const size = 100;
      const center = size / 2;
      const radius = size / 2;
      let currentAngle = -Math.PI / 2;
      
      const styles = ['crimpy', 'dynos', 'overhang', 'slab'];
      
      styles.forEach((styleKey) => {
        const style = styleValues[styleKey];
        if (!style || style.percentage === undefined) return;
        const angle = (style.percentage / 100) * Math.PI * 2;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        
        const x1 = center + radius * Math.cos(startAngle);
        const y1 = center + radius * Math.sin(startAngle);
        const x2 = center + radius * Math.cos(endAngle);
        const y2 = center + radius * Math.sin(endAngle);
        
        const largeArcFlag = style.percentage > 50 ? 1 : 0;
        const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
        
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', path);
        pathEl.setAttribute('fill', style.color);
        pathEl.setAttribute('stroke', '#ffffff');
        pathEl.setAttribute('stroke-width', '2');
        pathEl.setAttribute('pointer-events', 'none');
        
        pieSlicesGroup.appendChild(pathEl);
        currentAngle = endAngle;
      });
    }

    // Adjust style percentage (always maintains 100% total)
    function adjustStyle(styleKey, delta) {
      if (!styleValues[styleKey] || styleValues[styleKey].percentage === undefined) return;
      interactedFields.styles = true; // Mark styles as interacted
      const current = styleValues[styleKey].percentage;
      const newValue = Math.max(0, Math.min(100, current + delta));
      const diff = newValue - current;
      
      if (diff === 0) return;
      
      const otherStyles = Object.keys(styleValues).filter(k => k !== styleKey);
      const otherTotal = otherStyles.reduce((sum, k) => sum + styleValues[k].percentage, 0);
      
      if (otherTotal === 0 && diff < 0) return;
      
      styleValues[styleKey].percentage = newValue;
      
      if (otherTotal > 0 && diff !== 0) {
        otherStyles.forEach(key => {
          if (!styleValues[key] || styleValues[key].percentage === undefined) return;
          const proportion = styleValues[key].percentage / otherTotal;
          const adjustment = diff * proportion;
          styleValues[key].percentage = Math.max(0, Math.min(100, styleValues[key].percentage - adjustment));
        });
      }
      
      const total = Object.values(styleValues).reduce((sum, s) => sum + s.percentage, 0);
      if (total !== 100) {
        const adjustment = 100 - total;
        styleValues[styleKey].percentage += adjustment;
      }
      
      renderPieChart();
    }

    renderPieChart();

    // Track utility votes (updated in real-time as user clicks)
    const utilityVotes = { ...defaultUtilityVotes };

    // Handle utility vote buttons
    const utilityVoteBtns = votePanelContent.querySelectorAll('.utility-vote-btn');
    utilityVoteBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const utilityKey = btn.getAttribute('data-utility');
        const voteType = btn.getAttribute('data-vote');
        const voteValue = voteType === 'upvote' ? 1 : -1;
        
        // Check if clicking the same vote (toggle off)
        if (utilityVotes[utilityKey] === voteValue) {
          utilityVotes[utilityKey] = null;
        } else {
          utilityVotes[utilityKey] = voteValue;
        }

        try {
          await submitUtilityVote(gym.id, utilityKey, voteType === 'upvote' ? 'upvote' : 'downvote', username, getPassword());
          
          // Update button states
          const upvoteBtn = votePanelContent.querySelector(`.utility-upvote[data-utility="${utilityKey}"]`);
          const downvoteBtn = votePanelContent.querySelector(`.utility-downvote[data-utility="${utilityKey}"]`);
          
          // Remove active states
          upvoteBtn?.classList.remove('active', 'bg-green-100', 'border-green-400', 'text-green-700');
          upvoteBtn?.classList.add('bg-white', 'border-gray-300', 'text-gray-400');
          downvoteBtn?.classList.remove('active', 'bg-red-100', 'border-red-400', 'text-red-700');
          downvoteBtn?.classList.add('bg-white', 'border-gray-300', 'text-gray-400');
          
          // Apply active state based on current vote
          if (utilityVotes[utilityKey] === 1) {
            upvoteBtn?.classList.add('active', 'bg-green-100', 'border-green-400', 'text-green-700');
            upvoteBtn?.classList.remove('bg-white', 'border-gray-300', 'text-gray-400');
          } else if (utilityVotes[utilityKey] === -1) {
            downvoteBtn?.classList.add('active', 'bg-red-100', 'border-red-400', 'text-red-700');
            downvoteBtn?.classList.remove('bg-white', 'border-gray-300', 'text-gray-400');
          }
          
          // Refresh popup to show updated utilities
          await popupManager.refreshPopupForGym(gym.id);
        } catch (err) {
          console.error('Failed to submit utility vote:', err);
          // Revert the vote on error
          utilityVotes[utilityKey] = defaultUtilityVotes[utilityKey];
          alert(err.message || 'Failed to submit utility vote. Please try again.');
        }
      });
    });

    // Handle vote submission
    const submitBtn = votePanelContent.querySelector('.vote-submit-btn');
    submitBtn?.addEventListener('click', async () => {
      const username = ensureUsername();
      if (!username) {
        alert('Please enter a username to vote');
        return;
      }

      // Build voteData only with fields that were actually interacted with
      const voteData = {
        username,
        password: getPassword() || null,
      };
      
      // Only include fields if user interacted with them
      if (interactedFields.smell) {
        const smellValue = Number(smellSlider?.value || 50);
        if (smellValue !== initialValues.smell) {
          voteData.smell = smellValue;
        }
      }
      
      if (interactedFields.difficulty) {
        const diffValue = Number(diffSlider?.value || 0);
        if (diffValue !== initialValues.difficulty) {
          voteData.difficulty = diffValue;
        }
      }
      
      if (interactedFields.parking) {
        const parkingValue = Number(parkingSlider?.value || 50);
        if (parkingValue !== initialValues.parking) {
          voteData.parking_availability = parkingValue;
        }
      }
      
      if (interactedFields.pet) {
        const petValue = Number(petSlider?.value || 50);
        if (petValue !== initialValues.pet) {
          voteData.pet_friendly = petValue;
        }
      }
      
      if (interactedFields.styles) {
        const currentStyles = {
          crimpy: Math.round(styleValues.crimpy.percentage),
          dynos: Math.round(styleValues.dynos.percentage),
          overhang: Math.round(styleValues.overhang.percentage),
          slab: Math.round(styleValues.slab.percentage)
        };
        
        // Only include if styles actually changed
        const stylesChanged = 
          currentStyles.crimpy !== initialValues.styles.crimpy ||
          currentStyles.dynos !== initialValues.styles.dynos ||
          currentStyles.overhang !== initialValues.styles.overhang ||
          currentStyles.slab !== initialValues.styles.slab;
        
        if (stylesChanged) {
          voteData.style_percentages = currentStyles;
        }
      }
      
      // If no fields were interacted with, don't submit
      const hasAnyData = Object.keys(voteData).some(key => 
        key !== 'username' && key !== 'password' && voteData[key] !== undefined
      );
      
      if (!hasAnyData) {
        alert('Please interact with at least one field to submit a vote.');
        return;
      }

      try {
        const result = await submitVote(gym.id, voteData);
        console.log('Vote submitted successfully:', result);
        
        // Close vote panel
        const votePanelEl = document.getElementById('votePanel');
        if (votePanelEl) {
          votePanelEl.classList.add('hidden');
        }
        
        // Small delay to ensure vote panel is hidden
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Refresh the popup with updated data
        console.log('Refreshing popup for gym:', gym.id, gym.name);
        await popupManager.refreshPopupForGym(gym.id);
        
        // Show success message after popup is refreshed
        alert('Vote submitted successfully!');
      } catch (err) {
        console.error('Failed to submit vote:', err);
        alert(err.message || 'Failed to submit vote. Please try again.');
      }
    });

    // Close vote panel button handler
    const closeVotePanelBtn = document.getElementById('closeVotePanel');
    closeVotePanelBtn?.addEventListener('click', () => {
      const votePanelEl = document.getElementById('votePanel');
      if (votePanelEl) {
        votePanelEl.classList.add('hidden');
      }
    });
  }

  return {
    showVotePanel,
  };
}

