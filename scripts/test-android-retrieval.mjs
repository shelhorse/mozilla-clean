import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDirectory = path.resolve(scriptDirectory, "..", "extension");
const corePath = path.join(extensionDirectory, "core.js");
const storageState = { format: "html", model: "gpt-5.6-luna", apiKey: "sk-test" };
const cleanedArticle = {
  title: "Android retrieval", subtitle: "", byline: "Clean Article", publication: "Test",
  published: "2026-08-19", source_url: "https://example.test/retrieval", language: "en",
  blocks: [{ type: "paragraph", level: 0, runs: [{ text: "Retrieved article body.", bold: false, italic: false, href: "" }] }]
};
const completedResponse = {
  id: "resp_android", status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(cleanedArticle) }] }]
};
let fetchAttempts = 0;
let xhrAttempts = 0;

class MockXMLHttpRequest {
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader() {}
  getResponseHeader() { return "req_android_test"; }
  send() {
    xhrAttempts += 1;
    queueMicrotask(() => {
      this.status = 200;
      this.responseText = JSON.stringify(completedResponse);
      this.onload();
    });
  }
}

function storageGet(query) {
  const result = { ...(query || {}) };
  for (const key of Object.keys(query || {})) if (Object.hasOwn(storageState, key)) result[key] = storageState[key];
  return result;
}

const context = vm.createContext({
  AbortController, Blob, Headers, Response, TextDecoder, TextEncoder, URL, Uint8Array,
  XMLHttpRequest: MockXMLHttpRequest,
  browser: {
    runtime: {
      getManifest: () => ({ version: "android-test" }),
      getPlatformInfo: async () => ({ os: "android" }),
      getURL: (value) => `moz-extension://android-test/${value}`
    },
    storage: { local: {
      async get(query) { return storageGet(query); },
      async set(values) { Object.assign(storageState, values); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storageState[key]; }
    } }
  },
  clearTimeout,
  console,
  crypto: webcrypto,
  fetch: async () => {
    fetchAttempts += 1;
    throw new Error("Android retrieval must not use fetch.");
  },
  setTimeout
});
context.globalThis = context;
vm.runInContext(await fs.readFile(corePath, "utf8"), context, { filename: corePath });

assert.equal(await context.CleanArticleCore.isAndroidPlatform(), true);
const direct = await context.CleanArticleCore.retrieveStoredResponse("resp_android");
assert.equal(fetchAttempts, 0);
assert.equal(xhrAttempts, 1);
assert.equal(direct.transport, "xhr");
assert.equal(direct.attempts, 1);
assert.equal(direct.response.status, "completed");

storageState.jobs = [{
  id: "job_android", responseId: "resp_android", status: "queued", format: "html", model: "gpt-5.6-luna",
  filename: "Android retrieval.html", title: "Android retrieval", createdAt: new Date().toISOString()
}];
const result = await context.CleanArticleCore.retrieveJobDocument("job_android");
assert.equal(result.ready, true);
assert.equal(fetchAttempts, 0, "Android manual retrieval must use only XMLHttpRequest.");
assert.equal(xhrAttempts, 2, "Each manual retrieval call must perform exactly one request.");
assert.equal(result.job.status, "ready");
assert.equal(result.job.lastCheckTransport, "xhr");
assert.equal(result.job.lastCheckAttempts, 1);
const html = new TextDecoder().decode(result.document.bytes);
assert.match(html, /^<!doctype html>/i);
assert.match(html, /Retrieved article body\./);
assert.equal("downloads" in context.browser, false, "Android retrieval must not require Firefox's downloads API.");

console.log("Android single-request manual retrieval test passed");
