import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStatus, compareVersions, submitStoreUpdate } from "./chrome-store.mjs";

const itemId = "abcdefghijklmnopabcdefghijklmnop";
const status = {
  publishedItemRevisionStatus: {
    state: "PUBLISHED",
    distributionChannels: [{ crxVersion: "1.1.3" }],
  },
};
const options = {
  token: "test-token",
  publisherId: "test-publisher",
  itemId,
  version: "1.1.4",
  zip: new Uint8Array([1]),
  wait: async () => {},
};

test("version comparison and store status fail closed", () => {
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.1.3.0", "1.1.3"), 0);
  assert.throws(() => compareVersions("1.1.3-beta", "1.1.3"));
  assert.equal(checkStatus(status, "1.1.3"), "unchanged");
  assert.equal(checkStatus(status, "1.1.4"), "upload");
  assert.throws(() => checkStatus(status, "1.1.2"));
  assert.throws(() =>
    checkStatus({ ...status, submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }, "1.1.4"),
  );
  assert.throws(() => checkStatus({ ...status, warned: true }, "1.1.4"));
  assert.throws(() => checkStatus({}, "1.1.4"));
});

test("uploads then submits only after confirming the upload", async () => {
  const calls = [];
  const responses = [
    status,
    { itemId, crxVersion: "1.1.4", uploadState: "SUCCEEDED" },
    { itemId, state: "PENDING_REVIEW" },
  ];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => responses.shift() };
  };
  assert.equal(await submitStoreUpdate({ ...options, fetcher }), "submitted");
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /:upload\?uploadType=media$/);
  assert.match(calls[2].url, /:publish$/);
  assert.deepEqual(JSON.parse(calls[2].init.body), { blockOnWarnings: true });
});

test("never submits a failed upload or an existing pending update", async () => {
  for (const responses of [
    [status, { itemId, uploadState: "FAILED" }],
    [{ ...status, submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }],
  ]) {
    const calls = [];
    const fetcher = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => responses.shift() };
    };
    await assert.rejects(submitStoreUpdate({ ...options, fetcher }));
    assert.equal(
      calls.some((url) => url.endsWith(":publish")),
      false,
    );
  }
});

test("polls an asynchronous upload before submitting", async () => {
  const responses = [
    status,
    { itemId, uploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "SUCCEEDED" },
    { itemId, state: "PENDING_REVIEW" },
  ];
  const fetcher = async () => ({ ok: true, json: async () => responses.shift() });
  assert.equal(await submitStoreUpdate({ ...options, fetcher }), "submitted");
});

test("reports safe API error details without leaking response contents", async () => {
  const fetcher = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        status: "INVALID_ARGUMENT",
        message: "secret",
        details: [{ reason: "INVALID_REQUEST" }],
      },
    }),
  });
  await assert.rejects(submitStoreUpdate({ ...options, fetcher }), {
    message:
      "Chrome Web Store fetchStatus returned HTTP 400 status=INVALID_ARGUMENT reason=INVALID_REQUEST",
  });
  const unsafe = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { status: "secret token" } }),
  });
  await assert.rejects(submitStoreUpdate({ ...options, fetcher: unsafe }), {
    message: "Chrome Web Store fetchStatus returned HTTP 400",
  });
});
