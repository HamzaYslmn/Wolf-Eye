// MARK: Shared geo utilities — haversine, bearing, cardinal

const RAD = Math.PI / 180;

/** Haversine distance in meters */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const dPhi = (lat2 - lat1) * RAD;
    const dLam = (lon2 - lon1) * RAD;
    const a = Math.sin(dPhi / 2) ** 2
        + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLam / 2) ** 2;
    return 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


