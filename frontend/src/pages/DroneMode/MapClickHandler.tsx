import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { useMapStore } from '@/store/useMapStore';
import { isMapClickBlocked } from './clickGuard';

// MARK: On map click, store pending coords → ObjectiveDialog handles the rest
export function MapClickHandler() {
    const setPending = useMapStore((s) => s.setPendingClick);
    const map = useMap();

    // MARK: Fix Leaflet size after display:none → visible
    useEffect(() => {
        const el = map.getContainer();
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) map.invalidateSize(); });
        obs.observe(el);
        return () => obs.disconnect();
    }, [map]);

    useMapEvents({
        click(e) {
            if (isMapClickBlocked()) return;
            const el = e.originalEvent.target as HTMLElement;
            if (el.closest('.leaflet-popup, .leaflet-marker-icon, .leaflet-marker-pane')) return;
            setPending([e.latlng.lat, e.latlng.lng]);
        },
    });
    return null;
}
