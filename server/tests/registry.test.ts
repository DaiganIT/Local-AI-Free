import { describe, it, expect, beforeEach } from "vitest";
import { createRegistry } from "../src/registry.js";
import type { ModelInfo } from "../src/types.js";

// ── Fakes ────────────────────────────────────────────────────────────────────
let idCounter = 0;
let fakeNow = "2026-04-26T00:00:00.000Z";
const fakeId = () => `host-${++idCounter}`;
const fakeClock = () => fakeNow;

const fakeSocket = {} as import("ws").WebSocket;

beforeEach(() => {
  idCounter = 0;
  fakeNow = "2026-04-26T00:00:00.000Z";
});

function makeRegistry() {
  return createRegistry({ generateId: fakeId, clock: fakeClock });
}

const sampleModels: ModelInfo[] = [
  { name: "llama3", size: 4_700_000_000, provider: "ollama" },
];

const sampleProviders = [{ name: "ollama", version: "1.7.0" }];

// ── Tests ────────────────────────────────────────────────────────────────────
describe("createRegistry", () => {
  it("starts with no hosts", () => {
    const reg = makeRegistry();
    expect(reg.listHosts()).toEqual([]);
  });

  describe("registerHost", () => {
    it("returns a deterministic id when injected", () => {
      const reg = makeRegistry();
      const id = reg.registerHost(fakeSocket, "my-pc", sampleProviders, sampleModels);
      expect(id).toBe("host-1");
    });

    it("adds a host that appears in listHosts", () => {
      const reg = makeRegistry();
      reg.registerHost(fakeSocket, "my-pc", sampleProviders, sampleModels);
      const hosts = reg.listHosts();
      expect(hosts).toHaveLength(1);
      expect(hosts[0]).toMatchObject({
        id: "host-1",
        hostname: "my-pc",
        providers: sampleProviders,
        models: sampleModels,
        status: "online",
      });
    });

    it("sets connectedAt and lastHeartbeat to the injected clock value", () => {
      const reg = makeRegistry();
      reg.registerHost(fakeSocket, "my-pc", sampleProviders, []);
      const hosts = reg.listHosts();
      expect(hosts[0].connectedAt).toBe(fakeNow);
      expect(hosts[0].lastHeartbeat).toBe(fakeNow);
    });

    it("increments ids across registrations", () => {
      const reg = makeRegistry();
      const id1 = reg.registerHost(fakeSocket, "pc-a", [], []);
      const id2 = reg.registerHost(fakeSocket, "pc-b", [], []);
      expect(id1).toBe("host-1");
      expect(id2).toBe("host-2");
    });
  });

  describe("updateHeartbeat", () => {
    it("updates lastHeartbeat and models", () => {
      let now = "t0";
      const reg = createRegistry({
        generateId: () => "h1",
        clock: () => now,
      });
      const id = reg.registerHost(fakeSocket, "pc", [], []);
      expect(reg.listHosts()[0].lastHeartbeat).toBe("t0");

      now = "t1";
      const newModels: ModelInfo[] = [{ name: "mistral", size: 1e9, provider: "ollama" }];
      reg.updateHeartbeat(id, newModels);

      const host = reg.listHosts().find((h) => h.id === id)!;
      expect(host.lastHeartbeat).toBe("t1");
      expect(host.models).toEqual(newModels);
      expect(host.status).toBe("online");
    });

    it("does nothing for an unknown host", () => {
      const reg = makeRegistry();
      reg.updateHeartbeat("ghost", []);
      expect(reg.listHosts()).toEqual([]);
    });
  });

  describe("removeHost", () => {
    it("removes a registered host", () => {
      const reg = makeRegistry();
      const id = reg.registerHost(fakeSocket, "pc", [], []);
      reg.removeHost(id);
      expect(reg.listHosts()).toEqual([]);
    });

    it("does nothing for an unknown host", () => {
      const reg = makeRegistry();
      reg.removeHost("ghost");
    });
  });

  describe("isolation between instances", () => {
    it("two registries do not share state", () => {
      const a = makeRegistry();
      const b = makeRegistry();
      a.registerHost(fakeSocket, "pc-a", [], []);
      b.registerHost(fakeSocket, "pc-b", [], []);
      expect(a.listHosts()).toHaveLength(1);
      expect(b.listHosts()).toHaveLength(1);
      expect(a.listHosts()[0].hostname).toBe("pc-a");
      expect(b.listHosts()[0].hostname).toBe("pc-b");
    });
  });
});
