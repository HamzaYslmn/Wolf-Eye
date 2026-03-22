// MARK: Get Server URL — uses VITE_API_URL from public.env
export function getServer(): string {
  return import.meta.env.VITE_API_URL || window.location.origin + '/';
}

export default getServer;
