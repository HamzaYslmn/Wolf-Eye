import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import './index.css';
import DroneMode from './pages/DroneMode';
import VrMode from './pages/VrMode';
import CommsPanel from './components/CommsPanel';
import { Navigation2, Crosshair } from 'lucide-react';

// MARK: Tab-style navigation menu
function Nav() {
  const { pathname } = useLocation();
  const tab = (to: string, label: string, Icon: typeof Crosshair, active: string, hover: string) => (
    <Link to={to} className={`flex items-center gap-2 px-6 py-2 rounded-full font-mono text-sm font-bold transition-all ${pathname === to ? active : `text-slate-400 ${hover}`}`}>
      <Icon className="w-4 h-4" /> {label}
    </Link>
  );

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto">
      <div className="flex gap-1 bg-black/60 backdrop-blur-md border border-drone/30 p-1 rounded-full">
        {tab('/', 'DRONE', Crosshair, 'bg-drone/20 text-drone border border-drone/30', 'hover:text-drone-muted hover:bg-white/5')}
        {tab('/vr', 'VR', Navigation2, 'bg-hud/20 text-hud border border-hud/30', 'hover:text-hud hover:bg-white/5')}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <CommsPanel />
      <AppPages />
    </BrowserRouter>
  );
}

// MARK: Both pages stay mounted — CSS visibility toggle prevents reload
function AppPages() {
  const { pathname } = useLocation();
  return (
    <>
      <div style={{ display: pathname === '/' ? 'contents' : 'none' }}><DroneMode /></div>
      <div style={{ display: pathname === '/vr' ? 'contents' : 'none' }}><VrMode /></div>
    </>
  );
}
