import { describe, expect, it } from "vitest";

import { UserStore } from "@/demo/soft-delete/template/src/user-store";
import { deleteUser, listActiveUsers } from "@/demo/soft-delete/template/src/user-service";
import type { User } from "@/demo/soft-delete/template/src/types";

function makeUser(id: string, name: string): User {
  return { id, name, deletedAt: null };
}

function correctDeleteUser(store: UserStore, id: string): void {
  if (!store.getById(id)) return;
  store.setDeletedAt(id, new Date().toISOString());
}

function correctListActiveUsers(store: UserStore): User[] {
  return store.all().filter((user) => user.deletedAt === null);
}

describe("soft-delete scenario knowledge trap", () => {
  it("naive committed service passes the ordinary happy path", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));
    store.insert(makeUser("u2", "Bob"));
    expect(listActiveUsers(store).map((user) => user.id).sort()).toEqual(["u1", "u2"]);
  });

  it("naive committed service hard-deletes the record", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));
    deleteUser(store, "u1");
    expect(store.getById("u1")).toBeUndefined();
  });

  it("correct service soft-deletes without removing the record", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));
    correctDeleteUser(store, "u1");
    const record = store.getById("u1");
    expect(record).toBeDefined();
    expect(record?.deletedAt).not.toBeNull();
  });

  it("correct service excludes soft-deleted users from the active list", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));
    store.insert(makeUser("u2", "Bob"));
    correctDeleteUser(store, "u1");
    expect(correctListActiveUsers(store).map((user) => user.id)).toEqual(["u2"]);
  });

  it("correct service treats deleting an unknown user as a no-op", () => {
    const store = new UserStore();
    store.insert(makeUser("u1", "Alice"));
    expect(() => correctDeleteUser(store, "missing")).not.toThrow();
    expect(correctListActiveUsers(store).map((user) => user.id)).toEqual(["u1"]);
  });
});
