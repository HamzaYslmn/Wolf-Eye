import { useEffect } from 'react';
import type { Map } from 'leaflet';
import { useMapStore } from '@/store/useMapStore';

// MARK: Sync Leaflet map with player position + re-validate on visibility change
// Both DroneMode PlayerMarker and GameMode MinimapSync need this identical logic
// because pages stay mounted (CSS display toggle) and hidden maps go stale.
export function useMapVisibility(map: Map) {
    const pos = useMapStore(s => s.playerPos);

    useEffect(() => {
        map.setView(pos, map.getZoom(), { animate: false });
    }, [map, pos]);

    useEffect(() => {
        const el = map.getContainer();
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) {
                map.invalidateSize();
                map.setView(useMapStore.getState().playerPos, map.getZoom(), { animate: false });
            }
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, [map]);
}
