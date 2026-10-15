import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const contentPath = path.resolve(scriptDirectory, "..", "extension", "content", "content.js");
const pageText = "Substantial article text. ".repeat(30);
const clone = { outerHTML: `<article><p>${pageText}</p></article>`, querySelectorAll: () => [] };
const body = {
  innerText: pageText,
  querySelectorAll(selector) { return selector === "p" ? [{}] : []; },
  cloneNode() { return clone; }
};
let messageListener;
const storageState = {};

function createElement(tagName) {
  const listeners = {};
  return {
    tagName: tagName.toUpperCase(), dataset: {}, disabled: false, textContent: "", title: "",
    setAttribute() {}, append() {}, remove() {},
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatch(type) { return listeners[type]?.(); }
  };
}

const documentMock = {
  contentType: "text/html", body, baseURI: "https://example.test/article",
  documentElement: {
    lang: "en",
    appendChild() {}
  },
  title: "Android test article",
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById() { return null; },
  createElement
};

const context = vm.createContext({
  browser: {
    runtime: {
      getURL: (value) => `moz-extension://android-test/${value}`,
      getManifest: () => ({ version: "0.3.3-test" }),
      onMessage: {
        addListener(listener) { messageListener = listener; }
      }
    },
    storage: { local: {
      async set(values) { Object.assign(storageState, values); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storageState[key]; }
    } }
  },
  console,
  crypto: webcrypto,
  document: documentMock,
  location: { href: "https://example.test/article", hostname: "example.test" },
  navigator: { userAgent: "Mozilla/5.0 (Android 16; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0" },
  setTimeout,
  URL
});
context.globalThis = context;
context.window = context;
context.top = context;

vm.runInContext(await fs.readFile(contentPath, "utf8"), context, { filename: contentPath });
const result = await messageListener({ type: "prepare-article-for-save" });

assert.equal(result.ok, true);
assert.match(result.workerUrl, /^moz-extension:\/\/android-test\/worker\/worker\.html#[0-9a-f-]{36}$/i);
const pendingKeys = Object.keys(storageState).filter((key) => key.startsWith("pendingArticle:"));
assert.equal(pendingKeys.length, 1, "Menu activation must transfer one article to the visible worker.");
assert.equal(storageState[pendingKeys[0]].article.title, "Android test article");

console.log("Android extension-menu article routing test passed");
