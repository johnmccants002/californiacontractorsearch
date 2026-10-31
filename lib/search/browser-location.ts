export function browserLocationError(code: number) {
  if (code === 1) return "Location permission was denied. Enter a city or ZIP instead, or enable location access in your browser settings.";
  if (code === 3) return "Finding your location took too long. Try again or enter a city or ZIP.";
  return "We couldn't determine your location. Enter a city or ZIP instead.";
}

/** Called only from an explicit button click. No watching, storage, or logging. */
export function getBrowserLocation(geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined, secure = true): Promise<{ lat: string; lng: string }> {
  if (!secure || !geolocation) return Promise.reject(new Error("Your browser can't share a location here. Enter a city or ZIP instead."));
  return new Promise((resolve, reject) => {
    // Also bound browsers that leave a permission prompt unanswered indefinitely.
    const timer = setTimeout(() => reject(new Error(browserLocationError(3))), 12000);
    try {
      geolocation.getCurrentPosition(({ coords }) => {
        clearTimeout(timer);
        if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) {
          reject(new Error(browserLocationError(2))); return;
        }
        // About 110 m latitude precision: don't put unnecessary GPS precision in URLs.
        resolve({ lat: String(Number(coords.latitude.toFixed(3))), lng: String(Number(coords.longitude.toFixed(3))) });
      }, (error) => { clearTimeout(timer); reject(new Error(browserLocationError(error.code))); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    } catch { clearTimeout(timer); reject(new Error(browserLocationError(2))); }
  });
}
