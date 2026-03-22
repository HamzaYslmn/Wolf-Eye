import { useRef, useEffect, useState, useMemo, type KeyboardEvent } from 'react';
import { useAiStore } from '@/store/useAiStore';
import { marked } from 'marked';

// MARK: Configure marked — inline only, no block-level wrapping
marked.use({ breaks: true, gfm: true });

// MARK: Truncate long text to prevent DOM bloat
const MAX_CHAT_LEN = 400;
function truncate(text: string): string {
  return text.length > MAX_CHAT_LEN ? text.slice(0, MAX_CHAT_LEN) + '…' : text;
}

// MARK: ChatPanel — shared between DroneMode & VrMode
export default function ChatPanel({ onOpen, onClose }: { onOpen?: () => void; onClose?: () => void }) {
  const { messages, loading, send } = useAiStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [speechText, setSpeechText] = useState('');
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // MARK: Global Enter key — open chat (only when parent page visible)
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (open) return;
      if (wrapRef.current && !wrapRef.current.offsetWidth) return;
      if (e.key === 'Enter') { e.preventDefault(); setOpen(true); onOpen?.(); }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [open, onOpen]);

  // MARK: Speech Recognition Setup
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let current = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          current += event.results[i][0].transcript;
        }
        transcriptRef.current = current;
        setSpeechText(current);
      };
      
      recognition.onerror = () => setRecording(false);
      recognitionRef.current = recognition;
    }
  }, []);

  // MARK: Speech Recognition Handlers (Requires latest `send` function)
  useEffect(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.onend = () => {
      setRecording(false);
      if (transcriptRef.current.trim() && !loading) {
        send(transcriptRef.current.trim());
      }
      transcriptRef.current = '';
      setSpeechText('');
    };
  }, [send, loading]);

  // MARK: PTT (Push-To-Talk) V Key
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;
      if (e.key.toLowerCase() === 'v' && recognitionRef.current) {
        e.preventDefault();
        try {
          transcriptRef.current = '';
          setSpeechText('');
          recognitionRef.current.start();
          setRecording(true);
        } catch (err) {}
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'v' && recognitionRef.current) {
        e.preventDefault();
        try {
          recognitionRef.current.stop();
        } catch (err) {}
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // MARK: Auto-scroll on new messages
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const close = () => { setOpen(false); setInput(''); onClose?.(); };

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Enter') {
      if (loading) return;
      const msg = input.trim();
      if (!msg) { close(); return; }
      setInput('');
      send(msg);
      close();
    }
  };

  const recent = messages.slice(-4);
  // MARK: Memoize parsed markdown to avoid recomputing on every render
  const parsed = useMemo(() => recent.map(m => m.role === 'ai' ? marked.parse(truncate(m.text), { async: false }) as string : ''), [recent]);
  const probe = <span ref={wrapRef} className="absolute w-px h-px overflow-hidden pointer-events-none opacity-0" />;

  if (!open && recent.length === 0 && !loading && !recording) return probe;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1300] w-[480px] pointer-events-auto">
      {probe}
      {recent.length > 0 && (
        <div ref={logRef} className="mb-2 space-y-1 max-h-40 overflow-y-auto">
          {recent.map((m, i) => (
            <div key={i} className={`text-[10px] leading-relaxed px-3 py-1.5 rounded backdrop-blur-sm font-mono ${
              m.role === 'user'
                ? 'bg-black/50 text-white/50 border border-white/[0.06] ml-16'
                : 'bg-black/60 text-tactical/80 border border-tactical/15 mr-8 chat-md'
            }`}>
              <span className="font-black text-[8px] uppercase tracking-wider opacity-40 mr-1.5">
                {m.role === 'user' ? 'CMD' : 'AI'}
              </span>
              {m.role === 'user'
                ? truncate(m.text)
                : <span dangerouslySetInnerHTML={{ __html: parsed[i] }} />
              }
            </div>
          ))}
          {loading && <div className="text-[10px] text-tactical/40 px-3 py-1.5 font-mono animate-pulse">Processing...</div>}
        </div>
      )}
      {recording && (
        <div className="flex items-center gap-2 bg-red-900/40 backdrop-blur-xl border border-red-500/30 rounded px-3 py-2 mb-2 shadow-[0_0_20px_rgba(239,68,68,0.15)] animate-pulse">
          <span className="text-red-500 text-[10px] font-mono font-black animate-ping">🎤</span>
          <span className="flex-1 bg-transparent text-white/90 text-[11px] font-mono">
            {speechText || "Listening..."}
          </span>
        </div>
      )}
      {open && (
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-xl border border-tactical/20 rounded px-3 py-2 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
          <span className="text-tactical/40 text-[10px] font-mono font-black">▶</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Command..."
            className="flex-1 bg-transparent text-white/80 text-[11px] font-mono outline-none placeholder:text-white/15"
          />
          {loading && <span className="text-tactical/30 text-[9px] font-mono">BUSY</span>}
        </div>
      )}
      {!open && !recording && (
        <div className="text-center text-white/10 text-[9px] font-mono">Press ENTER to type, Hold V to speak</div>
      )}
    </div>
  );
}
