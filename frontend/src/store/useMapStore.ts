import { create } from 'zustand';
import { OBJECTIVE_FILL, DRONE_COLORS, HUMAN_COLOR } from '@/theme/colors';
import { fetchDrones, fetchHumans, addPlayerTarget, removePlayerTarget, updatePlayerPosition } from '@/api/data';

// MARK: Types
export interface Objective {
    id: string;
    lat: number;
    lng: number;
    alt: number;
    name: string;
    tag: string;         // description (e.g. "enemy vehicle", "airdrop", "civilian")
    color: string;       // fill color: red=threat, green=friendly
    frameColor: string;  // border color: yellow = human, blue = drone
    editable: boolean;   // only player objectives are editable
}

export interface SimDrone {
    id: string;
    lat: number;
    lng: number;
    name: string;
    color: string;
    radius: number;
}

export interface Human {
    id: string;
    lat: number;
    lng: number;
    name: string;
    color: string;
}

interface MapState {
    objectives: Objective[];
    drones: SimDrone[];
    humans: Human[];
    playerPos: [number, number];
    heading: number;
    pendingClick: [number, number] | null;  // lat/lng waiting for tag + color
    addObjective: (o: Omit<Objective, 'frameColor' | 'editable'>) => void;
    updateObjective: (id: string, patch: Partial<Pick<Objective, 'lat' | 'lng' | 'alt' | 'name'>>) => void;
    removeObjective: (id: string) => void;
    setPlayerPos: (pos: [number, number]) => void;
    setHeading: (h: number) => void;
    setPendingClick: (pos: [number, number] | null) => void;
    loadFromBackend: () => Promise<void>;
}

// MARK: Store
export const useMapStore = create<MapState>((set, get) => ({
    objectives: [],
    drones: [],
    humans: [],
    playerPos: [39.90490, 32.83498],
    heading: 0,
    pendingClick: null,

    addObjective: (partial) => {
        const s = get();
        const obj: Objective = { ...partial, frameColor: HUMAN_COLOR, editable: true };
        set({ objectives: [...s.objectives, obj] });
        // MARK: Sync to backend — fire & forget
        addPlayerTarget(obj.name, [obj.lat, obj.lng], obj.tag, obj.color);
    },

    updateObjective: (id, patch) => set((s) => ({
        objectives: s.objectives.map(o => o.id === id ? { ...o, ...patch } : o),
    })),

    removeObjective: (id) => {
        const s = get();
        const obj = s.objectives.find(o => o.id === id);
        if (obj?.editable) removePlayerTarget(obj.name);
        set({ objectives: s.objectives.filter(o => o.id !== id) });
    },

    setPlayerPos: (pos) => set({ playerPos: pos }),
    setHeading: (heading) => set({ heading }),
    setPendingClick: (pos) => set({ pendingClick: pos }),

    // MARK: Load drones, humans, player & drone objectives from backend
    loadFromBackend: async () => {
        const [droneData, humanData] = await Promise.all([
            fetchDrones(), fetchHumans(),
        ]);

        const drones: SimDrone[] = droneData.map((d: any, i: number) => ({
            id: d.drone,
            lat: d.current_location[0],
            lng: d.current_location[1],
            name: d.drone,
            color: DRONE_COLORS[i % DRONE_COLORS.length],
            radius: 500,
        }));

        // MARK: Player is the human named "player"
        const playerDoc = humanData.find((h: any) => h.name === 'player');
        const others = humanData.filter((h: any) => h.name !== 'player');

        const humans: Human[] = others.map((h: any) => ({
            id: h.name,
            lat: h.coord[0],
            lng: h.coord[1],
            name: h.name,
            color: HUMAN_COLOR,
        }));

        // MARK: Player objectives — color from DB or default red, yellow frame, editable
        const playerObjs: Objective[] = (playerDoc?.objectives ?? []).map((o: any) => ({
            id: `p-${o.name}`,
            lat: o.coord[0],
            lng: o.coord[1],
            alt: 0,
            name: o.name,
            tag: o.tag ?? '',
            color: o.color || OBJECTIVE_FILL,
            frameColor: HUMAN_COLOR,
            editable: true,
        }));

        // MARK: Drone objectives — color from DB or default red, blue frame, read-only
        const droneObjs: Objective[] = droneData.flatMap((d: any, di: number) =>
            (d.objectives ?? []).map((o: any) => ({
                id: `d-${d.drone}-${o.name}`,
                lat: o.coord[0],
                lng: o.coord[1],
                alt: 0,
                name: o.name,
                tag: o.tag ?? '',
                color: o.color || OBJECTIVE_FILL,
                frameColor: DRONE_COLORS[di % DRONE_COLORS.length],
                editable: false,
            }))
        );

        const coord = playerDoc?.coord ?? [39.90490, 32.83498];
        set({ drones, humans, objectives: [...playerObjs, ...droneObjs], playerPos: coord as [number, number] });
    },
}));

// MARK: Cross-tab sync via BroadcastChannel
const ch = new BroadcastChannel('map_store_sync');
let fromExternal = false;

const getData = () => {
    const { objectives, drones, humans, playerPos, heading } = useMapStore.getState();
    return { objectives, drones, humans, playerPos, heading };
};

ch.onmessage = (e) => {
    fromExternal = true;
    useMapStore.setState(e.data);
    setTimeout(() => fromExternal = false, 0);
};

useMapStore.subscribe(() => {
    if (!fromExternal) ch.postMessage(getData());
});

// MARK: Position sync — debounce: send to backend 2s after player stops moving (≥5m change)
let _lastSent: [number, number] = [0, 0];
let _debounce: ReturnType<typeof setTimeout> | null = null;
const _haversine = (a: [number, number], b: [number, number]) => {
    const R = 6_371_000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
useMapStore.subscribe((state, prev) => {
    if (state.playerPos === prev.playerPos) return;
    if (_haversine(_lastSent, state.playerPos) < 5) return;
    if (_debounce) clearTimeout(_debounce);
    _debounce = setTimeout(() => {
        _lastSent = state.playerPos;
        updatePlayerPosition(state.playerPos);
    }, 2000);
});
