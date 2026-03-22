import { Marker, Popup } from 'react-leaflet';
import { useMapStore, type Objective } from '@/store/useMapStore';
import L from 'leaflet';
import { blockMapClick } from './clickGuard';
import { SectionHeader, MarkerRow, PopupHeader, RemoveBtn, EmptyHint } from './shared';

// MARK: DivIcon factory — small circle (red fill + colored frame) + name below
const icon = (fill: string, frame: string, label: string) => new L.DivIcon({
    className: '',
    html: `<div class="flex flex-col items-center gap-0.5 cursor-pointer">
<div class="w-3.5 h-3.5 rounded-full border-2" style="background:${fill};border-color:${frame};box-shadow:0 0 8px ${fill}"></div>
<div class="bg-black/80 px-1 py-px rounded-sm font-mono font-bold text-[8px] whitespace-nowrap" style="color:${frame}">${label}</div>
</div>`,
    iconSize: [0, 0], iconAnchor: [7, 7],
});

// MARK: Editable coordinate input (dark)
const CoordInput = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <label className="flex items-center gap-1.5">
        <span className="text-white/40 text-[10px] font-bold w-3">{label}</span>
        <input type="number" step="any" defaultValue={value}
            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] font-mono text-white/70 outline-none focus:border-tactical/40" />
    </label>
);

// MARK: Objective list item
const ObjectiveRow = ({ o, onRemove }: { o: Objective; onRemove?: () => void }) => (
    <MarkerRow onRemove={onRemove}>
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-lg border" style={{ backgroundColor: o.color, borderColor: o.frameColor, boxShadow: `0 0 8px ${o.color}` }} />
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
                <span className="text-white/80 font-bold text-[11px] truncate">{o.name}</span>
                {o.tag && <span className="text-[7px] px-1 py-px rounded uppercase tracking-wider" style={{ color: o.color, backgroundColor: o.color + '20', borderColor: o.color + '30' }}>{o.tag}</span>}
            </div>
            <div className="text-white/30 text-[9px] font-mono tabular-nums">x:{o.lat.toFixed(5)} y:{o.alt.toFixed(1)} z:{o.lng.toFixed(5)}</div>
        </div>
    </MarkerRow>
);

// MARK: Objective sidebar section
export function ObjectiveSection() {
    const objectives = useMapStore(s => s.objectives);
    const removeObjective = useMapStore(s => s.removeObjective);
    const remove = (id: string) => { blockMapClick(); removeObjective(id); };

    return (
        <>
            <SectionHeader title="Objectives" count={objectives.length} suffix="active" countColor="text-objective-text/60" first />
            {objectives.length === 0
                ? <EmptyHint text="Click map to add objectives" />
                : objectives.map(o => <ObjectiveRow key={o.id} o={o} onRemove={o.editable ? () => remove(o.id) : undefined} />)
            }
        </>
    );
}

// MARK: Objective map markers (with popups)
export function ObjectiveMarkers() {
    const objectives = useMapStore(s => s.objectives);
    const updateObjective = useMapStore(s => s.updateObjective);
    const removeObjective = useMapStore(s => s.removeObjective);
    const remove = (id: string) => { blockMapClick(); removeObjective(id); };

    return (
        <>
            {objectives.map(o => (
                <Marker key={o.id} position={[o.lat, o.lng]} icon={icon(o.color, o.frameColor, o.tag ? `${o.name} · ${o.tag}` : o.name)}>
                    <Popup className="dark-popup">
                        <PopupHeader name={o.name} color={o.frameColor} />
                        {o.editable && (
                            <div className="flex flex-col gap-1 mb-2">
                                <CoordInput label="x" value={o.lat} onChange={v => updateObjective(o.id, { lat: v })} />
                                <CoordInput label="y" value={o.alt} onChange={v => updateObjective(o.id, { alt: v })} />
                                <CoordInput label="z" value={o.lng} onChange={v => updateObjective(o.id, { lng: v })} />
                            </div>
                        )}
                        {o.editable && <RemoveBtn label="Remove Objective" onClick={() => remove(o.id)} />}
                    </Popup>
                </Marker>
            ))}
        </>
    );
}
