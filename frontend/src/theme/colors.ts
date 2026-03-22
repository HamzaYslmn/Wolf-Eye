// MARK: Centralized color palette — single source of truth
// CSS theme tokens are in index.css @theme{}, JS arrays live here.

// MARK: Objective fill colors
export const OBJECTIVE_FILL = '#ef4444';       // red — threat/enemy
export const FRIENDLY_FILL = '#22c55e';        // green — civilian/airdrop/friendly

// MARK: Drone marker palette (blue family, dynamically assigned by pickColor)
export const DRONE_COLORS = [
    '#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa',
    '#1e40af', '#93c5fd', '#1e3a8a', '#bfdbfe',
    '#172554', '#dbeafe', '#0ea5e9', '#0284c7',
];

// MARK: 3D scene colors (fog, lighting)
export const SCENE = {
    fog: '#0a2638',
    skyLight: '#1a4a6a',
    groundLight: '#0a2818',
    dirLight: '#44aaff',
} as const;

// MARK: HUD accent (for SVG attributes that can't use Tailwind)
export const HUD_DEEP = '#f59e0b';

// MARK: Human marker color (bright amber — visible against dark maps)
export const HUMAN_COLOR = '#fbbf24';

// MARK: Compass north (universal convention, not target-dependent)
export const COMPASS_NORTH = '#ef4444';
