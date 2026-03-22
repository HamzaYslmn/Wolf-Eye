import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMapStore } from '@/store/useMapStore';
import { useMapVisibility } from '@/hooks/useMapVisibility';
import { getDistance } from '@/store/geo';
import { Navigation2 } from 'lucide-react';
import { SCENE, COMPASS_NORTH, HUD_DEEP } from '@/theme/colors';
import { useAiStore } from '@/store/useAiStore';
import ChatPanel from '@/components/ChatPanel';

// MARK: Constants
const SENS = 0.3, PITCH_SENS = 0.2, PITCH_LIM = 60;
const FOV = 60, MAP_R = 160, EYE = 1.7, DEG = Math.PI / 180;
const FRAME_MS = 1000 / 60;
const DIRS: [number, string][] = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];

// MARK: Helpers
const fmtAlt = (wy: number) => wy !== 0 ? `${wy > 0 ? '↑' : '↓'}${Math.abs(wy).toFixed(0)}m` : '';
const toLocal = (lat: number, lng: number, oLat: number, oLng: number): [number, number] => [
    (lng - oLng) * 111000 * Math.cos(oLat * DEG),
    -(lat - oLat) * 111000,
];

// MARK: Ground shader — tactical grid with radial glow
const GND_VS = `varying vec2 vW; varying vec2 vL; void main() { vec4 w = modelMatrix*vec4(position,1.); vW=w.xz; vL=position.xz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const GND_FS = `varying vec2 vW; varying vec2 vL; void main() {
    float d=length(vL);
    vec2 g10=abs(fract(vW/10.-.5)-.5)/fwidth(vW/10.);
    float line10=1.-min(min(g10.x,g10.y),1.);
    vec2 g50=abs(fract(vW/50.-.5)-.5)/fwidth(vW/50.);
    float line50=1.-min(min(g50.x,g50.y),1.);
    float fade=smoothstep(600.,20.,d);
    float glow=.035*smoothstep(200.,0.,d);
    float grid=line10*.3+line50*.5;
    gl_FragColor=vec4(.1,.7,.5, (grid*fade+glow));
}`;
const gndMat = new THREE.ShaderMaterial({ vertexShader: GND_VS, fragmentShader: GND_FS, transparent: true, depthWrite: false });

// MARK: Sky dome shader — gradient + horizon glow + stars, all in 3D
const SKY_VS = `varying vec3 vDir;void main(){vec4 w=modelMatrix*vec4(position,1.);vDir=w.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*w;}`;
const SKY_FS = `varying vec3 vDir;void main(){
    vec3 d=normalize(vDir);float h=d.y;
    vec3 hz=vec3(.04,.15,.22),mid=vec3(.02,.06,.12),zen=vec3(.012,.03,.07),bel=vec3(.02,.04,.06);
    vec3 c=mix(hz,mid,smoothstep(.0,.15,h));
    c=mix(c,zen,smoothstep(.1,.6,h));
    c=mix(c,bel,smoothstep(.0,-.1,h));
    c+=vec3(.06,.2,.28)*exp(-h*h*80.)*.2;
    float sf=fract(sin(dot(floor(d*400.),vec3(12.9898,78.233,45.164)))*43758.5453);
    c+=vec3(step(.9995,sf)*smoothstep(.05,.2,h)*(.3+.7*sf));
    gl_FragColor=vec4(c,1.);
}`;
const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false });

// MARK: Camera rig
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
function CameraRig({ wx, wz, hdg, pitch }: { wx: number; wz: number; hdg: number; pitch: number }) {
    const { camera, invalidate } = useThree();
    useEffect(() => {
        camera.position.set(wx, EYE, wz);
        _euler.set(pitch * DEG, -hdg * DEG, 0);
        camera.quaternion.setFromEuler(_euler);
        invalidate();
    }, [wx, wz, hdg, pitch, camera, invalidate]);
    return null;
}

// MARK: Number texture cache (GPU sprite labels, no DOM)
const _texCache = new Map<string, THREE.Texture>();
function nameTex(label: string, color: string) {
    const key = `${label}-${color}`;
    if (_texCache.has(key)) return _texCache.get(key)!;
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 48;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = color;
    const r = 10; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(128 - r, 0); ctx.quadraticCurveTo(128, 0, 128, r); ctx.lineTo(128, 48 - r); ctx.quadraticCurveTo(128, 48, 128 - r, 48); ctx.lineTo(r, 48); ctx.quadraticCurveTo(0, 48, 0, 48 - r); ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.fill();
    ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(label, 64, 26);
    const tex = new THREE.CanvasTexture(cv);
    _texCache.set(key, tex);
    return tex;
}

// MARK: Beacon (3 meshes + label sprite, no DOM)
const ObjBeacon = memo(function ObjBeacon({ x, y, z, color, frameColor, label }: { x: number; y: number; z: number; color: string; frameColor: string; label: string }) {
    const c = useMemo(() => new THREE.Color(color), [color]);
    const fc = useMemo(() => new THREE.Color(frameColor), [frameColor]);
    const tex = useMemo(() => nameTex(label, color), [label, color]);
    const h = Math.max(0.3, Math.abs(y));
    const sign = y >= 0 ? 1 : -1;
    return (
        <group position={[x, 0, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[0.6, 1, 16]} />
                <meshBasicMaterial color={fc} transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, sign * h / 2, 0]}>
                <cylinderGeometry args={[0.06, 0.06, h, 6]} />
                <meshBasicMaterial color={c} transparent opacity={0.5} />
            </mesh>
            <mesh position={[0, sign * h, 0]}>
                <sphereGeometry args={[0.3, 8, 8]} />
                <meshBasicMaterial color={c} />
            </mesh>
            <sprite position={[0, y >= 0 ? h + 1 : 1, 0]} scale={[2, 0.75, 1]}>
                <spriteMaterial map={tex} transparent />
            </sprite>
        </group>
    );
});

// MARK: Drone beacon (diamond at altitude, visible within 500m)
const DRONE_ALT = 50, BOB_AMP = 1.5, BOB_SPEED = 0.8, SPIN_SPEED = 0.4;
const DroneBeacon = memo(function DroneBeacon({ x, z, color, label }: { x: number; z: number; color: string; label: string }) {
    const c = useMemo(() => new THREE.Color(color), [color]);
    const tex = useMemo(() => nameTex(label, color), [label, color]);
    const phase = useMemo(() => Math.random() * Math.PI * 2, []);
    const groupRef = useRef<THREE.Group>(null!);
    const wireRef = useRef<THREE.Mesh>(null!);

    useFrame(({ clock, invalidate }) => {
        const t = clock.getElapsedTime();
        groupRef.current.position.y = DRONE_ALT + Math.sin(t * BOB_SPEED + phase) * BOB_AMP;
        wireRef.current.rotation.y = t * SPIN_SPEED;
        invalidate();
    });

    return (
        <group position={[x, 0, z]}>
            <mesh position={[0, DRONE_ALT / 2, 0]}>
                <cylinderGeometry args={[0.08, 0.08, DRONE_ALT, 4]} />
                <meshBasicMaterial color={c} transparent opacity={0.2} />
            </mesh>
            <group ref={groupRef} position={[0, DRONE_ALT, 0]}>
                <mesh ref={wireRef}>
                    <octahedronGeometry args={[2.5, 0]} />
                    <meshBasicMaterial color={c} transparent opacity={0.6} wireframe />
                </mesh>
                <mesh>
                    <octahedronGeometry args={[1.5, 0]} />
                    <meshBasicMaterial color={c} transparent opacity={0.3} />
                </mesh>
                <sprite position={[0, 4, 0]} scale={[4, 1.5, 1]}>
                    <spriteMaterial map={tex} transparent />
                </sprite>
            </group>
        </group>
    );
});

// MARK: Scene environment — follows camera so ground/sky never end
function SceneEnv() {
    const ref = useRef<THREE.Group>(null!);
    useFrame(({ camera }) => {
        ref.current.position.x = camera.position.x;
        ref.current.position.z = camera.position.z;
    });
    return (
        <group ref={ref}>
            <mesh material={skyMat}>
                <sphereGeometry args={[1800, 32, 16]} />
            </mesh>
            <directionalLight position={[50, 30, -50]} intensity={0.15} color={SCENE.dirLight} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} material={gndMat}>
                <planeGeometry args={[2000, 2000, 1, 1]} />
            </mesh>
        </group>
    );
}

// MARK: Compass strip
const PX_DEG = 3, STRIP_W = 360 * PX_DEG;
const CompassStrip = memo(function CompassStrip({ hdg }: { hdg: number }) {
    const off = -(hdg * PX_DEG);
    return (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-hud/80 z-10" />
            <div className="w-80 h-8 overflow-hidden relative bg-black/60 backdrop-blur-xl border border-white/[0.06] rounded-sm">
                {[-1, 0, 1].map(r => (
                    <div key={r} className="absolute top-0 h-full" style={{ left: off + r * STRIP_W + 160, width: STRIP_W }}>
                        {Array.from({ length: 24 }, (_, i) => {
                            const d = i * 15;
                            return <div key={i} className="absolute flex flex-col items-center" style={{ left: d * PX_DEG, transform: 'translateX(-50%)' }}>
                                <div className="w-px h-2.5 bg-white/30" /><span className="text-white/20 text-[7px] font-mono mt-px">{d}</span>
                            </div>;
                        })}
                        {DIRS.map(([d, l]) => (
                            <div key={l} className="absolute" style={{ left: d * PX_DEG, transform: 'translateX(-50%)', bottom: 2 }}>
                                <span className={`font-mono font-black text-[10px] ${l === 'N' ? 'text-objective-text' : l.length === 1 ? 'text-hud/80' : 'text-white/30'}`}>{l}</span>
                            </div>
                        ))}
                    </div>
                ))}
                <div className="absolute left-1/2 top-0 h-full w-px bg-hud/40 -translate-x-1/2" />
                <div className="absolute top-0 left-0 w-16 h-full bg-gradient-to-r from-black/80 to-transparent" />
                <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-black/80 to-transparent" />
            </div>
            <div className="flex justify-center mt-1">
                <span className="font-mono text-hud/90 font-bold text-sm tabular-nums bg-black/50 px-2 rounded-sm">{hdg.toFixed(0)}°</span>
            </div>
        </div>
    );
});

// MARK: Minimap helpers
function MinimapSync() {
    const map = useMap();
    const hdg = useMapStore(s => s.heading);
    useMapVisibility(map);
    useEffect(() => { map.getContainer().style.transform = `rotate(${-hdg}deg)`; }, [hdg, map]);
    return null;
}
const markerIcon = (color: string, label: string, _dist: number, hdg: number) => new L.DivIcon({
    className: '', iconSize: [10, 10], iconAnchor: [5, 5], html: `
