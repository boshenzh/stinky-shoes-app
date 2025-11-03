// API service layer

// Helper to parse numeric values from PostgreSQL (which returns numeric types as strings)
function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

export async function getConfig() {
  const res = await fetch('/config');
  if (!res.ok) throw new Error('Failed to fetch /config');
  return res.json();
}

function convertRowsToGeoJSON(rows) {
  if (!rows || rows.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  
  const feats = rows.map((g) => {
    const smellAvg = parseNumericValue(g.smell_avg);
    return {
    type: 'Feature',
    properties: {
      id: g.id,
      provider_poi_id: g.provider_poi_id,
      name: g.name || 'Climbing Gym',
      address: g.address || '',
      city: g.city || '',
      state: g.state || '',
      country_code: g.country_code || '',
      tel: g.phone || '',
      image: g.image_primary_url || '',
      // Vote results - parse all numeric values (PostgreSQL can return integers as strings)
      smell_avg: smellAvg,
      smell_votes: Number(g.smell_votes) || 0,
      difficulty_avg: parseNumericValue(g.difficulty_avg),
      difficulty_votes: Number(g.difficulty_votes) || 0,
      parking_availability_avg: parseNumericValue(g.parking_availability_avg),
      parking_votes: Number(g.parking_votes) || 0,
      pet_friendly_avg: parseNumericValue(g.pet_friendly_avg),
      pet_friendly_votes: Number(g.pet_friendly_votes) || 0,
      styles: g.styles || {}, // Object mapping style names to percentages
      style_vote_count: g.style_vote_count || 0,
      utilities: g.utilities || {}, // Object mapping utility names to vote counts
    },
    geometry: { 
      type: 'Point', 
      coordinates: [
        typeof g.lng === 'number' ? g.lng : parseFloat(g.lng) || 0,
        typeof g.lat === 'number' ? g.lat : parseFloat(g.lat) || 0,
      ]
    },
  };
  }).filter(f => {
    // Filter out features with invalid coordinates
    const [lng, lat] = f.geometry.coordinates;
    const isValid = typeof lng === 'number' && typeof lat === 'number' && 
                    !isNaN(lng) && !isNaN(lat) && 
                    isFinite(lng) && isFinite(lat) &&
                    lng >= -180 && lng <= 180 && 
                    lat >= -90 && lat <= 90;
    if (!isValid) {
      console.warn('Invalid coordinates for gym:', f.properties.id, f.geometry.coordinates);
    }
    return isValid;
  });
  
  if (feats.length === 0) {
    console.error('convertRowsToGeoJSON: All gyms were filtered out due to invalid coordinates');
  }
  
  return { type: 'FeatureCollection', features: feats };
}

export async function fetchGymsByBbox(bounds) {
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',');
  const res = await fetch(`/api/gyms?bbox=${bbox}`);
  if (!res.ok) return { type: 'FeatureCollection', features: [] };
  const rows = await res.json();
  return convertRowsToGeoJSON(rows);
}

