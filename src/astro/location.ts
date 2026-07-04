// Observer location resolution: URL params -> browser geolocation -> default.
// Never blocks rendering: callers start with the fallback and re-orient the
// sky when a better fix arrives (a sky rotation is a cheap live update).

export interface ObserverLocation {
  latDeg: number;
  lonDeg: number;
  source: 'url' | 'geolocation' | 'default';
}

export const DEFAULT_LOCATION: ObserverLocation = {
  latDeg: 52.23, // Warsaw
  lonDeg: 21.01,
  source: 'default',
};

export function locationFromUrl(params: URLSearchParams): ObserverLocation | null {
  const lat = parseFloat(params.get('lat') ?? '');
  const lon = parseFloat(params.get('lon') ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { latDeg: lat, lonDeg: lon, source: 'url' };
  }
  return null;
}

export function requestGeolocation(timeoutMs = 5000): Promise<ObserverLocation | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (loc: ObserverLocation | null) => {
      if (!done) {
        done = true;
        resolve(loc);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({
          latDeg: pos.coords.latitude,
          lonDeg: pos.coords.longitude,
          source: 'geolocation',
        });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { timeout: timeoutMs, maximumAge: 600000 },
    );
  });
}
