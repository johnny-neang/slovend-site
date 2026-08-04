import { describe, it, expect } from "vitest";
import { saleMdbCode, saleSlot, isAuthNoise, type Sale } from "@/lib/nayax";

/** Lynx labels every planogram row "Unknown(<mdb> = <price>)" when no catalog
 * product is attached — which is currently the case for every slot on 399448903. */
const label = (text: string, amount: number): Sale => ({
  ProductName: text,
  SettlementValue: amount,
});

describe("saleMdbCode", () => {
  it("prefers an explicit MDB field when Lynx provides one", () => {
    expect(saleMdbCode({ MDBCode: 1032, ProductName: "Unknown(9999 = 1.00)" })).toBe(1032);
  });

  it("parses the code out of the product label when there is no field", () => {
    expect(saleMdbCode(label("Unknown(1031 = 7.00)", 7))).toBe(1031);
    expect(saleMdbCode(label("Unknown(769 = 8.00)", 8))).toBe(769);
  });

  it("returns the pre-auth sentinel verbatim instead of discarding it", () => {
    // -1 must survive: isAuthNoise depends on telling it apart from a missing code.
    expect(saleMdbCode(label("Unknown(-1 = 0.00)", 0))).toBe(-1);
  });

  it("returns null when no code can be found", () => {
    expect(saleMdbCode({ ProductName: "Coke Zero" })).toBeNull();
    expect(saleMdbCode({})).toBeNull();
  });
});

describe("saleSlot", () => {
  it("decodes real selections", () => {
    expect(saleSlot(label("Unknown(1031 = 7.00)", 7))).toBe("407");
    expect(saleSlot(label("Unknown(769 = 8.00)", 8))).toBe("301");
  });

  it("shows no slot for pre-auths, unmapped rows, and unlabeled sales", () => {
    expect(saleSlot(label("Unknown(-1 = 0.00)", 0))).toBe("—");
    expect(saleSlot(label("Unknown(0 = 0.00)", 0))).toBe("—");
    expect(saleSlot({ ProductName: "Coke Zero" })).toBe("—");
  });
});

describe("isAuthNoise", () => {
  it("flags card pre-authorizations", () => {
    expect(isAuthNoise(label("Unknown(-1 = 0.00)", 0))).toBe(true);
  });

  it("keeps a genuine $0.00 vend", () => {
    // Both conditions are required precisely so a free vend or promo — which has
    // a real slot — is never silently dropped from revenue reporting.
    expect(isAuthNoise(label("Unknown(1031 = 0.00)", 0))).toBe(false);
  });

  it("keeps every paid vend", () => {
    expect(isAuthNoise(label("Unknown(1031 = 7.00)", 7))).toBe(false);
    expect(isAuthNoise(label("Unknown(1025 = 19.00)", 19))).toBe(false);
  });

  it("keeps a sale with no decodable code so nothing vanishes unexplained", () => {
    expect(isAuthNoise({ ProductName: "Coke Zero", SettlementValue: 0 })).toBe(false);
  });
});
