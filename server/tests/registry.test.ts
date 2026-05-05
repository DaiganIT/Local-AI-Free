import { describe, it, expect, beforeEach } from "vitest";
import { createRegistry, OllamaModel } from "../src/registry.js";

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

const sampleModels: OllamaModel[] = [
  { name: "llama3", size: 4_700_000_000 },
];

// ── Tests ────────────────────────────────────────────────────────────────────
describe("createRegistry", () => {
  it("starts with no hosts", () => {
    const reg = makeRegistry();
    expect(reg.listHosts()).toEqual([]);
  });

  describe("registerHost", () => {
    it("returns a deterministic id when injected", () => {
      const reg = makeRegistry();
      const id = reg.registerHost(fakeSocket, "my-pc", "1.7.0", sampleModels);
      expect(id).toBe("host-1");
    });

    it("adds a host that appears in listHosts", () => {
      const reg = makeRegistry();
      reg.registerHost(fakeSocket, "my-pc", "1.7.0", sampleModels);
      const hosts = reg.listHosts();
      expect(hosts).toHaveLength(1);
      expect(hosts[0]).toMatchObject({
        id: "host-1",
        hostname: "my-pc",
        ollamaVersion: "1.7.0",
        models: sampleModels,
        status: "online",
      });
    });

    it("sets connectedAt and lastHeartbeat to the injected clock value", () => {
      const reg = makeRegistry();
      reg.registerHost(fakeSocket, "my-pc", "1.7.0", []);
      const hosts = reg.listHosts();
      expect(hosts[0].connectedAt).toBe(fakeNow);
      expect(hosts[0].lastHeartbeat).toBe(fakeNow);
    });

    it("increments ids across registrations", () => {
      const reg = makeRegistry();
      const id1 = reg.registerHost(fakeSocket, "pc-a", "1.0.0", []);
      const id2 = reg.registerHost(fakeSocket, "pc-b", "1.0.0", []);
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
      const id = reg.registerHost(fakeSocket, "pc", "1.0", []);
      expect(reg.listHosts()[0].lastHeartbeat).toBe("t0");

      now = "t1";
      const newModels: OllamaModel[] = [{ name: "mistral", size: 1e9 }];
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
      const id = reg.registerHost(fakeSocket, "pc", "1.0", []);
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
      a.registerHost(fakeSocket, "pc-a", "1.0", []);
      b.registerHost(fakeSocket, "pc-b", "1.0", []);
      expect(a.listHosts()).toHaveLength(1);
      expect(b.listHosts()).toHaveLength(1);
      expect(a.listHosts()[0].hostname).toBe("pc-a");
      expect(b.listHosts()[0].hostname).toBe("pc-b");
    });
  });
});
