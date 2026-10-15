import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backgroundPath = path.resolve(scriptDirectory, "..", "extension", "background.js");
let clickListener;
const messages = [];
const createdTabs = [];

const context = vm.createContext({
  browser: {
    action: {
      onClicked: { addListener(listener) { clickListener = listener; } },
      async setBadgeText() {},
      async setBadgeBackgroundColor() {},
      async setTitle() {}
    },
    tabs: {
      async sendMessage(tabId, message) {
        messages.push({ tabId, message });
        return {
          ok: true,
          workerUrl: "moz-extension://test/worker/worker.html#12345678-1234-4123-8123-123456789abc"
        };
      },
      async create(details) { createdTabs.push(details); }
    }
  },
  console
});

vm.runInContext(await fs.readFile(backgroundPath, "utf8"), context, { filename: backgroundPath });
await clickListener({ id: 42 });

assert.equal(messages.length, 1);
assert.equal(messages[0].tabId, 42);
assert.equal(messages[0].message.type, "prepare-article-for-save");
assert.equal(createdTabs.length, 1);
assert.equal(
  createdTabs[0].url,
  "moz-extension://test/worker/worker.html#12345678-1234-4123-8123-123456789abc"
);
assert.equal(createdTabs[0].active, true);

console.log("extension-menu activation route test passed");
