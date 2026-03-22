// MARK: Click cooldown — blocks MapClickHandler for 300ms after removal
let blocked = false;
export function blockMapClick() {
    blocked = true;
    setTimeout(() => blocked = false, 300);
}
export function isMapClickBlocked() {
    return blocked;
}
