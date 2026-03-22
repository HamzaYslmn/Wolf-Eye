import { Marker, Popup } from 'react-leaflet';
import { useMapStore, type Human } from '@/store/useMapStore';
import L from 'leaflet';
import { SectionHeader, MarkerRow, PopupHeader, EmptyHint } from './shared';

// MARK: Human icon (small rounded square + name label below)
const humanIcon = (color: string, label: string) => new L.DivIcon({
    className: '',
    html: `<div class="flex flex-col items-center gap-0.5 cursor-pointer">
<div class="w-3.5 h-3.5 rounded-sm border-2 border-white/85" style="background:${color};box-shadow:0 0 8px ${color}"></div>
<div class="bg-black/80 px-1 py-px rounded-sm font-mono font-bold text-[8px] whitespace-nowrap" style="color:${color}">${label}</div>
</div>`,
    iconSize: [0, 0], iconAnchor: [7, 7],
});

// MARK: Human list item
const HumanRow = ({ h }: { h: Human }) => (
    <MarkerRow>
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 shadow-lg" style={{ backgroundColor: h.color, boxShadow: `0 0 8px ${h.color}` }} />
        <div className="flex-1 min-w-0">
            <div className="text-white/80 font-bold text-[11px] truncate">{h.name}</div>
            <div className="text-white/30 text-[9px] font-mono tabular-nums">{h.lat.toFixed(5)}, {h.lng.toFixed(5)}</div>
        </div>
    </MarkerRow>
);

// MARK: Human sidebar section
export function HumanSection() {
    const humans = useMapStore(s => s.humans);

    return (
        <>
            <SectionHeader title="Humans" count={humans.length} suffix="detected" countColor="text-human/60" />
            {humans.length === 0
                ? <EmptyHint text="No humans detected" />
                : humans.map(h => <HumanRow key={h.id} h={h} />)
            }
        </>
    );
}

// MARK: Human map markers
export function HumanMarkers() {
    const humans = useMapStore(s => s.humans);

    return (
        <>
            {humans.map(h => (
                <Marker key={h.id} position={[h.lat, h.lng]} icon={humanIcon(h.color, h.name)}>
                    <Popup className="dark-popup">
                        <PopupHeader name={h.name} color={h.color} shape="rounded-sm" />
                        <div className="text-white/40 text-[10px] font-mono">
                            {h.lat.toFixed(5)}, {h.lng.toFixed(5)}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}
