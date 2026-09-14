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
  it("accepts high-resolution images up to the finite 50 MB guard", () => {
    const prefix = "data:image/jpeg;base64,";

    expect(SubmitKycBody.safeParse({
      ...baseKyc,
      documentImageBase64: prefix + "A".repeat(2_100_000),
    }).success).toBe(true);

    expect(SubmitKycBody.safeParse({
      ...baseKyc,
      documentImageBase64: prefix + "A".repeat(50_000_001),
    }).success).toBe(false);
  });
});