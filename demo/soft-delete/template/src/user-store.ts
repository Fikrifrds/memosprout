import type { User } from "./types";

export class UserStore {
  private readonly users = new Map<string, User>();

  insert(user: User): void {
    this.users.set(user.id, user);
  }

  getById(id: string): User | undefined {
    return this.users.get(id);
  }

  all(): readonly User[] {
    return [...this.users.values()];
  }

  remove(id: string): boolean {
    return this.users.delete(id);
  }

  setDeletedAt(id: string, deletedAt: string): void {
    const user = this.users.get(id);
    if (user) {
      user.deletedAt = deletedAt;
    }
  }
}
