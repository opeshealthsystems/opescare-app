/**
 * Builds the URL of the finder's embeddable Leaflet map (/embed/map) from a set
 * of facilities. The map is served same-origin with the API, so the web build
 * (iframe) and native build (WebView) both load real OpenStreetMap tiles + in-app
 * directions without ever leaving the app — no external maps app, no Google key.
 */
import { API_BASE_URL } from './api/endpoints';

export type MapFacility = {
  id?: string | number | null;
  name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  city?: string | null;
  region?: string | null;
  type?: string | null;
  phone?: string | null;
  distance?: number | null;
};

/** Origin of the finder web host, derived from the API base (strips a trailing /api). */
export function finderOrigin(): string {
  const base = (API_BASE_URL || 'https://finder.opescare.cloud/api').replace(/\/api\/?$/, '');
  return base || 'https://finder.opescare.cloud';
}

/**
 * @returns the /embed/map URL for these facilities, or null if none have coords.
 */
export type MapVariant = 'thumbnail' | 'full';

export function embedMapUrl(
  facilities: MapFacility[] | MapFacility | null | undefined,
  opts?: { directions?: boolean; variant?: MapVariant },
): string | null {
  const list = Array.isArray(facilities) ? facilities : facilities ? [facilities] : [];
  const points = list
    .map((f) => {
      const lat = f?.latitude != null ? Number(f.latitude) : NaN;
      const lng = f?.longitude != null ? Number(f.longitude) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: f.id != null ? String(f.id) : undefined,
        name: f.name ?? undefined,
        lat,
        lng,
        city: f.city ?? f.region ?? undefined,
        type: f.type ?? undefined,
        phone: f.phone ?? undefined,
        distance: typeof f.distance === 'number' ? f.distance : undefined,
      };
    })
    .filter(Boolean);

  if (points.length === 0) return null;

  const params = new URLSearchParams();
  params.set('markers', JSON.stringify(points));
  if (opts?.directions) params.set('directions', '1');
  // A thumbnail shows where a place is; it is not a map you drive. The embed
  // drops its zoom / locate controls entirely for `static`, and moves them out
  // of the top-left corner otherwise, where the app floats its own chip.
  if (opts?.variant === 'thumbnail') params.set('ui', 'static');
  else params.set('controls', 'topright');
  // A locale hint so the map's popups/labels match the app.
  return `${finderOrigin()}/embed/map?${params.toString()}`;
}
