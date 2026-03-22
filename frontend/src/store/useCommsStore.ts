// MARK: Comms Store — fetches once, cycles display every 3s, flash sent messages
import { create } from 'zustand';
import { fetchComms, addComm } from '@/api/data';

export interface Comm {
  tag: string;   // civilian | enemy | friend | military
  from: string;
  message: string;
  timestamp: string;
}

interface CommsState {
  comms: Comm[];
  current: number;
  flash: Comm[];         // recently sent — visible for a few seconds then removed
  started: boolean;
  start: () => void;
  stop: () => void;
  sendComm: (tag: string, message: string, sender?: string) => Promise<void>;
}

let cycleTimer: ReturnType<typeof setInterval> | null = null;

export const useCommsStore = create<CommsState>((set, get) => ({
  comms: [],
  current: 0,
  flash: [],
  started: false,

  // MARK: Fetch once + cycle displayed message every 3s
  start: () => {
    if (get().started) return;
    set({ started: true });

    fetchComms()
      .then((data: Comm[]) => set({ comms: data }))
      .catch(() => {});

    cycleTimer = setInterval(() => {
      const { comms, current } = get();
      if (comms.length > 0) set({ current: (current + 1) % comms.length });
    }, 3000);
  },

  stop: () => {
    if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
    set({ started: false });
  },

  // MARK: Send + flash — appears for 5s then fades
  sendComm: async (tag, message, sender) => {
    const result = await addComm(tag, message, sender);
    const comm: Comm = { tag: result.tag, from: result.from, message: result.message, timestamp: result.timestamp };
    set(s => ({ flash: [...s.flash, comm] }));
    setTimeout(() => {
      set(s => ({ flash: s.flash.filter(c => c !== comm) }));
    }, 5000);
  },
}));
