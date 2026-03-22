// MARK: Backend data API — fetch drones, humans; sync player objectives
import { getServer } from './getserver';

const base = () => `${getServer()}api`;

export const fetchDrones = () => fetch(`${base()}/drones`).then(r => r.json());
export const fetchHumans = () => fetch(`${base()}/humans`).then(r => r.json());

// MARK: Comms — tagged communications (civilian, enemy, friend, military)
export const fetchComms = () => fetch(`${base()}/comms`).then(r => r.json());
export const addComm = (tag: string, message: string, sender?: string) =>
  fetch(`${base()}/comms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag, message, sender }),
  }).then(r => r.json());

export const addPlayerTarget = (name: string, coord: [number, number], tag?: string, color?: string) =>
  fetch(`${base()}/player/targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, coord, ...(tag ? { tag } : {}), ...(color ? { color } : {}) }),
  }).then(r => r.json());

export const removePlayerTarget = (name: string) =>
  fetch(`${base()}/player/targets/${encodeURIComponent(name)}`, { method: 'DELETE' })
    .then(r => r.json());

export const updatePlayerPosition = (coord: [number, number]) =>
  fetch(`${base()}/player/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coord }),
  }).then(r => r.json());
