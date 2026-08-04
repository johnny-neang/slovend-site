import { describe, it, expect } from "vitest";
import { mdbToSlot, slotToMdb } from "@/lib/slot-code";

describe("mdbToSlot", () => {
  it("decodes row from the high byte and column from the low byte", () => {
    expect(mdbToSlot(1032)).toBe("408"); // 0x0408 -> row 4, col 8
    expect(mdbToSlot(1283)).toBe("503"); // 0x0503 -> row 5, col 3
    expect(mdbToSlot(257)).toBe("101"); // 0x0101 -> row 1, col 1
  });

  it("zero-pads the column to two digits", () => {
    expect(mdbToSlot(256)).toBe("100"); // col 0
    expect(mdbToSlot(265)).toBe("109"); // col 9
    expect(mdbToSlot(266)).toBe("110"); // col 10
  });

  it("returns the em dash for codes that map to no slot", () => {
    // 0 is Lynx's unmapped sentinel and -1 marks a card pre-auth; neither is a
    // physical selection, so neither may render as one.
    expect(mdbToSlot(0)).toBe("—");
    expect(mdbToSlot(-1)).toBe("—");
    expect(mdbToSlot(1.5)).toBe("—");
    expect(mdbToSlot(NaN)).toBe("—");
  });
});

describe("slotToMdb", () => {
  it("encodes the inverse of mdbToSlot", () => {
    expect(slotToMdb("408")).toBe(1032);
    expect(slotToMdb("503")).toBe(1283);
    expect(slotToMdb("101")).toBe(257);
  });

  it("round-trips every real slot on a 6-row, 8-column machine", () => {
    for (let row = 1; row <= 6; row++) {
      for (let col = 1; col <= 8; col++) {
        const slot = `${row}${String(col).padStart(2, "0")}`;
        const code = slotToMdb(slot);
        expect(code).not.toBeNull();
        expect(mdbToSlot(code as number)).toBe(slot);
      }
    }
  });

  it("rejects malformed slots rather than guessing", () => {
    expect(slotToMdb("")).toBeNull();
    expect(slotToMdb("12")).toBeNull(); // needs >= 3 digits
    expect(slotToMdb("4o8")).toBeNull();
    expect(slotToMdb("-101")).toBeNull();
    expect(slotToMdb("001")).toBeNull(); // row 0 is not a machine row
  });

  it("tolerates surrounding whitespace from form input", () => {
    expect(slotToMdb("  503  ")).toBe(1283);
  });
});
