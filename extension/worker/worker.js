"use strict";

(() => {
  const PENDING_ARTICLE_PREFIX = "pendingArticle:";
  const ARTICLE_WAIT_MS = 20000;
  const retrieval = document.getElementById("retrieval");
  const retrieveButton = document.getElementById("retrieve-button");
  const retrievalMessage = document.getElementById("retrieval-message");
  const downloadArea = document.getElementById("download-area");
  let currentJobId = "";
  let downloadUrl = "";

  function transferIdFromLocation() {
    const transferId = String(location.hash || "").slice(1);
    if (!/^[0-9a-f-]{36}$/i.test(transferId)) throw new Error("This processing tab has an invalid article identifier.");
    return transferId;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function show(state, status, detail, note = "") {
    document.body.dataset.state = state;
    document.getElementById("status").textContent = status;
    document.getElementById("detail").textContent = detail;
    if (note) document.getElementById("note").textContent = note;
  }

  async function waitForArticle(transferId) {
    const key = `${PENDING_ARTICLE_PREFIX}${transferId}`;
    const deadline = Date.now() + ARTICLE_WAIT_MS;
    while (Date.now() < deadline) {
      const stored = await browser.storage.local.get(key);
      const pending = stored[key];
      if (pending?.error) {
        await browser.storage.local.remove(key);
        throw new Error(pending.error);
      }
      if (pending?.article && typeof pending.article === "object") {
        await browser.storage.local.remove(key);
        return pending.article;
      }
      await sleep(100);
    }
    throw new Error("The article did not reach this processing tab. Return to the article and select Clean Article again.");
  }

  async function requestWakeLock() {
    try {
      if (navigator.wakeLock && document.visibilityState === "visible") {
        return await navigator.wakeLock.request("screen");
      }
    } catch { /* best effort */ }
    return null;
  }

  function elapsedLabel(startedAt) {
    const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
  }

  function renderProgress(progress, articleTitle, startedAt) {
    const elapsed = elapsedLabel(startedAt);
    const title = articleTitle || "Untitled article";
    if (progress.stage === "settings") {
      show("working", "Checking settings…", `${title} · ${elapsed}`);
    } else if (progress.stage === "specification") {
      show("working", "Loading cleaning rules…", `${title} · ${elapsed}`);
    } else if (progress.stage === "submission") {
      show("working", "Submitting to OpenAI…", `${title} · ${elapsed}`);
    }
  }

  function clearDownload() {
    downloadArea.replaceChildren();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = "";
  }

  function showRetrieval(job) {
    currentJobId = job?.jobId || job?.id || "";
    retrieval.hidden = false;
    retrieveButton.hidden = false;
    retrieveButton.disabled = false;
    retrieveButton.textContent = "Retrieve document";
    retrievalMessage.textContent = "Tap Retrieve document to check whether OpenAI has finished.";
    clearDownload();
  }

  async function retrieveDocument() {
    if (!currentJobId) {
      retrievalMessage.textContent = "The submitted job identifier is missing.";
      return;
    }
    retrieveButton.disabled = true;
    retrieveButton.textContent = "Retrieving…";
    retrievalMessage.textContent = "Checking this response with OpenAI…";
    clearDownload();

    try {
      const result = await CleanArticleCore.retrieveJobDocument(currentJobId);
      currentJobId = result.job.id;
      if (!result.ready) {
        retrievalMessage.textContent = "Not ready yet. Wait a little, then tap Retrieve document again.";
        retrieveButton.disabled = false;
        retrieveButton.textContent = "Retrieve document";
        return;
      }

      const blob = new Blob([result.document.bytes], { type: result.document.mime });
      const download = document.createElement("a");
      download.className = "download";
      downloadUrl = URL.createObjectURL(blob);
      download.href = downloadUrl;
      download.download = result.document.filename;
      download.textContent = `Download ${String(result.document.format).toUpperCase()}`;
      download.addEventListener("click", () => {
        retrievalMessage.textContent = "Download requested. Firefox will show its download notification.";
      });
      downloadArea.appendChild(download);
      retrieveButton.hidden = true;
      retrievalMessage.textContent = "Ready. Tap the green Download button to save the file.";
    } catch (error) {
      retrievalMessage.textContent = error?.message || String(error);
      retrieveButton.disabled = false;
      retrieveButton.textContent = "Retrieve document";
    }
  }

  async function run() {
    let wakeLock = null;
    let progressTimer = null;
    try {
      window.opener = null;
      wakeLock = await requestWakeLock();
      const transferId = transferIdFromLocation();
      show("working", "Receiving article…", "Waiting for the article page to finish transferring its content.");
      const article = await waitForArticle(transferId);
      const startedAt = Date.now();
      let latestProgress = { stage: "settings" };
      const updateProgress = (progress) => {
        latestProgress = progress;
        renderProgress(latestProgress, article.title, startedAt);
      };
      updateProgress(latestProgress);
      progressTimer = window.setInterval(() => renderProgress(latestProgress, article.title, startedAt), 1000);
      const job = await CleanArticleCore.queueArticle(article, { onProgress: updateProgress });
      window.clearInterval(progressTimer);
      progressTimer = null;
      show(
        "success",
        "Submitted",
        job.filename,
        "The response is stored at OpenAI. Retrieve it here when it is ready."
      );
      showRetrieval(job);
      return job;
    } catch (error) {
      console.error("Clean Article worker:", error);
      show("error", "Could not submit article", error?.message || String(error), "This tab can be closed. The error is also recorded in Clean Article settings.");
      try {
        await browser.storage.local.set({
          lastDiagnostic: {
            extensionVersion: browser.runtime.getManifest().version,
            timestamp: new Date().toISOString(),
            status: "error",
            stage: "submission-worker",
            error: error?.message || String(error)
          }
        });
      } catch { /* preserve the original error */ }
      throw error;
    } finally {
      if (progressTimer !== null) window.clearInterval(progressTimer);
      try { await wakeLock?.release(); } catch { /* best effort */ }
    }
  }

  retrieveButton.addEventListener("click", retrieveDocument);
  globalThis.CleanArticleWorker = Object.freeze({
    run,
    transferIdFromLocation,
    waitForArticle,
    showRetrieval,
    retrieveDocument
  });
  if (!globalThis.CLEAN_ARTICLE_WORKER_TEST) run().catch(() => {});
})();
