import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const BATTLE_LOG_URL =
  "https://www.streetfighter.com/6/buckler/ja-jp/profile/1000000001/battlelog#sf6-battlegraph-origin=https%3A%2F%2Fowner.github.io";

type Listener = (message: unknown, sender: unknown) => void;

function loadBackground(chrome: unknown): void {
  const context = { chrome, importScripts: vi.fn(), URL, Error };
  runInNewContext(readFileSync("extension/background-policy.js", "utf8"), context);
  runInNewContext(readFileSync("extension/background.js", "utf8"), context);
}

describe("extension collection startup", () => {
  it("stores the tab association before navigating to Buckler", async () => {
    const events: string[] = [];
    let listener: (message: unknown, sender: unknown) => void = () => {};
    const chrome = {
      runtime: {
        onMessage: {
          addListener: (fn: typeof listener) => {
            listener = fn;
          },
        },
      },
      storage: {
        session: {
          set: async () => {
            events.push("stored");
          },
          remove: vi.fn(),
          get: vi.fn(),
        },
      },
      tabs: {
        create: async (options: { url?: string }) => {
          expect(options.url).toBe("about:blank");
          events.push("created");
          return { id: 12 };
        },
        update: async (_id: number, options: { url: string }) => {
          expect(options.url).toBe(BATTLE_LOG_URL);
          events.push("navigated");
        },
        sendMessage: vi.fn(),
        remove: vi.fn(),
        onRemoved: { addListener: vi.fn() },
      },
    };
    loadBackground(chrome);
    listener({ type: "sf6-battlegraph.collector-start", url: BATTLE_LOG_URL }, { tab: { id: 34 } });
    await vi.waitFor(() => expect(events).toEqual(["created", "stored", "navigated"]));
  });

  it("reports storage failures without navigating", async () => {
    let listener: (message: unknown, sender: unknown) => void = () => {};
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      runtime: {
        onMessage: {
          addListener: (fn: typeof listener) => {
            listener = fn;
          },
        },
      },
      storage: {
        session: {
          set: vi.fn().mockRejectedValue(new Error("storage unavailable")),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
      tabs: {
        create: vi.fn().mockResolvedValue({ id: 12 }),
        update,
        remove,
        sendMessage,
        onRemoved: { addListener: vi.fn() },
      },
    };
    loadBackground(chrome);
    listener({ type: "sf6-battlegraph.collector-start", url: BATTLE_LOG_URL }, { tab: { id: 34 } });
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(update).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(12);
    expect(sendMessage.mock.calls[0]?.[1]).toMatchObject({
      status: "error",
      message: expect.stringContaining("storage unavailable"),
    });
  });

  it("refuses to open a URL outside Buckler Battle Log", async () => {
    let listener: Listener = () => {};
    const create = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    loadBackground({
      runtime: { onMessage: { addListener: (fn: Listener) => (listener = fn) } },
      storage: { session: {} },
      tabs: { create, sendMessage, onRemoved: { addListener: vi.fn() } },
    });
    listener(
      { type: "sf6-battlegraph.collector-start", url: "https://example.com/" },
      { tab: { id: 34 } },
    );
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(create).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0]?.[1]).toMatchObject({ status: "error" });
  });
});

describe("extension result relay", () => {
  it("closes the collection tab even when Battlegraph cannot receive the result", async () => {
    let listener: Listener = () => {};
    const remove = vi.fn().mockResolvedValue(undefined);
    const sessionRemove = vi.fn().mockResolvedValue(undefined);
    loadBackground({
      runtime: { onMessage: { addListener: (fn: Listener) => (listener = fn) } },
      storage: {
        session: { get: vi.fn().mockResolvedValue({ "request:12": 34 }), remove: sessionRemove },
      },
      tabs: {
        sendMessage: vi.fn().mockRejectedValue(new Error("Receiving end does not exist")),
        remove,
        onRemoved: { addListener: vi.fn() },
      },
    });
    listener({ type: "sf6-battlegraph.collector-result" }, { tab: { id: 12 } });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith(12));
    expect(sessionRemove).toHaveBeenCalledWith("request:12");
  });
});
