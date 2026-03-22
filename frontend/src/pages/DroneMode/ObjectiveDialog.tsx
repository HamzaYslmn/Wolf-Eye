// MARK: ObjectiveDialog — tag + color picker shown after map click
import { useState, useRef, useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { OBJECTIVE_FILL, FRIENDLY_FILL } from '@/theme/colors';
import { Crosshair, Heart } from 'lucide-react';

const COLORS = [
  { value: OBJECTIVE_FILL, label: 'Threat', icon: Crosshair, cls: 'border-red-500 bg-red-500/20 text-red-400' },
  { value: FRIENDLY_FILL, label: 'Friendly', icon: Heart, cls: 'border-green-500 bg-green-500/20 text-green-400' },
] as const;

export default function ObjectiveDialog() {
  const pending = useMapStore(s => s.pendingClick);
  const setPending = useMapStore(s => s.setPendingClick);
  const addObjective = useMapStore(s => s.addObjective);

  const [tag, setTag] = useState('');
  const [color, setColor] = useState(OBJECTIVE_FILL);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending) { setTag(''); setColor(OBJECTIVE_FILL); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [pending]);

  if (!pending) return null;

  const submit = () => {
    addObjective({
      id: crypto.randomUUID(),
      lat: pending[0],
      lng: pending[1],
      alt: 0,
      name: `OBJ-${Math.floor(Math.random() * 1000)}`,
      tag,
      color,
    });
    setPending(null);
  };

  const cancel = () => setPending(null);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-auto" onClick={cancel}>
      <div className="bg-black/90 backdrop-blur-xl border border-white/[0.08] rounded-lg p-4 w-72 shadow-2xl font-mono"
        onClick={e => e.stopPropagation()}>
        {/* MARK: Header */}
        <div className="text-white/50 text-[8px] font-black uppercase tracking-[0.2em] mb-3 pb-2 border-b border-white/[0.06]">
          New Objective
        </div>

        {/* MARK: Coords */}
        <div className="text-white/30 text-[9px] tabular-nums mb-3">
          {pending[0].toFixed(6)}, {pending[1].toFixed(6)}
        </div>

        {/* MARK: Tag input */}
        <input ref={inputRef} type="text" value={tag} onChange={e => setTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); }}
          placeholder="Tag (e.g. enemy vehicle, airdrop, civilian)"
          className="w-full bg-white/[0.06] border border-white/[0.08] rounded px-3 py-2 text-[11px] text-white/80 placeholder-white/20 outline-none focus:border-tactical/40 mb-3" />

        {/* MARK: Color selection */}
        <div className="flex gap-2 mb-4">
          {COLORS.map(c => (
            <button key={c.value} onClick={() => setColor(c.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded border-2 text-[10px] font-bold uppercase tracking-wider transition-all ${color === c.value ? c.cls : 'border-white/10 bg-white/[0.03] text-white/30 hover:border-white/20'}`}>
              <c.icon className="w-3 h-3" /> {c.label}
            </button>
          ))}
        </div>

        {/* MARK: Actions */}
        <div className="flex gap-2">
          <button onClick={cancel} className="flex-1 py-2 rounded bg-white/[0.06] text-white/40 text-[10px] font-bold uppercase tracking-wider hover:bg-white/[0.1] transition-colors">
            Cancel
          </button>
          <button onClick={submit} className="flex-1 py-2 rounded font-bold text-[10px] uppercase tracking-wider transition-colors"
            style={{ backgroundColor: color + '30', color, borderColor: color + '50' }}>
            Mark
          </button>
        </div>
      </div>
    </div>
  );
}
