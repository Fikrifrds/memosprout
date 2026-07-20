import type { DataRecord } from "./types";

export class RecordStore {
  private readonly records = new Map<string, DataRecord>();

  insert(record: DataRecord): void {
    this.records.set(record.id, record);
  }

  all(): readonly DataRecord[] {
    return [...this.records.values()];
  }
}
