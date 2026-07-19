import { describe, expect, it } from "vitest";

import { UserStore } from "../src/user-store";
import { deleteUser, listActiveUsers } from "../src/user-service";
import type { User } from "../src/types";

function makeUser(id: string, name: string): User {
  return { id, name, deletedAt: null };
}

describe("soft-delete acceptance", () => {
  it("soft-deletes a user without removing the record", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));

    deleteUser(store, "u1");

    const record = store.getById("u1");
    expect(record).toBeDefined();
    expect(record?.deletedAt).not.toBeNull();
  });

  it("excludes soft-deleted users from listActiveUsers", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));
    store.insert(makeUser("u2", "Bob"));

    deleteUser(store, "u1");

    expect(listActiveUsers(store).map((user) => user.id)).toEqual(["u2"]);
  });

  it("treats deleting an unknown user as a no-op", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));

    expect(() => deleteUser(store, "missing")).not.toThrow();
    expect(listActiveUsers(store).map((user) => user.id)).toEqual(["u1"]);
  });
});