<div class="flex flex-col items-center" style="transform:rotate(${hdg}deg)">
<div class="w-2 h-2 rounded-full border border-white/80" style="background:${color};box-shadow:0 0 4px ${color}"></div>
<div class="bg-black/80 font-mono font-bold text-[7px] text-white/90 px-1 rounded-sm whitespace-nowrap mt-px">${label}</div>
</div>` });

// MARK: Drone minimap icon (diamond shape, white outline for visibility)
const droneMinimapIcon = (color: string, label: string, _dist: number, hdg: number) => new L.DivIcon({
    className: '', iconSize: [10, 10], iconAnchor: [5, 5], html: `
<div class="flex flex-col items-center" style="transform:rotate(${hdg}deg)">
<div class="w-2.5 h-2.5 rotate-45 border border-white" style="background:${color};box-shadow:0 0 6px ${color},0 0 2px #fff"></div>
<div class="bg-black/80 font-mono font-bold text-[7px] px-1 rounded-sm whitespace-nowrap mt-px text-white">${label}</div>
</div>` });

// MARK: Human minimap icon (solid square, white outline)
const humanMinimapIcon = (color: string, label: string, _dist: number, hdg: number) => new L.DivIcon({
    className: '', iconSize: [10, 10], iconAnchor: [5, 5], html: `
