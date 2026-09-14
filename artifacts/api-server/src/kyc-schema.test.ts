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
  it("accepts optimized images above the previous limit and keeps a finite 10 MB guard", () => {
    const prefix = "data:image/jpeg;base64,";

    expect(SubmitKycBody.safeParse({
      ...baseKyc,
      documentImageBase64: prefix + "A".repeat(2_100_000),
    }).success).toBe(true);

    expect(SubmitKycBody.safeParse({
      ...baseKyc,
      documentImageBase64: prefix + "A".repeat(10_000_001),
    }).success).toBe(false);
  });
});