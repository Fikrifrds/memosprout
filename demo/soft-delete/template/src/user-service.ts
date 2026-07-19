import type { UserStore } from "./user-store";
import type { User } from "./types";

export function deleteUser(store: UserStore, id: string): void {
  store.remove(id);
}

export function listActiveUsers(store: UserStore): User[] {
  return [...store.all()];
}
