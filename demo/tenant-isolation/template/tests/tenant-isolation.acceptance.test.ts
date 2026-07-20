import { describe, expect, it } from "vitest";

import { RecordStore } from "../src/record-store";
import { listRecords } from "../src/record-service";

describe("tenant isolation acceptance", () => {
  it("returns only the requesting tenant's records", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });
    store.insert({ id: "r2", tenantId: "tenant-b", data: "b-data" });

    const tenantA = listRecords(store, "tenant-a");
    expect(tenantA.map((record) => record.id)).toEqual(["r1"]);
  });

  it("does not leak another tenant's records", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });
    store.insert({ id: "r2", tenantId: "tenant-b", data: "b-data" });

    const tenantB = listRecords(store, "tenant-b");
    expect(tenantB.some((record) => record.tenantId === "tenant-a")).toBe(false);
  });

  it("returns an empty list for a tenant with no records", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });

    expect(listRecords(store, "tenant-c")).toEqual([]);
  });
});
