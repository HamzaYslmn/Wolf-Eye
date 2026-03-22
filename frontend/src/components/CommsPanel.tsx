// MARK: CommsPanel — top-right ticker cycling tagged communications every 3s
import { useEffect } from 'react';
import { useCommsStore, type Comm } from '@/store/useCommsStore';
import { Radio, Send } from 'lucide-react';

// MARK: Tag colors — visual distinction for comm sources
const TAG_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  civilian: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', dot: 'bg-blue-400' },
  enemy:    { bg: 'bg-red-500/10',  text: 'text-red-400',  border: 'border-red-500/20',  dot: 'bg-red-400' },
  friend:   { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', dot: 'bg-green-400' },
  military: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-400' },
};
const DEFAULT_TAG = { bg: 'bg-white/5', text: 'text-white/60', border: 'border-white/10', dot: 'bg-white/40' };

function tagStyle(tag: string) {
  return TAG_COLORS[tag.toLowerCase()] ?? DEFAULT_TAG;
}

function CommMessage({ comm, sent }: { comm: Comm; sent?: boolean }) {
  const s = tagStyle(comm.tag);
  return (
    <div className={`${s.bg} border ${s.border} rounded px-3 py-2 transition-all duration-500 ${sent ? 'animate-pulse ring-1 ring-tactical/30' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${sent ? '' : 'animate-pulse'}`} />
          <span className={`font-mono text-[10px] font-black uppercase tracking-wider ${s.text}`}>{comm.from}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {sent && <Send className="w-2.5 h-2.5 text-tactical" />}
          <span className={`font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>
            {sent ? 'SENT' : comm.tag}
          </span>
        </div>
      </div>
      <p className="font-mono text-[10px] text-white/70 leading-relaxed line-clamp-2">{comm.message}</p>
    </div>
  );
}

export default function CommsPanel() {
  const comms = useCommsStore(s => s.comms);
  const current = useCommsStore(s => s.current);
  const flash = useCommsStore(s => s.flash);
  const start = useCommsStore(s => s.start);
  const stop = useCommsStore(s => s.stop);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  if (comms.length === 0 && flash.length === 0) return null;

  // MARK: Show current + previous 2 messages (latest visible)
  const visible: Comm[] = [];
  for (let i = 0; i < Math.min(3, comms.length); i++) {
    const idx = (current - i + comms.length) % comms.length;
    visible.push(comms[idx]);
  }

  return (
    <div className="absolute top-20 right-3 z-[1200] pointer-events-none w-72">
      <div className="bg-black/60 backdrop-blur-md border border-white/[0.06] rounded-lg overflow-hidden shadow-2xl pointer-events-auto">
        {/* MARK: Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
          <Radio className="w-3.5 h-3.5 text-tactical animate-pulse" />
          <span className="font-mono text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Comms</span>
          <span className="ml-auto font-mono text-[8px] text-white/20 tabular-nums">{current + 1}/{comms.length}</span>
        </div>

        <div className="p-2 flex flex-col gap-1.5">
          {/* MARK: Flash sent messages — visible for 5s */}
          {flash.map((c, i) => (
            <CommMessage key={`sent-${i}-${c.timestamp}`} comm={c} sent />
          ))}

          {/* MARK: Cycling messages */}
          {visible.map((c, i) => (
            <div key={`${c.timestamp}-${c.from}`} style={{ opacity: 1 - i * 0.3 }}>
              <CommMessage comm={c} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
