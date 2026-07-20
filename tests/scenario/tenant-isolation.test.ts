import { describe, expect, it } from "vitest";

import { RecordStore } from "@/demo/tenant-isolation/template/src/record-store";
import { listRecords } from "@/demo/tenant-isolation/template/src/record-service";
import type { DataRecord } from "@/demo/tenant-isolation/template/src/types";

function correctListRecords(store: RecordStore, tenantId: string): DataRecord[] {
  return store.all().filter((record) => record.tenantId === tenantId);
}

describe("tenant-isolation scenario knowledge trap", () => {
  it("naive committed service passes the ordinary happy path", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });
    expect(listRecords(store, "tenant-a").map((record) => record.id)).toContain("r1");
  });

  it("naive committed service leaks another tenant's records", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });
    store.insert({ id: "r2", tenantId: "tenant-b", data: "b-data" });
    expect(listRecords(store, "tenant-a").map((record) => record.id)).toEqual(["r1", "r2"]);
  });

  it("correct service returns only the requesting tenant's records", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });
    store.insert({ id: "r2", tenantId: "tenant-b", data: "b-data" });
    expect(correctListRecords(store, "tenant-a").map((record) => record.id)).toEqual(["r1"]);
  });

  it("correct service returns an empty list for an unknown tenant", () => {
    const store = new RecordStore();
    store.insert({ id: "r1", tenantId: "tenant-a", data: "a-data" });
    expect(correctListRecords(store, "tenant-c")).toEqual([]);
  });
});
