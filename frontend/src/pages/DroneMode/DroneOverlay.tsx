import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { SimDrone } from '@/store/useMapStore';

// MARK: SVG radar template — SMIL animation, zero JS overhead
function radarSvg(color: string): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.style.overflow = 'visible';
    svg.innerHTML = [
        `<circle cx="50" cy="50" r="50" fill="none" stroke="${color}" stroke-width="0.3" stroke-dasharray="2 2" opacity="0.35"/>`,
        `<line x1="50" y1="0" x2="50" y2="100" stroke="${color}" stroke-width="0.15" opacity="0.2"/>`,
        `<line x1="0" y1="50" x2="100" y2="50" stroke="${color}" stroke-width="0.15" opacity="0.2"/>`,
        `<circle cx="50" cy="50" r="25" fill="none" stroke="${color}" stroke-width="0.1" stroke-dasharray="1 2" opacity="0.15"/>`,
        `<g>`,
        `  <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/>`,
        `  <path d="M50,50 L50,0 A50,50 0 0,1 93.3,25 Z" fill="${color}" opacity="0.1"/>`,
        `  <line x1="50" y1="50" x2="50" y2="0" stroke="${color}" stroke-width="0.3" opacity="0.4"/>`,
        `</g>`,
    ].join('');
    return svg;
}

// MARK: Drone icon (diamond)
const droneIcon = (color: string) => L.divIcon({
    className: '',
    html: `<div class="w-3.5 h-3.5 rotate-45 border-2" style="border-color:${color};background:${color}33;box-shadow:0 0 10px ${color},0 0 20px ${color}44"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

const ORBIT_PERIOD = 30; // seconds per full orbit

// MARK: DroneOverlay — radar circle + orbiting drone marker
export default function DroneOverlay({ drone }: { drone: SimDrone }) {
    const map = useMap();
    const rafRef = useRef(0);
    const angleRef = useRef(Math.random() * Math.PI * 2);

    // MARK: Radar SVG overlay
    useEffect(() => {
        const center = L.latLng(drone.lat, drone.lng);
        const bounds = center.toBounds(drone.radius * 2);
        const svg = radarSvg(drone.color);
        const overlay = L.svgOverlay(svg, bounds, { interactive: false });
        overlay.addTo(map);
        return () => { overlay.remove(); };
    }, [map, drone.lat, drone.lng, drone.radius, drone.color]);

    // MARK: Orbiting drone marker (RAF, no React re-renders)
    useEffect(() => {
        const marker = L.marker([drone.lat, drone.lng], {
            icon: droneIcon(drone.color),
            interactive: false,
        });
        marker.addTo(map);

        const speed = (2 * Math.PI) / ORBIT_PERIOD;
        let last = performance.now();

        const tick = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            angleRef.current += speed * dt;

            const rLat = drone.radius / 111000;
            const rLng = drone.radius / (111000 * Math.cos(drone.lat * Math.PI / 180));
            const lat = drone.lat + rLat * Math.cos(angleRef.current);
            const lng = drone.lng + rLng * Math.sin(angleRef.current);
            marker.setLatLng([lat, lng]);
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        return () => { cancelAnimationFrame(rafRef.current); marker.remove(); };
    }, [map, drone.lat, drone.lng, drone.radius, drone.color]);

    return null;
}
