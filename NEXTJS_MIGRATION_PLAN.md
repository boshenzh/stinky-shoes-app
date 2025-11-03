# Next.js Migration Plan

This document outlines the plan to migrate the climbing gym map application to Next.js for better component reusability, server-side rendering, and improved mobile experience.

## Current Architecture

- **Frontend**: Vanilla JavaScript ES6 modules
- **Backend**: Express.js server
- **State Management**: Zustand
- **Styling**: Tailwind CSS (CDN)
- **Map Library**: MapLibre GL JS
- **Database**: PostgreSQL with PostGIS

## Benefits of Next.js Migration

1. **Component Reusability**: React components can be easily reused across pages
2. **Better Mobile Performance**: SSR/SSG for faster initial load
3. **Code Organization**: Better structure with pages and components
4. **Type Safety**: Can add TypeScript gradually
5. **API Routes**: Next.js API routes instead of separate Express server
6. **Optimization**: Built-in image optimization, code splitting
7. **SEO**: Better SEO with server-side rendering

## Migration Strategy

### Phase 1: Setup Next.js Project

```bash
# Create Next.js app
npx create-next-app@latest gym-map-nextjs --typescript --tailwind --app

# Install dependencies
npm install zustand maplibre-gl
npm install @types/maplibre-gl
npm install pg postgis-preview
```

### Phase 2: Component Structure

```
app/
├── layout.tsx                 # Root layout
├── page.tsx                   # Main map page
├── components/
│   ├── map/
│   │   ├── MapManager.tsx     # Map component
│   │   ├── GymMarkers.tsx     # Gym markers layer
│   │   └── GymPopup.tsx       # Popup component
│   ├── gym/
│   │   ├── GymList.tsx        # Floating gym list
│   │   ├── GymModal.tsx       # Gym detail modal
│   │   └── GymCard.tsx        # Gym card component
│   ├── ui/
│   │   ├── ModeSwitcher.tsx   # Mode toggle button
│   │   ├── LocateButton.tsx   # Geolocate button
│   │   └── Button.tsx         # Reusable button
│   └── modals/
│       ├── PasswordModal.tsx
│       └── SignupModal.tsx
├── lib/
│   ├── store.ts               # Zustand store
│   ├── api.ts                 # API client
│   └── geo.ts                 # Geography utilities
└── api/
    ├── route.ts               # API routes
    └── gyms/
        └── route.ts            # Gym endpoints
```

### Phase 3: Convert Components

#### 1. MapManager Component

```tsx
'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useAppStore } from '@/lib/store';

export function MapManager({ maptilerKey }: { maptilerKey: string }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`,
      center: [-122.0090, 37.3349],
      zoom: 12,
    });
    
    // Cleanup
    return () => {
      map.current?.remove();
    };
  }, [maptilerKey]);
  
  return <div ref={mapContainer} className="w-full h-full" />;
}
```

#### 2. GymList Component

```tsx
'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { formatDistance } from '@/lib/utils';
import { GymCard } from './GymCard';

export function GymList({ gyms, mode }: { gyms: Gym[]; mode: 'stinky' | 'difficulty' }) {
  const userLocation = useAppStore((state) => state.userLocation);
  
  const sortedGyms = useMemo(() => {
    // Sorting logic
    return gyms.sort(...);
  }, [gyms, userLocation, mode]);
  
  return (
    <div className="fixed bottom-4 left-4 z-20 w-80 max-w-[calc(100vw-2rem)]">
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-xl">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">
            {mode === 'stinky' ? '💨 Top 5 Stinky Gyms' : '📊 Top 5 Hardest Gyms'}
          </h2>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {sortedGyms.slice(0, 5).map((gym) => (
            <GymCard key={gym.id} gym={gym} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

#### 3. GymPopup Component

```tsx
'use client';

import { Popup } from 'maplibre-gl';
import { Gym } from '@/types';

interface GymPopupProps {
  gym: Gym;
  map: maplibregl.Map;
  lngLat: [number, number];
}

export function createGymPopup({ gym, map, lngLat }: GymPopupProps) {
  const popup = new Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: window.innerWidth < 640 ? 'calc(100vw - 16px)' : '400px',
    anchor: 'bottom',
  });
  
  popup.setLngLat(lngLat)
    .setHTML(<GymPopupContent gym={gym} />)
    .addTo(map);
  
  return popup;
}
```

### Phase 4: API Routes Migration

Convert Express routes to Next.js API routes:

```typescript
// app/api/gyms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const bbox = searchParams.get('bbox');
  
  const pool = getPool();
  // Query logic
  const gyms = await pool.query(...);
  
  return NextResponse.json(gyms.rows);
}
```

### Phase 5: Mobile Optimizations

1. **Responsive Design**: Use Tailwind's responsive classes
2. **Touch Gestures**: Implement swipe gestures for mobile
3. **Progressive Web App**: Add PWA support
4. **Image Optimization**: Use Next.js Image component

### Phase 6: Deployment

1. **Database**: Keep PostgreSQL separate or use managed service
2. **Environment Variables**: Use Next.js env handling
3. **Build**: `npm run build` creates optimized production build
4. **Deploy**: Deploy to Vercel, Netlify, or self-hosted

## Component Reusability Benefits

### Before (Vanilla JS)
```javascript
// Each component is tightly coupled to DOM
function createGymList(map, getSmell) {
  const $list = document.getElementById('gymList');
  // Hard to reuse in different contexts
}
```

### After (React/Next.js)
```tsx
// Reusable component
export function GymList({ gyms, onGymClick, sortBy }: GymListProps) {
  // Can be used in map, sidebar, search results, etc.
  return (
    <div>
      {gyms.map(gym => <GymCard key={gym.id} gym={gym} onClick={onGymClick} />)}
    </div>
  );
}
```

## Migration Checklist

- [ ] Setup Next.js project with TypeScript
- [ ] Install all dependencies
- [ ] Create component structure
- [ ] Convert MapManager to React component
- [ ] Convert GymList to React component
- [ ] Convert GymModal to React component
- [ ] Convert API routes to Next.js API routes
- [ ] Migrate Zustand store
- [ ] Add mobile responsive classes
- [ ] Test mobile functionality
- [ ] Add PWA support
- [ ] Deploy and test

## Estimated Timeline

- **Phase 1-2**: 1-2 days (Setup and structure)
- **Phase 3**: 3-4 days (Component conversion)
- **Phase 4**: 1-2 days (API migration)
- **Phase 5**: 1-2 days (Mobile optimization)
- **Phase 6**: 1 day (Deployment)

**Total**: 7-11 days

## Notes

- Keep the existing Express server running during migration
- Can migrate incrementally (hybrid approach)
- Consider using Next.js middleware for API authentication
- Use React Query or SWR for data fetching
- Consider adding React Hook Form for forms

