import { describe, expect, it } from "vitest";
import { SubmitKycBody } from "@workspace/api-zod";

const baseKyc = {
  fullName: "Alex Morgan",
  country: "United States",
  city: "New York",
  occupation: "Engineer",
  documentType: "passport" as const,
};

describe("KYC document upload contract", () => {
  it("accepts high-resolution images up to the finite 100 MB guard", () => {
    const prefix = "data:image/jpeg;base64,";

    expect(SubmitKycBody.safeParse({
      ...baseKyc,
      documentImageBase64: prefix + "A".repeat(2_100_000),
    }).success).toBe(true);

    expect(SubmitKycBody.safeParse({
      ...baseKyc,
      documentImageBase64: prefix + "A".repeat(100_000_001),
    }).success).toBe(false);
  });

  it("accepts any common image format the client composed the document into", () => {
    for (const mime of ["jpeg", "png", "webp", "gif"]) {
      expect(SubmitKycBody.safeParse({
        ...baseKyc,
        documentImageBase64: `data:image/${mime};base64,` + "A".repeat(200),
      }).success).toBe(true);
    }

    expect(SubmitKycBody.safeParse({
      ...baseKyc,
      documentImageBase64: "data:image/heic;base64," + "A".repeat(200),
    }).success).toBe(false);
  });
});