<div class="flex flex-col items-center" style="transform:rotate(${hdg}deg)">
<div class="w-2.5 h-2.5 border border-white" style="background:${color};box-shadow:0 0 6px ${color},0 0 2px #fff"></div>
<div class="bg-black/80 font-mono font-bold text-[7px] px-1 rounded-sm whitespace-nowrap mt-px text-white">${label}</div>
</div>` });

// MARK: Pre-computed FOV cone
const FOV_R = MAP_R * 0.78;
const fovA1 = (-FOV - 90) * DEG, fovA2 = (FOV - 90) * DEG;
const fovX1 = MAP_R + FOV_R * Math.cos(fovA1), fovY1 = MAP_R + FOV_R * Math.sin(fovA1);
const fovX2 = MAP_R + FOV_R * Math.cos(fovA2), fovY2 = MAP_R + FOV_R * Math.sin(fovA2);
const FOV_PATH = `M${MAP_R},${MAP_R} L${fovX1},${fovY1} A${FOV_R},${FOV_R} 0 0,1 ${fovX2},${fovY2} Z`;

// MARK: Sense CSS (Q key)
const SENSE_CSS = `@keyframes sense-ring{from{transform:scale(0);opacity:1}to{transform:scale(1);opacity:0}}@keyframes sense-fade{0%,80%{opacity:1}100%{opacity:0}}`;

// ─── Main ─────────────────────────────────────────────
export default function VrMode() {
    const objectives = useMapStore(s => s.objectives);
    const drones = useMapStore(s => s.drones);
    const humans = useMapStore(s => s.humans);
    const pos = useMapStore(s => s.playerPos);
    const hdg = useMapStore(s => s.heading);
    const setPos = useMapStore(s => s.setPlayerPos);
    const setHdg = useMapStore(s => s.setHeading);

    const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, shift: false });
    const [speed, setSpeed] = useState(0.10);
    const [pitch, setPitch] = useState(0);
    const [origin] = useState<[number, number]>(() => [pos[0], pos[1]]);
    const [senseActive, setSenseActive] = useState(false);
    const senseTimer = useRef(0);
    const chatOpen = useRef(false);
    const photo = useAiStore(s => s.photo);
    const photoLabel = useAiStore(s => s.photoLabel);

    // MARK: Inject sense CSS once
    useEffect(() => { const s = document.createElement('style'); s.textContent = SENSE_CSS; document.head.appendChild(s); return () => { document.head.removeChild(s); }; }, []);

    const posRef = useRef(pos); posRef.current = pos;
    const hdgRef = useRef(hdg); hdgRef.current = hdg;

    const [camX, camZ] = useMemo(() => toLocal(pos[0], pos[1], origin[0], origin[1]), [pos, origin]);

    // MARK: WASD
    useEffect(() => {
        const arrowMap: Record<string, string> = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };
        const h = (v: boolean) => (e: KeyboardEvent) => {
            if (chatOpen.current) return;
            const k = arrowMap[e.key.toLowerCase()] ?? e.key.toLowerCase();
            if ('wasd'.includes(k)) setKeys(p => ({ ...p, [k]: v }));
            if (e.key === 'Shift') setKeys(p => ({ ...p, shift: v }));
            if (v && k === 'q' && !senseTimer.current) { setSenseActive(true); senseTimer.current = window.setTimeout(() => { setSenseActive(false); senseTimer.current = 0; }, 5000); }
        };
        const d = h(true), u = h(false);
        addEventListener('keydown', d); addEventListener('keyup', u);
        return () => { removeEventListener('keydown', d); removeEventListener('keyup', u); };
    }, []);

    // MARK: Movement — 60fps cap
    useEffect(() => {
        let raf: number, last = 0;
        const tick = (now: number) => {
            raf = requestAnimationFrame(tick);
            if (now - last < FRAME_MS) return;
            last = now;
            let f = 0, s = 0;
            if (keys.w) f++; if (keys.s) f--;
            if (keys.a) s--; if (keys.d) s++;
            if (f || s) {
                const ms = 0.00005 * (keys.shift ? 0.50 : speed), r = hdgRef.current * DEG, p = posRef.current;
                setPos([p[0] + (f * Math.cos(r) - s * Math.sin(r)) * ms, p[1] + (f * Math.sin(r) + s * Math.cos(r)) * ms]);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [keys, speed, setPos]);

    // MARK: Mouse drag
    const drag = useRef({ on: false, x: 0, y: 0 });
    const onDown = useCallback((e: React.MouseEvent) => { drag.current = { on: true, x: e.clientX, y: e.clientY }; }, []);
    const onMove = useCallback((e: React.MouseEvent) => {
        if (!drag.current.on) return;
        const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
        drag.current.x = e.clientX; drag.current.y = e.clientY;
        setHdg((hdgRef.current + dx * SENS + 360) % 360);
        setPitch(p => Math.max(-PITCH_LIM, Math.min(PITCH_LIM, p - dy * PITCH_SENS)));
    }, [setHdg]);
    const onUp = useCallback(() => { drag.current.on = false; }, []);

    // MARK: Objectives
    const objs = useMemo(() => objectives.map(t => {
        const [wx, wz] = toLocal(t.lat, t.lng, origin[0], origin[1]);
        return { ...t, dist: getDistance(pos[0], pos[1], t.lat, t.lng), wx, wy: t.alt, wz, label: t.name || `OBJ-${t.id}` };
    }), [objectives, pos, origin]);

    // MARK: Drones (minimap + 3D data)
    const drns = useMemo(() => drones.map(d => {
        const [wx, wz] = toLocal(d.lat, d.lng, origin[0], origin[1]);
        return { ...d, dist: getDistance(pos[0], pos[1], d.lat, d.lng), wx, wz, label: d.name || `D-${d.id}` };
    }), [drones, pos, origin]);

    // MARK: Humans (minimap only)
    const hmns = useMemo(() => humans.map(h => ({
        ...h, dist: getDistance(pos[0], pos[1], h.lat, h.lng), label: h.name,
    })), [humans, pos]);

    const senseObjs = useMemo(() => senseActive ? objs.filter(t => t.dist <= 1000) : [], [senseActive, objs]);

    return (
        <div className="relative w-full h-screen overflow-hidden bg-page-vr select-none cursor-crosshair"
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>

            {/* MARK: 3D */}
            <Canvas camera={{ fov: FOV, near: 0.5, far: 2000 }} frameloop="demand" className="absolute inset-0"
                gl={{ antialias: false, powerPreference: 'low-power' }}>
                <CameraRig wx={camX} wz={camZ} hdg={hdg} pitch={pitch} />
                <fog attach="fog" args={[SCENE.fog, 200, 1200]} />
                <SceneEnv />
                <hemisphereLight args={[SCENE.skyLight, SCENE.groundLight, 0.6]} />
                {objs.map(t => t.dist <= 200 ? <ObjBeacon key={t.id} x={t.wx} y={t.wy} z={t.wz} color={t.color} frameColor={t.frameColor} label={t.label} /> : null)}
                {drns.map(d => d.dist <= 500 ? <DroneBeacon key={`db-${d.id}`} x={d.wx} z={d.wz} color={d.color} label={d.label} /> : null)}
            </Canvas>

            {/* MARK: HUD */}
            <CompassStrip hdg={hdg} />
            <div className="absolute inset-0 pointer-events-none z-[900] shadow-[inset_0_0_250px_rgba(0,0,0,0.95),inset_0_0_100px_rgba(0,0,0,0.6)]" />

            {/* MARK: Sense (Q key) */}
            {senseActive && (
                <div className="absolute inset-0 z-[1050] pointer-events-none" style={{ animation: 'sense-fade 5s ease-out forwards' }}>
                    {[0, .35, .7].map((d, i) => (
                        <div key={i} className="absolute rounded-full border-[3px] border-tactical"
                            style={{ width: '120vmax', height: '120vmax', top: '50%', left: '50%', marginTop: '-60vmax', marginLeft: '-60vmax', animation: `sense-ring 1.2s ease-out ${d}s both` }} />
                    ))}
                    {senseObjs.map(t => {
                        const dx = t.wx - camX, dz = t.wz - camZ;
                        const bear = Math.atan2(dx, -dz) / DEG;
                        const rel = ((bear - hdg + 540) % 360) - 180;
                        const rad = rel * DEG;
                        return (
                            <div key={t.id} className="absolute flex flex-col items-center" style={{
                                left: `${50 + Math.sin(rad) * 40}%`, top: `${50 - Math.cos(rad) * 38}%`,
                                transform: 'translate(-50%,-50%)',
                            }}>
                                <div className="w-5 h-5 rotate-45 border-2 animate-pulse"
                                    style={{ borderColor: t.color, background: `${t.color}30`, boxShadow: `0 0 16px ${t.color}, 0 0 4px ${t.color}` }} />
                                <span className="mt-1 font-mono text-[9px] font-black drop-shadow whitespace-nowrap" style={{ color: t.color }}>{t.label}</span>
                                <span className="mt-1 font-mono text-[8px] font-bold tabular-nums drop-shadow" style={{ color: t.color }}>{t.dist.toFixed(0)}m {fmtAlt(t.wy)}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Crosshair — CS:GO style */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1100]">
                <svg width="40" height="40" viewBox="0 0 40 40" className="opacity-90">
                    <rect x="2" y="19" width="14" height="2" className="fill-white" />
                    <rect x="24" y="19" width="14" height="2" className="fill-white" />
                    <rect x="19" y="2" width="2" height="14" className="fill-white" />
                    <rect x="19" y="24" width="2" height="14" className="fill-white" />
                </svg>
            </div>

            {/* Objectives */}
            <div className="absolute top-28 left-4 z-[1200] pointer-events-auto">
                <div className="bg-black/70 backdrop-blur-xl border border-white/[0.05] p-3 rounded font-mono w-48 shadow-2xl">
                    <h2 className="text-hud/40 font-black border-b border-white/[0.05] pb-1.5 mb-2 text-[8px] tracking-[0.2em] uppercase">Objectives</h2>
                    {objs.length === 0
                        ? <div className="text-white/15 italic text-[9px] text-center py-2">No objectives</div>
                        : objs.map(t => (
                            <div key={t.id} className="flex justify-between items-center bg-white/[0.02] px-2 py-1 rounded-sm border-l-2 mb-0.5 text-[9px]" style={{ borderLeftColor: t.color }}>
                                <span className="font-black" style={{ color: t.color }}>{t.label}</span>
                                <span className="text-white/40 tabular-nums">{t.dist.toFixed(0)}m {fmtAlt(t.wy)}</span>
                            </div>
                        ))
                    }
                    <div className="mt-2.5 pt-2 border-t border-white/[0.05]">
                        <div className="text-[7px] text-white/25 font-black uppercase tracking-[0.15em] mb-1">Player</div>
                        <div className="bg-white/[0.02] px-2 py-1.5 rounded-sm text-[9px] space-y-0.5">
                            <div className="flex justify-between"><span className="text-white/30">LAT</span><span className="text-hud/70 tabular-nums">{pos[0].toFixed(5)}</span></div>
                            <div className="flex justify-between"><span className="text-white/30">LNG</span><span className="text-hud/70 tabular-nums">{pos[1].toFixed(5)}</span></div>
                            <div className="flex justify-between"><span className="text-white/30">HDG</span><span className="text-hud/70 tabular-nums">{hdg.toFixed(1)}°</span></div>
                        </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-white/[0.05]">
                        <div className="flex justify-between text-[7px] text-white/25 mb-1 font-black uppercase tracking-[0.15em]">
                            <span>Speed</span><span className="text-hud/60 tabular-nums">{speed.toFixed(2)}</span>
                        </div>
                        <input type="range" min={0.01} max={1} step={0.01} value={speed}
                            onChange={e => setSpeed(Number(e.target.value))} className="w-full h-px accent-hud-deep cursor-pointer" />
                    </div>
                </div>
            </div>

            {/* Coordinates & Heading */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1200] pointer-events-none">
                <div className="bg-black/60 backdrop-blur-sm border border-white/[0.06] rounded px-4 py-1.5 flex items-center gap-3 font-mono">
                    <Navigation2 className="w-3.5 h-3.5 text-hud" style={{ transform: `rotate(${hdg}deg)` }} />
                    <span className="text-white/50 text-[10px] tabular-nums">{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</span>
                    <span className="text-white/10">│</span>
                    <span className="text-hud/80 text-[10px] font-bold tabular-nums">{hdg.toFixed(1)}°</span>
                </div>
            </div>

            {/* MARK: Minimap */}
            <div className="absolute bottom-3 left-3 z-[1200]">
                <div className="relative" style={{ width: MAP_R * 2 + 16, height: MAP_R * 2 + 16 }}>
                    <div className="absolute pointer-events-none z-20" style={{ top: 8, left: 8, width: MAP_R * 2, height: MAP_R * 2, transform: `rotate(${-hdg}deg)` }}>
                        {(['N', 'S', 'E', 'W'] as const).map(d => (
                            <span key={d} style={{
                                position: 'absolute', fontFamily: 'monospace', fontWeight: 900,
                                fontSize: d === 'N' ? 16 : 9, color: d === 'N' ? COMPASS_NORTH : '#ffffff33',
                                textShadow: d === 'N' ? `0 0 8px ${COMPASS_NORTH}, 0 0 20px ${COMPASS_NORTH}80` : 'none',
                                letterSpacing: d === 'N' ? '1px' : '0',
                                transform: `rotate(${hdg}deg)`,
                                ...(d === 'N' ? { top: -2, left: '50%', marginLeft: -6 } :
                                    d === 'S' ? { bottom: 3, left: '50%', marginLeft: -3 } :
                                        d === 'E' ? { right: 5, top: '50%', marginTop: -5 } :
                                            { left: 5, top: '50%', marginTop: -5 }),
                            }}>{d}</span>
                        ))}
                    </div>
                    <svg className="absolute pointer-events-none z-30" style={{ top: 8, left: 8, width: MAP_R * 2, height: MAP_R * 2 }}>
                        <defs><linearGradient id="fov" x1="50%" y1="50%" x2="50%" y2="0%">
                            <stop offset="0%" stopColor={`${HUD_DEEP}40`} />
                            <stop offset="60%" stopColor={`${HUD_DEEP}14`} />
                            <stop offset="100%" stopColor={`${HUD_DEEP}03`} />
                        </linearGradient></defs>
                        <path d={FOV_PATH} fill="url(#fov)" />
                        <line x1={MAP_R} y1={MAP_R} x2={fovX1} y2={fovY1} stroke={`${HUD_DEEP}33`} strokeWidth="1" />
                        <line x1={MAP_R} y1={MAP_R} x2={fovX2} y2={fovY2} stroke={`${HUD_DEEP}33`} strokeWidth="1" />
                    </svg>
                    <div className="rounded-full overflow-hidden border border-white/[0.06] shadow-[0_0_40px_rgba(0,0,0,.9)]"
                        style={{ width: MAP_R * 2, height: MAP_R * 2, position: 'absolute', top: 8, left: 8 }}>
                        <MapContainer center={pos} zoom={16} className="w-full h-full minimap-bw"
                            zoomControl={false} dragging={false} scrollWheelZoom={false}
                            doubleClickZoom={false} keyboard={false} attributionControl={false}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <MinimapSync />
                            {objs.map(t => <Polyline key={`l-${t.id}`} positions={[pos, [t.lat, t.lng]]} pathOptions={{ color: t.color, weight: 1.5, dashArray: '5 3', opacity: 0.5 }} />)}
                            {objs.map(t => <Marker key={t.id} position={[t.lat, t.lng]} icon={markerIcon(t.color, t.label, t.dist, hdg)} />)}
                            {drns.map(d => <Polyline key={`dl-${d.id}`} positions={[pos, [d.lat, d.lng]]} pathOptions={{ color: d.color, weight: 1, dashArray: '3 4', opacity: 0.35 }} />)}
                            {drns.map(d => <Marker key={`d-${d.id}`} position={[d.lat, d.lng]} icon={droneMinimapIcon(d.color, d.label, d.dist, hdg)} />)}
                            {hmns.map(h => <Marker key={`h-${h.id}`} position={[h.lat, h.lng]} icon={humanMinimapIcon(h.color, h.label, h.dist, hdg)} />)}
                        </MapContainer>
                    </div>
                    <div className="absolute w-3 h-3 rounded-full bg-hud border-2 border-white shadow-[0_0_8px_var(--color-hud-deep)] z-40 -translate-x-1/2 -translate-y-1/2"
                        style={{ top: 8 + MAP_R, left: 8 + MAP_R }} />
                </div>
            </div>

            {/* MARK: Camera feed — bottom-right, AI-driven */}
            {photo && (
                <div className="absolute bottom-3 right-3 z-[1200] pointer-events-auto">
                    <div className="bg-black/70 backdrop-blur-xl border border-white/[0.06] rounded overflow-hidden shadow-2xl" style={{ width: 390 }}>
                        <div className="relative" style={{ height: 240 }}>
                            <img src={photo} alt={photoLabel ?? 'Camera'} className="w-full h-full object-cover" />
                            <div className="absolute top-0 inset-x-0 flex justify-between items-center px-3 py-1.5 bg-gradient-to-b from-black/70 to-transparent">
                                <span className="font-mono text-[12px] font-black text-cam-active/80 tracking-wider">{photoLabel ?? 'FEED'}</span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-objective animate-pulse" />
                                    <span className="font-mono text-[10px] font-bold text-objective-text/80">AI</span>
                                </span>
                            </div>
                            <div className="absolute top-3 left-3 w-4 h-4 border-l-2 border-t-2 border-tactical/30" />
                            <div className="absolute top-3 right-3 w-4 h-4 border-r-2 border-t-2 border-tactical/30" />
                            <div className="absolute bottom-3 left-3 w-4 h-4 border-l-2 border-b-2 border-tactical/30" />
                            <div className="absolute bottom-3 right-3 w-4 h-4 border-r-2 border-b-2 border-tactical/30" />
                        </div>
                    </div>
                </div>
            )}

            {/* MARK: AI Command — Enter to open */}
            <ChatPanel onOpen={() => { chatOpen.current = true; setKeys({ w: false, a: false, s: false, d: false, shift: false }); }} onClose={() => { chatOpen.current = false; }} />
        </div>
    );
}
