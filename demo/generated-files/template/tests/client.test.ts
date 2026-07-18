import { describe, expect, it } from "vitest";

import { buildUserUrl } from "../src";
import type { User } from "../src";

describe("generated API client", () => {
  it("builds a normalized and encoded user URL", () => {
    expect(buildUserUrl("https://api.example.test/", "user 42")).toBe(
      "https://api.example.test/users/user%2042",
    );
  });

  it("exposes the schema-defined user fields", () => {
    const user: User = { id: "user-1", name: "Ada" };

    expect(user).toEqual({ id: "user-1", name: "Ada" });
  });
});
