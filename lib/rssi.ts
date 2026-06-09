/**
 * Cellular RSSI quality bands for the Overview signal trend.
 *
 * Nayax's Lynx "LastReceptionLevel(RSSI)" is the 3GPP AT+CSQ index (0–31, where
 * bigger is better; 99 = "not known / not detectable", i.e. offline — NOT a real
 * measurement). Source: Nayax VPOS RSSI guide ("values 1 to 31 … instead of
 * dBm") + 3GPP TS 27.007 §8.5. If a reading is ever already in dBm it will be
 * negative (closer to 0 = stronger); convert with dBm = -113 + 2*CSQ.
 *
 * Bands below are the verified consensus (Nayax guide + M2MSupport CSQ bands +
 * Digi/Teltonika 2G/3G RSSI convention). Healthy = CSQ ≥ 15 (~-85 dBm);
 * investigate the antenna/location below ~10.
 */

export type RssiScale = "csq" | "dbm";
export type QualityBand = { quality: string; min: number; max: number; color: string };

/** Sentinel Nayax/modems send when there is no usable signal. */
export const RSSI_UNKNOWN = 99;

/** CSQ index bands (0–31). Ordered strongest → weakest. */
export const CSQ_BANDS: QualityBand[] = [
  { quality: "Excellent", min: 20, max: 31, color: "#15803d" },
  { quality: "Good", min: 15, max: 19, color: "#84cc16" },
  { quality: "Fair", min: 10, max: 14, color: "#f59e0b" },
  { quality: "Poor", min: 2, max: 9, color: "#ef4444" },
  { quality: "No signal", min: 0, max: 1, color: "#991b1b" },
];

/** dBm bands (used only if a reading is already negative). Strongest → weakest. */
export const DBM_BANDS: QualityBand[] = [
  { quality: "Excellent", min: -69, max: -40, color: "#15803d" },
  { quality: "Good", min: -83, max: -70, color: "#84cc16" },
  { quality: "Fair", min: -95, max: -84, color: "#f59e0b" },
  { quality: "Poor", min: -109, max: -96, color: "#ef4444" },
  { quality: "No signal", min: -120, max: -110, color: "#991b1b" },
];

/** Fixed chart y-domain per scale so bands carry absolute meaning. */
export const CSQ_DOMAIN = { min: 0, max: 31 };
export const DBM_DOMAIN = { min: -113, max: -51 };

/** 99 (or null) is the AT+CSQ "unknown / not detectable" sentinel — treat as offline. */
export function isUnknownRssi(v: number | null | undefined): boolean {
  return v == null || v === RSSI_UNKNOWN;
}

/** Detect scale from observed values: any negative ⇒ dBm, otherwise CSQ index. */
export function rssiScaleOf(values: number[]): RssiScale {
  return values.some((v) => v < 0) ? "dbm" : "csq";
}

export function rssiBands(scale: RssiScale): QualityBand[] {
  return scale === "dbm" ? DBM_BANDS : CSQ_BANDS;
}

export function rssiDomain(scale: RssiScale): { min: number; max: number } {
  return scale === "dbm" ? DBM_DOMAIN : CSQ_DOMAIN;
}

/** Classify a single reading into its quality band (null if unknown/offline). */
export function rssiQuality(value: number, scale: RssiScale): QualityBand | null {
  if (isUnknownRssi(value)) return null;
  const bands = rssiBands(scale);
  for (const b of bands) if (value >= b.min && value <= b.max) return b;
  // Out of band range: clamp to the nearest end (strongest first in the array).
  if (scale === "csq") return value > 31 ? bands[0] : bands[bands.length - 1];
  return value > -40 ? bands[0] : bands[bands.length - 1];
}

export function csqToDbm(csq: number): number {
  return -113 + 2 * csq;
}

export const RSSI_UNIT: Record<RssiScale, string> = { csq: "CSQ", dbm: "dBm" };
