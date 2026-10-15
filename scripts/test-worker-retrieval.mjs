import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(scriptDirectory, "..", "extension", "worker", "worker.js");

class MockNode {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.href = "";
    this.download = "";
  }

  addEventListener(type, listener) { this.listeners[type] = listener; }
  dispatch(type) { return this.listeners[type]?.({ type, target: this }); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; }
}

const nodes = new Map([
  ["status", new MockNode()],
  ["detail", new MockNode()],
  ["note", new MockNode()],
  ["retrieval", new MockNode("section")],
  ["retrieve-button", new MockNode("button")],
  ["retrieval-message", new MockNode("p")],
  ["download-area", new MockNode("div")]
]);
nodes.get("retrieval").hidden = true;

const jobs = {
  ready: { id: "ready", filename: "Ready article.html", format: "html", status: "queued" },
  pending: { id: "pending", filename: "Pending article.html", format: "html", status: "queued" }
};
const retrievalCalls = [];

const context = vm.createContext({
  Blob,
  CLEAN_ARTICLE_WORKER_TEST: true,
  CleanArticleCore: {
    async retrieveJobDocument(jobId) {
      retrievalCalls.push(jobId);
      const job = jobs[jobId];
      if (jobId === "pending") {
        job.status = "in_progress";
        return { ready: false, job };
      }
      job.status = "ready";
      return {
        ready: true,
        job,
        document: {
          bytes: new TextEncoder().encode("<!doctype html><p>Ready</p>"),
          mime: "text/html;charset=utf-8",
          filename: job.filename,
          format: job.format
        }
      };
    }
  },
  document: {
    body: { dataset: {} },
    visibilityState: "visible",
    getElementById(id) { return nodes.get(id); },
    createElement(tagName) { return new MockNode(tagName); }
  },
  location: { hash: "#12345678-1234-4123-8123-123456789abc" },
  navigator: {},
  TextEncoder,
  URL: {
    createObjectURL() { return "blob:manual-download"; },
    revokeObjectURL() {}
  },
  console,
  setTimeout,
  clearInterval,
  setInterval
});
context.globalThis = context;
context.window = context;

vm.runInContext(await fs.readFile(workerPath, "utf8"), context, { filename: workerPath });

context.CleanArticleWorker.showRetrieval(jobs.ready);
assert.equal(nodes.get("retrieval").hidden, false);
assert.equal(nodes.get("retrieve-button").textContent, "Retrieve document");
await nodes.get("retrieve-button").dispatch("click");
assert.deepEqual(retrievalCalls, ["ready"]);
const download = nodes.get("download-area").children[0];
assert.equal(download.tagName, "A");
assert.equal(download.className, "download");
assert.equal(download.href, "blob:manual-download");
assert.equal(download.download, "Ready article.html");
assert.equal(download.textContent, "Download HTML");
assert.match(nodes.get("retrieval-message").textContent, /green Download button/);

context.CleanArticleWorker.showRetrieval(jobs.pending);
await nodes.get("retrieve-button").dispatch("click");
assert.deepEqual(retrievalCalls, ["ready", "pending"]);
assert.equal(nodes.get("download-area").children.length, 0);
assert.equal(nodes.get("retrieve-button").disabled, false);
assert.equal(nodes.get("retrieve-button").textContent, "Retrieve document");
assert.match(nodes.get("retrieval-message").textContent, /Not ready yet/);

console.log("processing-page Retrieve document and green Download test passed");
