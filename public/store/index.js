// Zustand store for app state
import { create } from 'https://esm.sh/zustand@4.5.7';

// Gym object shape
// { id, name, address, tel, image, smell_avg, votes, lng, lat, ... }

export const useAppStore = create((set) => ({
  // Selected gym state
  selectedGym: null,
  setSelectedGym: (gym) => set({ selectedGym: gym }),

  // Viewport state
  viewport: null, // { center: [lng, lat], zoom }
  setViewport: (viewport) => set({ viewport }),

  // User location
  userLocation: null, // [lng, lat]
  setUserLocation: (location) => set({ userLocation: location }),
}));

