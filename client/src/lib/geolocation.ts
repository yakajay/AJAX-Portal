export interface ClockLocation { lat: number; lng: number; accuracy: number }

/**
 * Best-effort position for clock-in. Resolves null when geolocation is unavailable, denied or slow, so
 * clocking in still works on networks that don't require a location (the server decides).
 */
export const getLocation = (timeoutMs = 6000): Promise<ClockLocation | null> =>
  new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
