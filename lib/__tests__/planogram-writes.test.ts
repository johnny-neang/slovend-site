import { describe, it, expect } from "vitest";
import {
  validateEdits,
  buildFullSetPayload,
  diffPlanograms,
  decideStatus,
  describeChanges,
  snapshotSlots,
  PRICE_MAX,
  PAR_MAX,
  MAX_EDITS,
  type SlotEdit,
} from "@/lib/planogram-writes";
import type { Product } from "@/lib/nayax";

/** A planogram row shaped like the ones Lynx really returns, including fields
 * this codebase has no reader for — those must survive a write untouched. */
const row = (mdb: number, price: number, par: number | null = null): Product => ({
  MDBCode: mdb,
  MachinePrice: price,
  PAR: par,
  DEXProductName: null,
  NayaxProductID: 0,
  CurrentQuantity: 5,
  SomeFieldWeDoNotModel: "keep me",
  NestedThing: { a: 1 },
});

const PLANOGRAM = [row(1031, 7), row(769, 8), row(1537, 2, 10)];

describe("validateEdits", () => {
  it("accepts a well-formed price and par edit", () => {
    const { edits, errors } = validateEdits([{ mdb: 1031, newPrice: 7.25, newPar: 12 }]);
    expect(errors).toEqual([]);
    expect(edits).toEqual([{ mdb: 1031, newPrice: 7.25, newPar: 12 }]);
  });

  it("rejects prices outside policy bounds", () => {
    expect(validateEdits([{ mdb: 1031, newPrice: 0 }]).edits).toEqual([]);
    expect(validateEdits([{ mdb: 1031, newPrice: -1 }]).edits).toEqual([]);
    expect(validateEdits([{ mdb: 1031, newPrice: PRICE_MAX + 1 }]).edits).toEqual([]);
  });

  it("rejects sub-cent prices instead of silently rounding them", () => {
    const { edits, errors } = validateEdits([{ mdb: 1031, newPrice: 1.005 }]);
    expect(edits).toEqual([]);
    expect(errors.join(" ")).toMatch(/whole number of cents/i);
  });

  it("rejects non-integer and out-of-range pars", () => {
    expect(validateEdits([{ mdb: 1031, newPar: 2.5 }]).edits).toEqual([]);
    expect(validateEdits([{ mdb: 1031, newPar: -1 }]).edits).toEqual([]);
    expect(validateEdits([{ mdb: 1031, newPar: PAR_MAX + 1 }]).edits).toEqual([]);
  });

  it("allows par 0 — a legitimate way to mark a slot empty", () => {
    expect(validateEdits([{ mdb: 1031, newPar: 0 }]).edits).toEqual([{ mdb: 1031, newPar: 0 }]);
  });

  it("rejects invalid slot codes", () => {
    expect(validateEdits([{ mdb: 0, newPrice: 2 }]).edits).toEqual([]);
    expect(validateEdits([{ mdb: -1, newPrice: 2 }]).edits).toEqual([]);
    expect(validateEdits([{ mdb: 1.5, newPrice: 2 }]).edits).toEqual([]);
  });

  it("drops entries that change nothing", () => {
    expect(validateEdits([{ mdb: 1031 }]).edits).toEqual([]);
    expect(validateEdits([{ mdb: 1031, newPrice: "" }]).edits).toEqual([]);
  });

  it("merges duplicate slots so ordering cannot decide the outcome", () => {
    const { edits } = validateEdits([
      { mdb: 1031, newPrice: 7.25 },
      { mdb: 1031, newPar: 12 },
    ]);
    expect(edits).toEqual([{ mdb: 1031, newPrice: 7.25, newPar: 12 }]);
  });

  it("refuses an oversized batch outright", () => {
    const many = Array.from({ length: MAX_EDITS + 1 }, (_, i) => ({
      mdb: 1000 + i,
      newPrice: 1,
    }));
    const { edits, errors } = validateEdits(many);
    expect(edits).toEqual([]);
    expect(errors.join(" ")).toMatch(/too many/i);
  });

  it("rejects non-list input", () => {
    expect(validateEdits(null).edits).toEqual([]);
    expect(validateEdits("1031").edits).toEqual([]);
  });
});

