/**
 * Geographic utility — Haversine distance, ETA estimation, midpoint calculation.
 * No external dependencies.
 *
 * Default avg speed: 30 km/h (urban India delivery average).
 * Traffic multiplier: 1.35 (Delhi congestion factor).
 */

const EARTH_RADIUS_KM = 6371;
const DEFAULT_AVG_SPEED_KMH = 30;
const DEFAULT_TRAFFIC_MULTIPLIER = 1.35;

/**
 * Haversine distance between two lat/lng points in kilometres.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number} Distance in km
 */
function haversineDistance(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Estimate delivery time in minutes.
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @param {object} [opts]
 * @param {number} [opts.avgSpeedKmh] - Average speed (default 30)
 * @param {number} [opts.trafficMultiplier] - Congestion factor (default 1.35)
 * @returns {{ distanceKm: number, travelMinutes: number, etaLabel: string }}
 */
function estimateETA(from, to, opts = {}) {
  const avgSpeed = opts.avgSpeedKmh || DEFAULT_AVG_SPEED_KMH;
  const traffic = opts.trafficMultiplier || DEFAULT_TRAFFIC_MULTIPLIER;

  const straightLine = haversineDistance(from, to);
  const roadDistance = straightLine * 1.35; // road is ~35% longer than straight line
  const travelMinutes = Math.round((roadDistance / avgSpeed) * 60 * traffic);

  return {
    distanceKm: Math.round(roadDistance * 10) / 10,
    travelMinutes,
    etaLabel: formatMinutes(travelMinutes),
  };
}

/**
 * Format minutes into a human-readable label.
 * @param {number} minutes
 * @returns {string}
 */
function formatMinutes(minutes) {
  if (minutes < 1) return 'Arriving now';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Calculate the midpoint between two coordinates (for initial map center).
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {{ lat: number, lng: number }}
 */
function midpoint(a, b) {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

/**
 * Interpolate a position between two points (for smooth animation).
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @param {number} t - Progress 0..1
 * @returns {{ lat: number, lng: number }}
 */
function interpolate(from, to, t) {
  const clamp = Math.max(0, Math.min(1, t));
  return {
    lat: from.lat + (to.lat - from.lat) * clamp,
    lng: from.lng + (to.lng - from.lng) * clamp,
  };
}

module.exports = {
  haversineDistance,
  estimateETA,
  formatMinutes,
  midpoint,
  interpolate,
};