export async function fetchAllGyms() {
  try {
    const res = await fetch('/api/gyms');
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[API] Failed to fetch gyms: ${res.status} ${res.statusText}`, errorText);
      return { type: 'FeatureCollection', features: [] };
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      console.error('[API] Invalid response format - expected array, got:', typeof rows, rows);
      return { type: 'FeatureCollection', features: [] };
    }
    const geojson = convertRowsToGeoJSON(rows);
    console.log(`[API] Fetched ${geojson.features.length} gyms from API`);
    return geojson;
  } catch (error) {
    console.error('[API] Error fetching all gyms:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

export async function fetchGymById(gymId) {
  const res = await fetch(`/api/gyms/${gymId}`);
  if (!res.ok) return null;
  const gym = await res.json();
  // Convert single gym to GeoJSON format
  return {
    type: 'Feature',
    properties: {
      id: gym.id,
      provider_poi_id: gym.provider_poi_id,
      name: gym.name || 'Climbing Gym',
      address: gym.address || '',
      city: gym.city || '',
      country_code: gym.country_code || '',
      tel: gym.phone || '',
      image: gym.image_primary_url || '',
      smell_avg: parseNumericValue(gym.smell_avg),
      smell_votes: Number(gym.smell_votes) || 0,
      difficulty_avg: parseNumericValue(gym.difficulty_avg),
      difficulty_votes: Number(gym.difficulty_votes) || 0,
      parking_availability_avg: parseNumericValue(gym.parking_availability_avg),
      parking_votes: Number(gym.parking_votes) || 0,
      pet_friendly_avg: parseNumericValue(gym.pet_friendly_avg),
      pet_friendly_votes: Number(gym.pet_friendly_votes) || 0,
      styles: gym.styles || {},
      style_vote_count: gym.style_vote_count || 0,
      utilities: gym.utilities || {},
    },
    geometry: { type: 'Point', coordinates: [gym.lng, gym.lat] },
  };
}

export async function fetchVotedGymIds(username) {
  if (!username) {
    return [];
  }
  try {
    const res = await fetch(`/api/gyms/voted-gyms?username=${encodeURIComponent(username)}`);
    if (!res.ok) {
      return []; // Return empty array on error
    }
    return await res.json();
  } catch (error) {
    console.error('Error fetching voted gym IDs:', error);
    return [];
  }
}

export async function fetchMyVote(gymId, username) {
  if (!username || !gymId) {
    return null;
  }
  const res = await fetch(`/api/gyms/${gymId}/my-vote?username=${encodeURIComponent(username)}`);
  if (!res.ok) {
    if (res.status === 400) {
      return null; // Username required but not provided
    }
    return null; // No vote found or error
  }
  const data = await res.json();
  return data; // Returns null if no vote, or vote object if found
}

export async function fetchUserStats(userId) {
  if (!userId) {
    console.error('fetchUserStats: user_id is required');
    return null;
  }
  try {
    const res = await fetch(`/api/gyms/user/${encodeURIComponent(userId)}/stats`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('fetchUserStats failed:', res.status, errorData);
      throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (error) {
    console.error('fetchUserStats error:', error);
    throw error;
  }
}

export async function submitSmellVote(gymId, smell, username) {
  const res = await fetch(`/api/gyms/${gymId}/smell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smell, username }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Vote failed: ${res.status}`);
  }
  return res.json();
}

export async function submitVote(gymId, voteData) {
  const { username, password, smell, difficulty, parking_availability, pet_friendly, styles, style_percentages } = voteData;
  const res = await fetch(`/api/gyms/${gymId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: password || null,
      smell,
      difficulty,
      parking_availability,
      pet_friendly,
      styles: Array.isArray(styles) ? styles : [],
      style_percentages: style_percentages || null,
    }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Vote failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchMyUtilityVotes(gymId, username) {
  if (!username || !gymId) {
    return {};
  }
  const res = await fetch(`/api/gyms/${gymId}/my-utility-votes?username=${encodeURIComponent(username)}`);
  if (!res.ok) {
    if (res.status === 400) {
      return {}; // Username required but not provided
    }
    return {}; // No votes found or error
  }
  const data = await res.json();
  return data || {}; // Returns object mapping utility_name -> vote (1 or -1)
}

export async function submitUtilityVote(gymId, utilityName, vote, username, password = null) {
  const res = await fetch(`/api/gyms/${gymId}/utility-vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: password || null,
      utility_name: utilityName,
      vote: vote === 'upvote' ? 1 : -1,
    }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Utility vote failed: ${res.status}`);
  }
  return res.json();
}

// Authentication API
export async function register(username, password = null) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: password || null }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Registration failed: ${res.status}`);
  }
  return res.json();
}

export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Login failed: ${res.status}`);
  }
  return res.json();
}

export async function checkUser(username) {
  const res = await fetch(`/api/auth/check?username=${encodeURIComponent(username)}`);
  if (!res.ok) {
    return { exists: false, has_password: false };
  }
  return res.json();
}

