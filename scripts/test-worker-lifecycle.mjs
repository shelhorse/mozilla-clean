import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDirectory = path.resolve(scriptDirectory, "..", "extension");
const transferId = "12345678-1234-4123-8123-123456789abc";
const article = {
  url: "https://example.test/article", canonicalUrl: "", title: "Visible submission article",
  subtitle: "", byline: "Test Author", published: "2026-08-19", publication: "Test Publication",
  language: "en", html: "<article><p>Source article body.</p></article>", textLength: 280
};
const storageState = {
  format: "html", model: "gpt-5.6-luna", apiKey: "sk-test",
  [`pendingArticle:${transferId}`]: { createdAt: Date.now(), article }
};
function node() {
  return {
    textContent: "", hidden: false, disabled: false, children: [],
    addEventListener() {},
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; }
  };
}
const nodes = new Map([
  ["status", node()], ["detail", node()], ["note", node()], ["retrieval", node()],
  ["retrieve-button", node()], ["retrieval-message", node()], ["download-area", node()]
]);
nodes.get("retrieval").hidden = true;
let submissionBody;
let submissionRequests = 0;
let retrievalRequests = 0;
let closeAttempts = 0;

function storageGet(query) {
  if (typeof query === "string") return Object.hasOwn(storageState, query) ? { [query]: storageState[query] } : {};
  const result = { ...(query || {}) };
  for (const key of Object.keys(query || {})) if (Object.hasOwn(storageState, key)) result[key] = storageState[key];
  return result;
}

const context = vm.createContext({
  AbortController, Blob, Headers, Response, TextDecoder, TextEncoder, URL, Uint8Array,
  CLEAN_ARTICLE_WORKER_TEST: true,
  browser: {
    runtime: {
      getManifest: () => ({ version: "0.3.3-test" }),
      getPlatformInfo: async () => ({ os: "android" }),
      getURL: (value) => `moz-extension://worker-test/${value}`
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
  document: {
    body: { dataset: {} }, visibilityState: "visible",
    getElementById(id) { return nodes.get(id); },
    createElement() { return node(); }
  },
  fetch: async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("spec/clean-article-spec.md")) {
      return new Response("Clean the source article faithfully and retain its complete substantive body text.", { status: 200, headers: { "content-type": "text/markdown" } });
    }
    if (value.endsWith("/responses") && options.method === "POST") {
      submissionRequests += 1;
      submissionBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: "resp_worker", status: "queued" }), { status: 200 });
    }
    if (value.includes("/responses/")) retrievalRequests += 1;
    throw new Error(`Unexpected fetch: ${value}`);
  },
  location: { hash: `#${transferId}` },
  navigator: {},
  clearInterval,
  setInterval,
  setTimeout
});
context.globalThis = context;
context.window = context;
context.close = () => { closeAttempts += 1; };

vm.runInContext(await fs.readFile(path.join(extensionDirectory, "core.js"), "utf8"), context, { filename: "core.js" });
vm.runInContext(await fs.readFile(path.join(extensionDirectory, "worker", "worker.js"), "utf8"), context, { filename: "worker.js" });

const result = await context.CleanArticleWorker.run();
assert.equal(result.status, "queued");
assert.equal(submissionRequests, 1, "The visible tab must submit exactly once.");
assert.equal(retrievalRequests, 0, "The visible tab must not retrieve or poll.");
assert.equal(closeAttempts, 0, "The submitted state must remain visible until the user closes the tab.");
assert.equal(nodes.get("status").textContent, "Submitted");
assert.match(nodes.get("note").textContent, /Retrieve it here/i);
assert.equal(nodes.get("retrieval").hidden, false);
assert.equal(nodes.get("retrieve-button").textContent, "Retrieve document");
assert.equal(storageState[`pendingArticle:${transferId}`], undefined, "Transferred article data must be removed after consumption.");
assert.equal(submissionBody.background, true);
assert.equal(submissionBody.stream, false);
assert.equal(submissionBody.store, true);
assert.equal(submissionBody.text.format.type, "json_schema");
assert.equal(storageState.jobs[0].mode, "background_manual_retrieval");
assert.equal(storageState.jobs[0].responseId, "resp_worker");
assert.equal("downloads" in context.browser, false, "The visible tab must not use Firefox's downloads API.");

console.log("visible submission-tab lifecycle test passed");
