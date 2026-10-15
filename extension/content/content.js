"use strict";

(() => {
  if (window.top !== window || document.contentType !== "text/html") {
    return;
  }

  const ERROR_ID = "clean-article-error-panel";
  const PENDING_ARTICLE_PREFIX = "pendingArticle:";
  const WORKER_PAGE = "worker/worker.html";
  const MAX_HTML_CHARACTERS = 1_600_000;
  const EXCLUDED_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "canvas",
    "svg",
    "img",
    "picture",
    "video",
    "audio",
    "source",
    "form",
    "input",
    "textarea",
    "select",
    "button",
    "nav",
    "footer",
    "aside",
    "[role='navigation']",
    "[role='dialog']",
    "[aria-hidden='true']",
    ".advertisement",
    ".advertising",
    ".ad-container",
    ".newsletter-signup",
    ".subscription-widget",
    ".social-share",
    ".comments",
    `#${ERROR_ID}`
  ].join(",");

  function firstMeta(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.content
        || node?.getAttribute?.("content")
        || node?.getAttribute?.("href")
        || node?.getAttribute?.("datetime")
        || node?.textContent;
      if (value?.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  function scoreCandidate(element) {
    const text = element.innerText?.trim() || "";
    if (text.length < 200) {
      return -1;
    }
    const paragraphs = element.querySelectorAll("p").length;
    const headings = element.querySelectorAll("h1,h2,h3").length;
    const linkText = [...element.querySelectorAll("a")]
      .reduce((total, link) => total + (link.innerText?.length || 0), 0);
    const linkPenalty = text.length ? (linkText / text.length) * 2000 : 0;
    return text.length + paragraphs * 120 + headings * 80 - linkPenalty;
  }

  function findArticleRoot() {
    const selectors = [
      "article",
      "main article",
      "[role='main'] article",
      "main",
      "[role='main']",
      "[itemprop='articleBody']",
      ".article-body",
      ".story-body",
      ".entry-content"
    ];
    const candidates = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        candidates.add(element);
      }
    }
    candidates.add(document.body);

    return [...candidates]
      .map((element) => ({ element, score: scoreCandidate(element) }))
      .sort((a, b) => b.score - a.score)[0]?.element || document.body;
  }

  function absoluteUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return "";
    }
  }

  function imageSource(image) {
    const direct = image.getAttribute("src")
      || image.getAttribute("data-src")
      || image.getAttribute("data-original")
      || image.getAttribute("data-lazy-src");
    if (direct) return direct;

    const srcset = image.getAttribute("srcset")
      || image.getAttribute("data-srcset")
      || "";
    const candidates = srcset
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
      .filter(Boolean);
    return candidates.at(-1) || "";
  }

  function cleanClone(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(EXCLUDED_SELECTOR).forEach((node) => node.remove());

    clone.querySelectorAll("a").forEach((link) => {
      const href = absoluteUrl(link.getAttribute("href"));
      if (href) link.setAttribute("href", href);
      else link.removeAttribute("href");
    });

    clone.querySelectorAll("img").forEach((image) => {
      const source = imageSource(image);
      const src = absoluteUrl(source);
      if (src) image.setAttribute("src", src);
      else image.remove();
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.setAttribute("loading", "eager");
    });

    clone.querySelectorAll("*").forEach((element) => {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        if (
          name === "class"
          || name === "id"
          || name === "style"
          || name.startsWith("on")
          || name.startsWith("data-")
          || name === "tabindex"
          || name === "contenteditable"
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    });
    return clone;
  }

  function extractArticle() {
    const root = findArticleRoot();
    const clone = cleanClone(root);
    let html = clone.outerHTML;
    if (html.length > MAX_HTML_CHARACTERS) {
      html = `<article><p>${(root.innerText || "")
        .slice(0, MAX_HTML_CHARACTERS)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll(/\n{2,}/g, "</p><p>")}</p></article>`;
    }

    return {
      url: location.href,
      canonicalUrl: firstMeta(["link[rel='canonical']"]),
      title: firstMeta([
        "meta[property='og:title']",
        "meta[name='twitter:title']",
        "h1"
      ]) || document.title,
      subtitle: firstMeta([
        "meta[name='description']",
        "meta[property='og:description']",
        "[class*='subtitle']",
        "[class*='dek']"
      ]),
      byline: firstMeta([
        "meta[name='author']",
        "meta[property='article:author']",
        "[rel='author']",
        "[class*='byline']"
      ]),
      published: firstMeta([
        "meta[property='article:published_time']",
        "meta[name='date']",
        "time[datetime]"
      ]),
      publication: firstMeta([
        "meta[property='og:site_name']",
        "meta[name='application-name']"
      ]) || location.hostname,
      language: document.documentElement.lang || "",
      html,
      textLength: (root.innerText || "").trim().length
    };
  }

  function clearError() {
    document.getElementById(ERROR_ID)?.remove();
  }

  function showError(message) {
    clearError();
    const panel = document.createElement("div");
    panel.id = ERROR_ID;
    panel.setAttribute("role", "alert");

    const heading = document.createElement("strong");
    heading.textContent = "Clean Article could not save this page";

    const detail = document.createElement("span");
    detail.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", clearError);

    panel.append(heading, detail, close);
    document.documentElement.appendChild(panel);
  }

  async function recordTransferError(error, article, startedAt) {
    try {
      await browser.storage.local.set({
        lastDiagnostic: {
          extensionVersion: browser.runtime.getManifest().version,
          timestamp: new Date().toISOString(),
          status: "error",
          stage: error.cleanArticleStage || "worker",
          format: "See current settings",
          model: "See current settings",
          articleTextLength: article?.textLength || 0,
          elapsedMs: Date.now() - startedAt,
          error: error?.message || String(error)
        }
      });
    } catch {
      // Preserve the original transfer error.
    }
  }

  async function handArticleToWorker(transferId, article) {
    const articleKey = `${PENDING_ARTICLE_PREFIX}${transferId}`;
    try {
      await browser.storage.local.set({
        [articleKey]: {
          createdAt: Date.now(),
          article
        }
      });
    } catch (error) {
      error.cleanArticleStage = "transfer";
      throw error;
    }
  }

  let saveInProgress = false;

  async function prepareArticle() {
    if (saveInProgress) {
      return { ok: false, error: "An article is already being prepared." };
    }

    saveInProgress = true;
    const startedAt = Date.now();
    let article;
    const transferId = crypto.randomUUID();
    clearError();
    try {
      article = extractArticle();
      if (article.textLength < 200) {
        throw new Error("No substantial article text was found.");
      }
      await handArticleToWorker(transferId, article);
      return {
        ok: true,
        workerUrl: `${browser.runtime.getURL(WORKER_PAGE)}#${transferId}`
      };
    } catch (error) {
      console.error("Clean Article:", error);
      if (error.cleanArticleStage === "transfer") {
        await recordTransferError(error, article, startedAt);
      }
      const message = error?.message || String(error);
      showError(message);
      return { ok: false, error: message };
    } finally {
      saveInProgress = false;
    }
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "prepare-article-for-save") {
      return prepareArticle();
    }
    return false;
  });
})();
