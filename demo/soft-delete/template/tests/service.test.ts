import { describe, expect, it } from "vitest";

import { UserStore } from "../src/user-store";
import { listActiveUsers } from "../src/user-service";

describe("user service", () => {
  it("lists inserted users when nothing is deleted", () => {
    const store = new UserStore();
    store.insert({ id: "u1", name: "Alice", deletedAt: null });
    store.insert({ id: "u2", name: "Bob", deletedAt: null });

    const active = listActiveUsers(store);
    expect(active.map((user) => user.id).sort()).toEqual(["u1", "u2"]);
  });
});
