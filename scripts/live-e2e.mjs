import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const extensionDirectory = path.join(projectDirectory, "extension");
const configPath = path.resolve(projectDirectory, process.env.CLEAN_ARTICLE_LIVE_CONFIG || "live-test.config.json");
const outputDirectory = path.join(projectDirectory, "live-test-output");

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function requireString(config, key) {
  const value = String(config[key] || "").trim();
  if (!value) throw new Error(`Set ${key} in ${path.basename(configPath)}.`);
  return value;
}

async function loadConfig() {
  let source;
  try { source = await fs.readFile(configPath, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`Missing ${configPath}. Copy live-test.config.example.json to live-test.config.json, add the API key, and run chmod 600 live-test.config.json.`);
    throw error;
  }
  const mode = (await fs.stat(configPath)).mode & 0o777;
  if (mode & 0o077) throw new Error(`${configPath} contains an API key and must not be group- or world-readable. Run chmod 600 live-test.config.json.`);
  const config = JSON.parse(source);
  config.apiKey = requireString(config, "apiKey"); config.model = requireString(config, "model"); config.format = String(config.format || "rtf").trim();
  if (!["epub", "pdf", "rtf", "html"].includes(config.format)) throw new Error("format must be epub, pdf, rtf, or html.");
  return config;
}

function createStorage(initialState) {
  const state = { ...initialState };
  return { state, local: {
    async get(query) {
      if (typeof query === "string") return { [query]: state[query] };
      const result = { ...(query || {}) }; for (const key of Object.keys(query || {})) if (Object.hasOwn(state, key)) result[key] = state[key]; return result;
    },
    async set(values) { Object.assign(state, values); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key]; }
  } };
}

async function main() {
  const config = await loadConfig(); const storage = createStorage(config);
  await fs.mkdir(outputDirectory, { recursive: true });
  const specificationUrl = "moz-extension://live/spec/clean-article-spec.md";
  const liveFetch = async (url, options = {}) => {
    if (String(url) === specificationUrl) {
      return new Response(await fs.readFile(path.join(extensionDirectory, "spec", "clean-article-spec.md"), "utf8"), {
        status: 200,
        headers: { "Content-Type": "text/markdown; charset=utf-8" }
      });
    }
    return fetch(url, options);
  };
  const context = vm.createContext({
    AbortController, Blob, Headers, Response, TextDecoder, TextEncoder, URL, Uint8Array,
    browser: {
      runtime: {
        getManifest: () => ({ version: "live-e2e" }),
        getURL: (value) => `moz-extension://live/${value}`,
        getPlatformInfo: async () => ({ os: "linux" })
      },
      storage: { local: storage.local }
    },
    clearTimeout, console, crypto: webcrypto, fetch: liveFetch,
    setTimeout: (...args) => { const timer = setTimeout(...args); if (Number(args[1]) >= 60000) timer.unref(); return timer; }
  });
  context.globalThis = context; context.self = context; context.window = context;
  for (const file of ["vendor/jszip.min.js", "vendor/pdf-lib.min.js", "core.js"]) {
    const filename = path.join(extensionDirectory, file);
    vm.runInContext(await fs.readFile(filename, "utf8"), context, { filename });
  }
  const core = context.CleanArticleCore; assert.ok(core, "CleanArticleCore did not load.");
  console.log(`Starting live ${config.format.toUpperCase()} test with ${config.model}.`);
  console.log("This uses the production extension core. No Google account or relay is involved.");
  const queued = await core.queueArticle(core.selfTestArticle());
  console.log(`Queued OpenAI response ${queued.responseId}.`);
  const deadline = Date.now() + 20 * 60 * 1000; let previousStatus = "";
  while (Date.now() < deadline) {
    const retrieved = await core.retrieveJobDocument(queued.jobId);
    const job = retrieved.job;
    if (job.status !== previousStatus) { console.log(`${new Date().toISOString()} ${job.status}`); previousStatus = job.status; }
    if (retrieved.ready) {
      const outputPath = path.join(outputDirectory, path.basename(retrieved.document.filename));
      const bytes = Buffer.from(retrieved.document.bytes);
      await fs.writeFile(outputPath, bytes);
      if (config.format === "rtf") assert.match(bytes.subarray(0, 6).toString(), /^\{\\rtf/);
      if (config.format === "pdf") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      if (config.format === "html") assert.match(bytes.subarray(0, 15).toString().toLowerCase(), /^<!doctype html>/);
      if (config.format === "epub") {
        const zip = await context.JSZip.loadAsync(bytes); assert.equal(await zip.file("mimetype").async("string"), "application/epub+zip");
      }
      console.log(`PASS: ${outputPath}`); return;
    }
    if (["error", "unavailable"].includes(job.status)) throw new Error(job.error || `The live test ended with status ${job.status}.`);
    await delay(10000);
  }
  throw new Error("The live test did not finish within 20 minutes.");
}

main().catch((error) => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
