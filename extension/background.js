"use strict";

browser.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  try {
    await Promise.all([
      browser.action.setBadgeText({ tabId: tab.id, text: "" }),
      browser.action.setTitle({ tabId: tab.id, title: "Clean Article" })
    ]).catch(() => {});
    const result = await browser.tabs.sendMessage(tab.id, {
      type: "prepare-article-for-save"
    });
    if (!result?.ok || !result.workerUrl) {
      throw new Error(result?.error || "The article could not be prepared.");
    }
    await browser.tabs.create({ url: result.workerUrl, active: true });
  } catch (error) {
    const message = error?.message || String(error);
    await Promise.all([
      browser.action.setBadgeText({ tabId: tab.id, text: "!" }),
      browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b3261e" }),
      browser.action.setTitle({ tabId: tab.id, title: `Clean Article failed: ${message}` })
    ]).catch(() => {});
  }
});
