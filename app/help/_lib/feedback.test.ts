import { describe, expect, it } from "vitest";
import { interpretFeedbackResponse, validateFeedback } from "./feedback";

const valid = {
  topic: "bug",
  message: "The filters reset when I go back.",
  email: "",
};

describe("validateFeedback", () => {
  it("accepts a valid message with or without an email", () => {
    expect(validateFeedback(valid)).toBeNull();
    expect(
      validateFeedback({ ...valid, email: "renter@example.test" }),
    ).toBeNull();
  });

  it("flags a short or long message, a bad email and an unknown topic", () => {
    const result = validateFeedback({
      topic: "spam",
      message: "  hi  ",
      email: "not-an-email",
    });
    expect(result).toMatchObject({ status: "error" });
    if (result?.status !== "error") throw new Error("expected an error");
    expect(Object.keys(result.fields ?? {}).sort()).toEqual([
      "email",
      "message",
      "topic",
    ]);
    expect(
      validateFeedback({ ...valid, message: "x".repeat(2001) }),
    ).toMatchObject({ fields: { message: expect.stringMatching(/under/) } });
  });
});

describe("interpretFeedbackResponse", () => {
  it("treats 200 and 201 as success", () => {
    expect(interpretFeedbackResponse(201, { data: {} }).status).toBe("success");
    expect(interpretFeedbackResponse(200, null).status).toBe("success");
  });

  it("says the feature isn't available while the endpoint is missing", () => {
    for (const status of [404, 405]) {
      expect(interpretFeedbackResponse(status, null)).toMatchObject({
        status: "error",
        message: expect.stringMatching(/isn't available yet/),
      });
    }
  });

  it("maps catalog-style 400 errors onto form fields", () => {
    const result = interpretFeedbackResponse(400, {
      error: {
        code: "invalid",
        message: "Check the form.",
        fields: { message: ["Too short."], email: "Invalid email." },
      },
    });
    expect(result).toEqual({
      status: "error",
      message: "Check the form.",
      fields: { message: "Too short.", email: "Invalid email." },
    });
  });

  it("explains rate limits and falls back for anything else", () => {
    expect(interpretFeedbackResponse(429, null).status).toBe("error");
    expect(interpretFeedbackResponse(500, null)).toMatchObject({
      message: expect.stringMatching(/couldn't send/),
    });
    expect(interpretFeedbackResponse(0, null).status).toBe("error");
  });
});
