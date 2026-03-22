import type { ReactNode } from 'react';

// MARK: Section header (Targets / Drones / Humans label + count)
export function SectionHeader({ title, count, suffix, countColor, first }: {
    title: string; count: number; suffix: string; countColor: string; first?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between mb-2 pb-2 border-b border-white/[0.06] ${first ? '' : 'mt-3'}`}>
            <span className="text-white/30 text-[9px] font-black uppercase tracking-[0.15em]">{title}</span>
            <span className={`${countColor} text-[9px] font-mono tabular-nums`}>{count} {suffix}</span>
        </div>
    );
}

// MARK: Row wrapper with optional dismiss button
export function MarkerRow({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
    return (
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/5 px-3 py-2 rounded mb-1 group hover:border-white/10 transition-all">
            {children}
            {onRemove && <button onClick={onRemove} className="text-white/20 hover:text-objective-text text-sm font-bold transition-colors opacity-0 group-hover:opacity-100">✕</button>}
        </div>
    );
}

// MARK: Popup header — color swatch + name
export function PopupHeader({ name, color, shape }: { name: string; color: string; shape?: string }) {
    return (
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
            <div className={`w-3 h-3 ${shape ?? 'rounded-full'}`} style={{ backgroundColor: color }} />
            <b className="text-white/90 text-sm">{name}</b>
        </div>
    );
}

// MARK: Popup remove button
export function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button onClick={onClick}
            className="w-full bg-objective/20 hover:bg-objective/30 text-objective-text py-1.5 rounded font-bold text-[10px] uppercase tracking-wider transition-colors">
            {label}
        </button>
    );
}

// MARK: Empty state hint
export function EmptyHint({ text }: { text: string }) {
    return <p className="text-white/15 text-[10px] italic text-center py-2">{text}</p>;
}
