import type { RecordStore } from "./record-store";
import type { DataRecord } from "./types";

export function listRecords(store: RecordStore, tenantId: string): DataRecord[] {
  void tenantId;
  return [...store.all()];
}
