import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionDirectory = path.resolve(scriptDirectory, "..", "extension");
const storageState = { format: "rtf", model: "gpt-5.6-luna", apiKey: "sk-test" };
const requests = [];
let externalSpecificationAvailable = true;
const bundledSpecification = "# Bundled specification\n\nPreserve the complete substantive article and remove website chrome.";
const externalSpecification = "# External specification marker\n\nPreserve headings and paragraphs from the complete article.";
const cleanedArticle = {
  title: "Mock Article", subtitle: "A subtitle", byline: "Test Author", publication: "Test News",
  published: "2026-08-17", source_url: "https://example.test/article", language: "en",
  blocks: [
    { type: "heading", level: 2, runs: [{ text: "A heading", bold: false, italic: false, href: "" }] },
    { type: "paragraph", level: 0, runs: [
      { text: "A complete paragraph with ", bold: false, italic: false, href: "" },
      { text: "emphasis", bold: true, italic: false, href: "" },
      { text: ".", bold: false, italic: false, href: "" }
    ] }
  ]
};

function storageGet(query) {
  if (typeof query === "string") return Object.hasOwn(storageState, query) ? { [query]: storageState[query] } : {};
  const result = { ...(query || {}) };
  for (const key of Object.keys(query || {})) if (Object.hasOwn(storageState, key)) result[key] = storageState[key];
  return result;
}

const context = vm.createContext({
  AbortController, Blob, Headers, Response, TextDecoder, TextEncoder, URL, Uint8Array,
  browser: {
    runtime: {
      getManifest: () => ({ version: "test" }),
      getURL: (value) => `moz-extension://test/${value}`,
      getPlatformInfo: async () => ({ os: "linux" })
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
  fetch: async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url) === "moz-extension://test/spec/clean-article-spec.md") {
      return new Response(bundledSpecification, { status: 200, headers: { "Content-Type": "text/markdown" } });
    }
    if (String(url) === "https://example.test/clean-article-spec.md") {
      return externalSpecificationAvailable
        ? new Response(externalSpecification, { status: 200, headers: { "Content-Type": "text/markdown" } })
        : new Response("unavailable", { status: 503 });
    }
    if (String(url).endsWith("/responses") && options.method === "POST") {
      return new Response(JSON.stringify({ id: "resp_test", status: "queued" }), { status: 200 });
    }
    if (String(url).endsWith("/responses/resp_test")) {
      return new Response(JSON.stringify({
        id: "resp_test", status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(cleanedArticle) }] }]
      }), { status: 200 });
    }
    throw new Error(`Unexpected test request: ${url}`);
  },
  setTimeout: (...args) => {
    const timer = setTimeout(...args);
    if (Number(args[1]) >= 60000) timer.unref();
    return timer;
  }
});
context.globalThis = context;
context.self = context;
context.window = context;
for (const file of ["vendor/jszip.min.js", "vendor/pdf-lib.min.js", "core.js"]) {
  const filename = path.join(extensionDirectory, file);
  vm.runInContext(await fs.readFile(filename, "utf8"), context, { filename });
}

const core = context.CleanArticleCore;
assert.equal(core.safeFilename('A / Bad: "Name"', "epub"), "A Bad Name.epub");
assert.equal(core.pendingArticleKey("12345678-1234-1234-1234-123456789abc"), "pendingArticle:12345678-1234-1234-1234-123456789abc");
assert.throws(() => core.pendingArticleKey("../../apiKey"), /identifier is invalid/);
assert.equal(core.validateSpecificationUrl("https://example.test/spec.md"), "https://example.test/spec.md");
assert.throws(() => core.validateSpecificationUrl("http://example.test/spec.md"), /must use HTTPS/);

const bundled = await core.loadCleaningSpecification();
assert.equal(bundled.source, "bundled");
assert.match(bundled.text, /Bundled specification/);

const schema = core.cleanArticleSchema();
assert.equal(schema.additionalProperties, false);
assert.ok(schema.required.includes("blocks"));
assert.equal(schema.properties.blocks.items.additionalProperties, false);

const rtf = await core.createDocument(cleanedArticle, "rtf");
assert.match(new TextDecoder().decode(rtf), /^\{\\rtf/);
const epub = await core.createDocument(cleanedArticle, "epub");
const epubZip = await context.JSZip.loadAsync(epub);
assert.equal(await epubZip.file("mimetype").async("string"), "application/epub+zip");
assert.ok(epubZip.file("META-INF/container.xml"));
const pdf = await core.createDocument(cleanedArticle, "pdf");
assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
const html = new TextDecoder().decode(await core.createDocument(cleanedArticle, "html"));
assert.match(html, /^<!doctype html>/);
assert.match(html, /<meta name="viewport"/);
assert.match(html, /background:#000/);
assert.match(html, /<strong>emphasis<\/strong>/);
assert.match(html, /href="https:\/\/example\.test\/article"/);

Object.assign(storageState, {
  specificationMode: "url",
  specificationUrl: "https://example.test/clean-article-spec.md"
});
const progressStages = [];
const queued = await core.queueArticle(
  { title: "Mock Article", html: "<article><p>Mock text.</p></article>", textLength: 240, url: "https://example.test/article" },
  { onProgress: (progress) => progressStages.push(progress.stage) }
);
assert.equal(queued.responseId, "resp_test");
assert.equal(queued.status, "queued");
assert.deepEqual(progressStages, ["settings", "specification", "submission"]);
const openAIRequest = requests.find((request) => request.url.endsWith("/responses") && request.options.method === "POST");
const requestBody = JSON.parse(openAIRequest.options.body);
assert.equal(requestBody.background, true);
assert.equal(requestBody.stream, false);
assert.equal(requestBody.store, true);
assert.equal(requestBody.tools, undefined);
assert.equal(requestBody.text.format.type, "json_schema");
assert.equal(requestBody.text.format.strict, true);
assert.match(requestBody.instructions, /External specification marker/);
assert.equal(storageState.jobs[0].mode, "background_manual_retrieval");
assert.equal(storageState.jobs[0].specificationSource, "url");
assert.equal(storageState.cachedSpecification, externalSpecification);

externalSpecificationAvailable = false;
const cached = await core.loadCleaningSpecification();
assert.equal(cached.source, "cache");
await assert.rejects(() => core.loadCleaningSpecification({ allowCache: false }), /could not be loaded/);

const retrieved = await core.retrieveJobDocument(queued.jobId);
assert.equal(retrieved.ready, true);
assert.equal(retrieved.job.status, "ready");
assert.equal(retrieved.job.lastCheckTransport, "fetch");
assert.equal(retrieved.job.lastCheckAttempts, 1);
assert.equal(retrieved.document.filename, "Mock Article.rtf");
assert.match(new TextDecoder().decode(retrieved.document.bytes), /^\{\\rtf/);
assert.equal((await core.listJobs())[0].status, "ready");
assert.equal(storageState.lastDiagnostic.status, "ready");
assert.equal(storageState.lastDiagnostic.stage, "manual-retrieval");
assert.equal("downloads" in context.browser, false, "Core retrieval must not require Firefox's downloads API.");

console.log("core submission, retrieval, and document-format tests passed");