describe("buildFullSetPayload — the never-drop-a-row invariant", () => {
  it("returns every row even when only one is edited", () => {
    const { payload } = buildFullSetPayload(PLANOGRAM, [{ mdb: 1031, newPrice: 7.25 }]);
    expect(payload).toHaveLength(PLANOGRAM.length);
    expect(payload.map((p) => p.MDBCode).sort((a, b) => Number(a) - Number(b))).toEqual([
      769, 1031, 1537,
    ]);
  });

  it("returns every row when NOTHING is edited (the canary case)", () => {
    const { payload, applied } = buildFullSetPayload(PLANOGRAM, []);
    expect(applied).toEqual([]);
    expect(payload).toEqual(PLANOGRAM);
  });

  it("preserves fields the codebase does not model", () => {
    const { payload } = buildFullSetPayload(PLANOGRAM, [{ mdb: 1031, newPrice: 7.25 }]);
    const edited = payload.find((p) => p.MDBCode === 1031)!;
    expect(edited.SomeFieldWeDoNotModel).toBe("keep me");
    expect(edited.NestedThing).toEqual({ a: 1 });
    expect(edited.NayaxProductID).toBe(0);
  });

  it("changes only the targeted field on the targeted row", () => {
    const { payload } = buildFullSetPayload(PLANOGRAM, [{ mdb: 1031, newPrice: 7.25 }]);
    expect(payload.find((p) => p.MDBCode === 1031)!.MachinePrice).toBe(7.25);
    expect(payload.find((p) => p.MDBCode === 769)!.MachinePrice).toBe(8);
    expect(payload.find((p) => p.MDBCode === 1537)!.MachinePrice).toBe(2);
  });

  it("does not mutate the caller's rows", () => {
    const original = JSON.parse(JSON.stringify(PLANOGRAM));
    buildFullSetPayload(PLANOGRAM, [{ mdb: 1031, newPrice: 99 }]);
    expect(PLANOGRAM).toEqual(original);
  });

  it("writes par independently of price", () => {
    const { payload } = buildFullSetPayload(PLANOGRAM, [{ mdb: 1537, newPar: 20 }]);
    const r = payload.find((p) => p.MDBCode === 1537)!;
    expect(r.PAR).toBe(20);
    expect(r.MachinePrice).toBe(2); // untouched
  });

  it("reports edits that match no row rather than dropping them silently", () => {
    const { applied, unmatched, payload } = buildFullSetPayload(PLANOGRAM, [
      { mdb: 9999, newPrice: 3 },
    ]);
    expect(applied).toEqual([]);
    expect(unmatched).toEqual([9999]);
    expect(payload).toHaveLength(PLANOGRAM.length); // and still sends everything
  });
});

describe("diffPlanograms", () => {
  it("reports identical snapshots as identical", () => {
    expect(diffPlanograms(PLANOGRAM, PLANOGRAM).identical).toBe(true);
  });

  it("detects a changed field", () => {
    const after = PLANOGRAM.map((r) => (r.MDBCode === 1031 ? { ...r, MachinePrice: 7.25 } : r));
    const d = diffPlanograms(PLANOGRAM, after);
    expect(d.identical).toBe(false);
    expect(d.changed).toEqual([
      { mdb: 1031, field: "MachinePrice", before: 7, after: 7.25 },
    ]);
  });

  it("detects a dropped row — the replace-semantics disaster signal", () => {
    const after = PLANOGRAM.filter((r) => r.MDBCode !== 769);
    const d = diffPlanograms(PLANOGRAM, after);
    expect(d.missing).toEqual([769]);
    expect(d.identical).toBe(false);
  });

  it("detects an added row", () => {
    const d = diffPlanograms(PLANOGRAM, [...PLANOGRAM, row(1285, 4)]);
    expect(d.added).toEqual([1285]);
  });

  it("ignores a vend landing mid-write", () => {
    // A sale between our two reads moves stock and the vend-out bit. Reporting
    // that as an unintended mutation would make every write look like a mismatch.
    const after = PLANOGRAM.map((r) =>
      r.MDBCode === 1031
        ? { ...r, CurrentQuantity: 4, SelectionVendOutBit: true, LastVendDateTime: "2026-08-04" }
        : r,
    );
    expect(diffPlanograms(PLANOGRAM, after).identical).toBe(true);
  });
});

