export interface GeoPoint {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceKm(
  center: GeoPoint,
  target: GeoPoint,
): number {
  const dLat = toRadians(target.lat - center.lat);
  const dLon = toRadians(target.lon - center.lon);
  const lat1 = toRadians(center.lat);
  const lat2 = toRadians(target.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c * 10) / 10;
}

export function projectToLocalKm(
  center: GeoPoint,
  target: GeoPoint,
): { dxKm: number; dyKm: number; distKm: number } {
  const dLat = toRadians(target.lat - center.lat);
  const dLon = toRadians(target.lon - center.lon);

  const dyKm = Math.round(EARTH_RADIUS_KM * dLat * 10) / 10;
  const dxKm =
    Math.round(EARTH_RADIUS_KM * Math.cos(toRadians(center.lat)) * dLon * 10) /
    10;
  const distKm = haversineDistanceKm(center, target);

  return { dxKm, dyKm, distKm };
}

export function estimateDriveMinutes(distKm: number): number {
  if (distKm <= 1) return 0;
  return Math.max(5, Math.round(distKm * 1.05 + 2));
}

export function estimateZoneTravelFeePln(distKm: number): number {
  if (distKm <= 2) return 0;
  if (distKm <= 15) return 20;
  if (distKm <= 25) return 25;
  if (distKm <= 45) return 35;
  return Math.round((distKm * 0.9) / 5) * 5;
}
