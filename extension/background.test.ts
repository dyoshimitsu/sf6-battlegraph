import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

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
          expect(options.url).toBe("https://www.streetfighter.com/test");
          events.push("navigated");
        },
        sendMessage: vi.fn(),
        remove: vi.fn(),
        onRemoved: { addListener: vi.fn() },
      },
    };
    runInNewContext(readFileSync("extension/background.js", "utf8"), {
      chrome,
      importScripts: vi.fn(),
    });
    listener(
      { type: "sf6-battlegraph.collector-start", url: "https://www.streetfighter.com/test" },
      { tab: { id: 34 } },
    );
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
    runInNewContext(readFileSync("extension/background.js", "utf8"), {
      chrome,
      importScripts: vi.fn(),
      Error,
    });
    listener(
      { type: "sf6-battlegraph.collector-start", url: "https://www.streetfighter.com/test" },
      { tab: { id: 34 } },
    );
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    expect(update).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(12);
    expect(sendMessage.mock.calls[0]?.[1]).toMatchObject({
      status: "error",
      message: expect.stringContaining("storage unavailable"),
    });
  });
});
