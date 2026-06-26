/**
 * Pure slot ↔ MDBCode conversion. Lives in its own module (no "server-only") so
 * both server code (lib/nayax.ts, server actions) and client components (the
 * Add-slot modal) can share one decoder.
 *
 * The MDBCode packs the machine row in the high byte and the column in the low
 * byte. The human "slot" is the row followed by the column zero-padded to two
 * digits — e.g. MDB 1283 = 0x0503 → row 5, col 3 → "503".
 */

/** Decode an MDBCode to its slot string ("503"), or "—" when there's no slot. */
export function mdbToSlot(code: number): string {
  if (!Number.isInteger(code) || code <= 0) return "—";
  const row = code >> 8; // high byte
  const col = code & 0xff; // low byte
  return `${row}${String(col).padStart(2, "0")}`;
}

/**
 * Encode a slot string ("503") to its MDBCode (1283), or null if invalid.
 * Inverse of mdbToSlot: the last two digits are the column, the rest is the row.
 * Column is capped at 99 because the slot string format uses exactly two digits
 * for the column (a pre-existing constraint of productSlot's padStart(2)).
 */
export function slotToMdb(slot: string): number | null {
  const s = String(slot).trim();
  if (!/^\d{3,}$/.test(s)) return null; // need ≥3 digits: ≥1 row + 2 col
  const col = Number(s.slice(-2));
  const row = Number(s.slice(0, -2));
  if (!Number.isInteger(row) || row < 1 || row > 255) return null; // high byte
  if (!Number.isInteger(col) || col < 0 || col > 99) return null; // low byte (2-digit cap)
  return (row << 8) | col;
}
