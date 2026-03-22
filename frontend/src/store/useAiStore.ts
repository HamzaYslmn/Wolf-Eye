// MARK: AI Chat Store — message history + camera feed from AI
import { create } from 'zustand';
import { askAI } from '@/api/ai';

interface Attachment { type: 'image' | 'audio' | 'file'; data: string; label: string }
interface Msg { role: 'user' | 'ai'; text: string }

interface AiState {
  messages: Msg[];
  loading: boolean;
  photo: string | null;
  photoLabel: string | null;
  send: (text: string) => Promise<void>;
  clear: () => void;
}

// MARK: Parse standardized response { text, attachments? }
function parseResponse(raw: string): { text: string; attachments: Attachment[] } {
  try {
    const data = JSON.parse(raw);
    if (data.text && typeof data.text === 'string') {
      return { text: data.text, attachments: Array.isArray(data.attachments) ? data.attachments : [] };
    }
    // Fallback: non-standard JSON — stringify clean
    const clean = JSON.stringify(data, null, 2);
    return { text: clean.length > 500 ? clean.slice(0, 500) + '…' : clean, attachments: [] };
  } catch {
    return { text: raw.length > 500 ? raw.slice(0, 500) + '…' : raw, attachments: [] };
  }
}

export const useAiStore = create<AiState>((set) => ({
  messages: [],
  loading: false,
  photo: null,
  photoLabel: null,

  send: async (text) => {
    if (useAiStore.getState().loading) return;
    set(s => ({ messages: [...s.messages, { role: 'user', text }], loading: true }));
    try {
      const result = await askAI(text);
      const { text: chatText, attachments } = parseResponse(result);
      const img = attachments.find(a => a.type === 'image');
      set(s => ({
        messages: [...s.messages, { role: 'ai', text: chatText }],
        loading: false,
        ...(img ? { photo: img.data, photoLabel: img.label } : {}),
      }));
    } catch (e) {
      set(s => ({ messages: [...s.messages, { role: 'ai', text: `Error: ${e}` }], loading: false }));
    }
  },

  clear: () => set({ messages: [], photo: null, photoLabel: null }),
}));
