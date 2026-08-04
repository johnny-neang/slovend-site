import { describe, it, expect } from "vitest";
import { catalogName, catalogImage, catalogDescription } from "@/lib/nayax";

/**
 * The real body Lynx returned for catalog product 385498639827270 on 2026-08-04,
 * captured from Settings → API. These readers were originally written against a
 * 403 — every key in them was a guess — so this fixture is the thing that makes
 * them verifiable. Do not "tidy" it; its value is being verbatim.
 */
const REAL_CATALOG_PRODUCT = {
  NayaxProductID: 385498639827270,
  ProductGroupID: 898257329,
  ActorID: 208366919,
  ProductManufacturerID: null,
  ProductName: "funny",
  ProductCatalogNumber: "",
  ProductBarcode: "",
  ProductPackageQuantity: null,
  ProductDescription: "description of funny onons",
  ProductVolumeTypeID: null,
  DEXProductName: "funny onions",
  ProductCostPrice: null,
  ProductDefaultRetailPrice: null,
  ProductMinimumPickQTY: null,
  ProductStatus: 1,
  ProductCashPrice: null,
  ProductCreditCardPrice: null,
  ProductPrepaidCardPrice: null,
  ProductExternalPrepaidCardPrice: null,
  ProductMemberTypePriceBit: false,
  ProductPictureUrl: null,
  CaloriesPer100g: null,
  CaloriesPerServing: null,
  EANCode: "",
  ProductCreatedBy: 48348084,
  ProductCreationDate: "2026-06-26T07:34:19.563",
  ProductUpdatedBy: 48348084,
  ProductLastUpdated: "2026-06-26T07:35:46.897",
  SequenceNumber: null,
  AgeVerificationEnableBit: false,
  VatId: null,
  DepositTypeID: null,
  DepositFee: null,
  DepositTax: null,
  CommissionValue: null,
};

describe("catalog readers against the real Lynx body", () => {
  it("reads the product name", () => {
    expect(catalogName(REAL_CATALOG_PRODUCT)).toBe("funny");
  });

  it("reads the description", () => {
    expect(catalogDescription(REAL_CATALOG_PRODUCT)).toBe("description of funny onons");
  });

  it("returns no image — ProductPictureUrl exists but is unset on this product", () => {
    // Mapping slots to products will NOT produce photos unless the product
    // carries a picture in Nayax. The manual upload path stays necessary.
    expect(catalogImage(REAL_CATALOG_PRODUCT)).toBe("");
  });

  it("reads a picture when one is actually set", () => {
    expect(
      catalogImage({ ...REAL_CATALOG_PRODUCT, ProductPictureUrl: "https://x/y.png" }),
    ).toBe("https://x/y.png");
  });

  // Regression: catalogName used to list "Description" as a fallback, so a
  // product with no name rendered its description as its name.
  it("never falls back to the description for a name", () => {
    const unnamed = { ...REAL_CATALOG_PRODUCT, ProductName: "", DEXProductName: "" };
    expect(catalogName(unnamed)).toBe("");
  });

  it("falls back to the machine-facing name when the catalog name is blank", () => {
    expect(catalogName({ ...REAL_CATALOG_PRODUCT, ProductName: "" })).toBe("funny onions");
  });
});
