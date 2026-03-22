import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useMapStore } from '@/store/useMapStore';
import { useMapVisibility } from '@/hooks/useMapVisibility';
import { MapClickHandler } from './MapClickHandler';
import { ObjectiveSection, ObjectiveMarkers } from './ObjectiveList';
import { DroneSection, DroneOverlays } from './DroneList';
import { HumanSection, HumanMarkers } from './HumanList';
import ObjectiveDialog from './ObjectiveDialog';
import ChatPanel from '@/components/ChatPanel';
import { useEffect } from 'react';
import L from 'leaflet';

// MARK: Dark tile
const DARK_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// MARK: Player icon — arrow pointing in heading direction
const playerIcon = (hdg: number) => new L.DivIcon({
    className: '',
    html: `<div class="flex items-center justify-center" style="width:32px;height:32px">
<svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${hdg}deg);filter:drop-shadow(0 0 6px var(--color-hud))">
<polygon points="12,2 20,20 12,16 4,20" fill="var(--color-hud)" stroke="white" stroke-width="1.5" opacity="0.9"/>
</svg></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
});

// MARK: Live player marker (follows playerPos + heading from store)
function PlayerMarker() {
    const pos = useMapStore(s => s.playerPos);
    const hdg = useMapStore(s => s.heading);
    const map = useMap();

    useMapVisibility(map);

    useEffect(() => {
        const marker = L.marker(pos, { icon: playerIcon(hdg), interactive: false, zIndexOffset: 1000 });
        marker.addTo(map);
        return () => { marker.remove(); };
    }, [map, pos, hdg]);

    return null;
}

export default function DroneMode() {
    const playerPos = useMapStore(s => s.playerPos);
    const loadFromBackend = useMapStore(s => s.loadFromBackend);

    // MARK: Load drones, humans, objectives from backend on mount
    useEffect(() => { loadFromBackend(); }, [loadFromBackend]);

    return (
        <div className="relative w-full h-screen overflow-hidden bg-page-drone">
            {/* MARK: Sidebar — Command Panel */}
            <div className="absolute top-20 left-4 z-[1000] w-64 bg-black/80 backdrop-blur-xl border border-white/[0.06] rounded-lg p-4 font-mono pointer-events-auto max-h-[75vh] overflow-y-auto shadow-2xl">
                <div className="text-white/50 text-[8px] font-black uppercase tracking-[0.2em] mb-3 pb-2 border-b border-white/[0.06]">Command Panel</div>

                <ObjectiveSection />
                <DroneSection />
                <HumanSection />
            </div>

            {/* MARK: Full-screen map (dark) */}
            <MapContainer center={playerPos} zoom={16} className="w-full h-full z-0 dark-map" zoomControl={false}>
                <TileLayer url={DARK_TILE}
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' />
                <MapClickHandler />
                <ObjectiveMarkers />
                <DroneOverlays />
                <HumanMarkers />
                <PlayerMarker />
            </MapContainer>

            {/* MARK: AI Chat — Enter to open */}
            <ChatPanel />

            {/* MARK: Objective tag dialog — shown after map click */}
            <ObjectiveDialog />
        </div>
    );
}