describe("diffPlanograms — row loss the MDB index cannot see", () => {
  // Regression: adversarial review found that indexing by MDBCode hides exactly
  // the rows most at risk. Duplicates collapse (last wins) and rows with no code
  // are absent from both sides, so a lossy replace on those rows read as
  // "identical" — the opposite of what this function exists to detect.
  it("catches a dropped duplicate-MDB row via the row count", () => {
    const before = [row(1031, 7), { MDBCode: 0, MachinePrice: 20, Tag: "phantom A" }, { MDBCode: 0, MachinePrice: 20, Tag: "phantom B" }];
    const after = [row(1031, 7), { MDBCode: 0, MachinePrice: 20, Tag: "phantom B" }];
    const d = diffPlanograms(before, after);
    expect(d.identical).toBe(false);
    expect(d.countBefore).toBe(3);
    expect(d.countAfter).toBe(2);
  });

  it("catches a dropped row that has no MDBCode at all", () => {
    const before = [row(1031, 7), { PACode: "A1", MachinePrice: 3 }];
    const after = [row(1031, 7)];
    const d = diffPlanograms(before, after);
    expect(d.identical).toBe(false);
    expect(d.missing).toEqual([]); // invisible to the index — count is the only signal
    expect(d.countBefore).toBe(2);
    expect(d.countAfter).toBe(1);
  });

  it("still reports a true no-op as identical", () => {
    const rows = [row(1031, 7), { MDBCode: 0, MachinePrice: 20 }];
    expect(diffPlanograms(rows, rows).identical).toBe(true);
  });
});

describe("describeChanges", () => {
  it("captures both old and new values for the audit log and revert", () => {
    const edits: SlotEdit[] = [{ mdb: 1537, newPrice: 2.5, newPar: 20 }];
    expect(describeChanges(PLANOGRAM, edits)).toEqual([
      {
        mdb: 1537,
        slot: "601",
        name: "",
        old_price: 2,
        new_price: 2.5,
        old_par: 10,
        new_par: 20,
      },
    ]);
  });
});

describe("decideStatus — a write that never landed must never read as success", () => {
  const someRows = [row(1031, 7)];
  const identicalDiff = {
    identical: true,
    changed: [],
    missing: [],
    added: [],
    countBefore: 1,
    countAfter: 1,
  };
  const intendedDiff = {
    identical: false,
    changed: [{ mdb: 1031, field: "MachinePrice", before: 7, after: 7.25 }],
    missing: [],
    added: [],
    countBefore: 1,
    countAfter: 1,
  };

  // Regression: this branch previously read `changedSomething ? "verified" : "verified"`.
  // A canary payload is a no-op by construction, so it can never set
  // changedSomething — meaning a canary whose PUT never reached Nayax minted the
  // very credential that unlocks slot editing.
  it("reports UNKNOWN when there was no response and nothing changed", () => {
    expect(
      decideStatus({
        httpStatus: 0,
        afterRows: someRows,
        diff: identicalDiff,
        intendedOnly: true,
        changedSomething: false,
      }),
    ).toBe("unknown");
  });

  it("reports VERIFIED with no response only when the intended change is visible", () => {
    expect(
      decideStatus({
        httpStatus: 0,
        afterRows: someRows,
        diff: intendedDiff,
        intendedOnly: true,
        changedSomething: true,
      }),
    ).toBe("verified");
  });

  it("reports UNKNOWN when there was no response and no verification read", () => {
    expect(
      decideStatus({
        httpStatus: 0,
        afterRows: null,
        diff: null,
        intendedOnly: false,
        changedSomething: false,
      }),
    ).toBe("unknown");
  });

  it("reports FAILED for any non-2xx, including a redirect", () => {
    for (const s of [301, 400, 403, 404, 422, 500]) {
      expect(
        decideStatus({
          httpStatus: s,
          afterRows: someRows,
          diff: identicalDiff,
          intendedOnly: true,
          changedSomething: false,
        }),
      ).toBe("failed");
    }
  });

  it("treats an accepted no-op canary as verified", () => {
    expect(
      decideStatus({
        httpStatus: 200,
        afterRows: someRows,
        diff: identicalDiff,
        intendedOnly: true,
        changedSomething: false,
      }),
    ).toBe("verified");
  });

  it("reports MISMATCH when the planogram changed in ways nobody asked for", () => {
    expect(
      decideStatus({
        httpStatus: 200,
        afterRows: someRows,
        diff: { ...identicalDiff, identical: false, missing: [769] },
        intendedOnly: false,
        changedSomething: true,
      }),
    ).toBe("mismatch");
  });

  it("reports APPLIED_UNVERIFIED when accepted but unreadable afterwards", () => {
    expect(
      decideStatus({
        httpStatus: 200,
        afterRows: null,
        diff: null,
        intendedOnly: false,
        changedSomething: false,
      }),
    ).toBe("applied_unverified");
  });
});

describe("snapshotSlots", () => {
  it("keys current price and par by slot, skipping unmapped rows", () => {
    const snap = snapshotSlots([...PLANOGRAM, row(0, 20)]);
    expect(snap.get(1537)).toMatchObject({ price: 2, par: 10, slot: "601" });
    expect(snap.has(0)).toBe(false);
  });
});
