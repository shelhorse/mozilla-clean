import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
const noopEvent = { addListener() {}, removeListener() {} };
const actionCalls = [];
let actionClickListener;
const context = vm.createContext({
  AbortController,
  Blob,
  Headers,
  TextDecoder,
  URL,
  Uint8Array,
  browser: {
    action: {
      onClicked: {
        addListener(listener) {
          actionClickListener = listener;
        }
      },
      setBadgeText(details) {
        actionCalls.push(["badge", details]);
      },
      setBadgeBackgroundColor(details) {
        actionCalls.push(["color", details]);
      },
      setTitle(details) {
        actionCalls.push(["title", details]);
      }
    },
    downloads: { onChanged: noopEvent },
    runtime: { onMessage: noopEvent },
    storage: { local: {} },
    tabs: {
      async sendMessage(tabId, message) {
        actionCalls.push(["message", { tabId, message }]);
        return { ok: true, filename: "Article.epub" };
      }
    }
  },
  clearTimeout() {},
  fetch: async () => {},
  setTimeout() {
    return 1;
  }
});

vm.runInContext(
  `${source}\nglobalThis.__test = { safeFilename, fileCitation, validateDocument };`,
  context
);

const { safeFilename, fileCitation, validateDocument } = context.__test;

assert.equal(safeFilename('A / Bad: "Name"', "epub"), "A Bad Name.epub");

const citation = fileCitation({
  output: [{
    type: "message",
    content: [{
      annotations: [{
        type: "container_file_citation",
        container_id: "cntr_test",
        file_id: "cfile_test",
        filename: "article.pdf"
      }]
    }]
  }]
});
assert.equal(citation.file_id, "cfile_test");

validateDocument(new TextEncoder().encode("%PDF-1.7 test").buffer, "pdf");
validateDocument(new TextEncoder().encode("PK\u0003\u0004mimetype application/epub+zip").buffer, "epub");
validateDocument(new TextEncoder().encode("{\\rtf1 test}").buffer, "rtf");
assert.throws(
  () => validateDocument(new TextEncoder().encode("not a document").buffer, "pdf"),
  /not valid PDF/
);

await actionClickListener({ id: 42 });
const messageCall = actionCalls.find(([kind]) => kind === "message");
assert.equal(messageCall[1].tabId, 42);
assert.equal(messageCall[1].message.type, "save-article-from-action");
assert.ok(actionCalls.some(([kind, details]) => (
  kind === "title" && details.title === "Saved Article.epub"
)));

console.log("background tests passed");
