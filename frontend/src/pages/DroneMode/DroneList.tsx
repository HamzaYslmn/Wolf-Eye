import { Marker, Popup } from 'react-leaflet';
import { useMapStore, type SimDrone } from '@/store/useMapStore';
import L from 'leaflet';
import DroneOverlay from './DroneOverlay';
import { SectionHeader, MarkerRow, PopupHeader, EmptyHint } from './shared';

// MARK: Drone center icon (diamond + name label below)
const droneIcon = (color: string, label: string) => new L.DivIcon({
    className: '',
    html: `<div class="flex flex-col items-center gap-0.5 cursor-pointer">
<div class="w-2.5 h-2.5 rotate-45 border-2" style="border-color:${color};background:${color}44;box-shadow:0 0 8px ${color}"></div>
<div class="bg-black/80 px-1 py-px rounded-sm font-mono font-bold text-[8px] whitespace-nowrap" style="color:${color}">${label}</div>
</div>`,
    iconSize: [0, 0], iconAnchor: [7, 7],
});

// MARK: Drone list item (read-only — loaded from backend)
const DroneRow = ({ d }: { d: SimDrone }) => (
    <MarkerRow>
        <div className="w-2.5 h-2.5 rotate-45 flex-shrink-0 border-2" style={{ borderColor: d.color, boxShadow: `0 0 8px ${d.color}` }} />
        <div className="flex-1 min-w-0">
            <div className="text-white/80 font-bold text-[11px] truncate">{d.name}</div>
            <div className="text-white/30 text-[9px] font-mono tabular-nums">{d.radius}m radius</div>
        </div>
    </MarkerRow>
);

// MARK: Drone sidebar section (read-only)
export function DroneSection() {
    const drones = useMapStore(s => s.drones);

    return (
        <>
            <SectionHeader title="Drones" count={drones.length} suffix="active" countColor="text-drone/60" />
            {drones.length === 0
                ? <EmptyHint text="No drones loaded" />
                : drones.map(d => <DroneRow key={d.id} d={d} />)
            }
        </>
    );
}

// MARK: Drone map overlays (radar + center marker with popup, read-only)
export function DroneOverlays() {
    const drones = useMapStore(s => s.drones);

    return (
        <>
            {drones.map(d => (
                <DroneOverlay key={`ov-${d.id}`} drone={d} />
            ))}
            {drones.map(d => (
                <Marker key={d.id} position={[d.lat, d.lng]} icon={droneIcon(d.color, d.name)}>
                    <Popup className="dark-popup">
                        <PopupHeader name={d.name ?? ''} color={d.color} shape="rotate-45" />
                        <div className="text-white/40 text-[10px] font-mono mb-1">
                            {d.lat.toFixed(5)}, {d.lng.toFixed(5)}
                        </div>
                        <div className="text-white/40 text-[10px] font-mono">
                            Search radius: {d.radius}m
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}
