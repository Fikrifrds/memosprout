import { describe, expect, it } from "vitest";

import { RecordStore } from "../src/record-store";
import { listRecords } from "../src/record-service";

describe("record service", () => {
  it("lists inserted records for a tenant", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });

    const records = listRecords(store, "tenant-a");
    expect(records.map((record) => record.id)).toContain("r1");
  });
});
