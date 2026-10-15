"use strict";

const SETTINGS_DEFAULTS = {
  format: "epub", model: "gpt-5.6-luna", apiKey: "",
  specificationMode: "bundled", specificationUrl: "",
  importedSpecification: "", importedSpecificationName: ""
};
const form = document.querySelector("#settings-form");
const format = document.querySelector("#format");
const model = document.querySelector("#model");
const apiKey = document.querySelector("#api-key");
const status = document.querySelector("#status");
const testButton = document.querySelector("#test-button");
const endToEndTestButton = document.querySelector("#end-to-end-test-button");
const diagnosticSummary = document.querySelector("#diagnostic-summary");
const diagnosticDetails = document.querySelector("#diagnostic-details");
const jobsList = document.querySelector("#jobs-list");
const jobsEmpty = document.querySelector("#jobs-empty");
const specificationMode = document.querySelector("#specification-mode");
const specificationUrl = document.querySelector("#specification-url");
const specificationUrlFields = document.querySelector("#specification-url-fields");
const specificationImportFields = document.querySelector("#specification-import-fields");
const specificationFile = document.querySelector("#specification-file");
const importedSpecificationName = document.querySelector("#imported-specification-name");
const testSpecificationButton = document.querySelector("#test-specification-button");
const specificationStatus = document.querySelector("#specification-status");
const STAGE_LABELS = {
  settings: "Settings", specification: "Cleaning specification", submission: "OpenAI submission",
  transfer: "Firefox extension transfer", "submission-worker": "Visible submission tab", "manual-retrieval": "Manual retrieval"
};

function setText(id, value) { document.querySelector(`#${id}`).textContent = value; }
function updateSpecificationControls() {
  specificationUrlFields.hidden = specificationMode.value !== "url";
  specificationImportFields.hidden = specificationMode.value !== "imported";
}

function showSpecificationStatus(value) {
  if (!value) { specificationStatus.textContent = ""; return; }
  if (!value.ok) { specificationStatus.textContent = value.error || "The specification could not be loaded."; return; }
  const source = value.source === "cache" ? "cached external copy" : value.source === "url" ? "external URL" : value.source;
  const warning = value.warning ? ` The live URL failed, so the cached copy was used: ${value.warning}` : "";
  specificationStatus.textContent = `Ready: ${source}, ${Number(value.characters || 0).toLocaleString()} characters.${warning}`;
}
function showDiagnostic(diagnostic) {
  if (!diagnostic) { diagnosticSummary.textContent = "No save attempt has been recorded."; diagnosticDetails.hidden = true; return; }
  const labels = { working: "Submitting", queued: "Queued at OpenAI", ready: "Ready for download", error: "Failed" };
  diagnosticSummary.textContent = labels[diagnostic.status] || diagnostic.status;
  setText("diagnostic-time", new Date(diagnostic.timestamp).toLocaleString());
  setText("diagnostic-result", labels[diagnostic.status] || diagnostic.status);
  setText("diagnostic-stage", STAGE_LABELS[diagnostic.stage] || diagnostic.stage);
  setText("diagnostic-format", String(diagnostic.format || "unknown").toUpperCase());
  setText("diagnostic-model", diagnostic.model || "unknown");
  setText("diagnostic-elapsed", Number.isFinite(diagnostic.elapsedMs) ? `${(diagnostic.elapsedMs / 1000).toFixed(1)} seconds` : "Not recorded");
  setText("diagnostic-length", Number(diagnostic.articleTextLength || 0).toLocaleString());
  setText("diagnostic-error", diagnostic.error || "None");
  document.querySelector("#diagnostic-error-row").hidden = !diagnostic.error;
  diagnosticDetails.hidden = false;
}

function renderJobs(jobs) {
  jobsList.replaceChildren(); jobsEmpty.hidden = Boolean(jobs?.length);
  const labels = {
    queued: "Queued", in_progress: "Processing", completed: "Completed", ready: "Ready for download",
    error: "Failed", unavailable: "Unavailable"
  };
  for (const job of jobs || []) {
    const item = document.createElement("li"); const heading = document.createElement("strong");
    heading.textContent = job.title || job.filename || "Untitled article";
    const details = document.createElement("span"); const created = job.createdAt ? new Date(job.createdAt).toLocaleString() : "Unknown time";
    const checked = job.lastCheckAt ? ` · checked ${new Date(job.lastCheckAt).toLocaleString()}` : "";
    const transport = job.lastCheckTransport ? ` · ${job.lastCheckTransport.toUpperCase()}` : "";
    details.textContent = `${labels[job.status] || job.status} · ${String(job.format || "").toUpperCase()} · ${created}${checked}${transport}`;
    item.append(heading, details);
    if (job.error || job.lastCheckError) { const error = document.createElement("small"); error.textContent = job.error || `Last check: ${job.lastCheckError}`; item.appendChild(error); }
    jobsList.appendChild(item);
  }
}

async function restore() {
  const values = await browser.storage.local.get(SETTINGS_DEFAULTS);
  format.value = values.format; model.value = values.model; apiKey.value = values.apiKey;
  specificationMode.value = values.specificationMode;
  specificationUrl.value = values.specificationUrl;
  importedSpecificationName.textContent = values.importedSpecificationName
    ? `Imported: ${values.importedSpecificationName} (${values.importedSpecification.length.toLocaleString()} characters)`
    : "No specification has been imported.";
  updateSpecificationControls();
  const stored = await browser.storage.local.get({ lastDiagnostic: null, jobs: [], specificationStatus: null });
  showDiagnostic(stored.lastDiagnostic); renderJobs(stored.jobs); showSpecificationStatus(stored.specificationStatus);
}
async function save() {
  await browser.storage.local.set({
    format: format.value, model: model.value, apiKey: apiKey.value.trim(),
    specificationMode: specificationMode.value, specificationUrl: specificationUrl.value.trim()
  });
}

specificationMode.addEventListener("change", updateSpecificationControls);
specificationFile.addEventListener("change", async () => {
  const file = specificationFile.files?.[0]; if (!file) return;
  try {
    const text = (await file.text()).trim();
    if (text.length < 20) throw new Error("The selected specification is empty or too short.");
    if (text.length > 100000) throw new Error("The selected specification exceeds 100,000 characters.");
    await browser.storage.local.set({
      importedSpecification: text, importedSpecificationName: file.name,
      specificationMode: "imported", specificationStatus: null
    });
    specificationMode.value = "imported"; importedSpecificationName.textContent = `Imported: ${file.name} (${text.length.toLocaleString()} characters)`;
    updateSpecificationControls(); specificationStatus.textContent = "Imported specification saved in Firefox.";
  } catch (error) { specificationStatus.textContent = error.message; }
});

testSpecificationButton.addEventListener("click", async () => {
  testSpecificationButton.disabled = true; specificationStatus.textContent = "Loading specification…";
  try {
    await save();
    const specification = await CleanArticleCore.loadCleaningSpecification({ allowCache: false });
    showSpecificationStatus({
      ok: true, source: specification.source, name: specification.name,
      characters: specification.text.length, fetchedAt: specification.fetchedAt || ""
    });
  } catch (error) { specificationStatus.textContent = error.message; }
  finally { testSpecificationButton.disabled = false; }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault(); status.textContent = "Saving…";
  try { await save(); status.textContent = "Settings saved."; } catch (error) { status.textContent = error.message; }
});
testButton.addEventListener("click", async () => {
  status.textContent = "Testing OpenAI…";
  try {
    await save();
    const config = await CleanArticleCore.loadSettings();
    const connectedModel = await CleanArticleCore.openAI(`/models/${encodeURIComponent(config.model)}`);
    status.textContent = `Connected. Model: ${connectedModel.id}.`;
  }
  catch (error) { status.textContent = error.message; }
});

function openSelfTestWorker() {
  const transferId = crypto.randomUUID();
  const workerWindow = window.open(`${browser.runtime.getURL("worker/worker.html")}#${transferId}`, "_blank");
  if (!workerWindow) throw new Error("Firefox blocked the processing tab.");
  try { workerWindow.opener = null; } catch { /* cross-origin WindowProxy */ }
  return transferId;
}

endToEndTestButton.addEventListener("click", async () => {
  status.textContent = "Submitting self-test…";
  let transferId = "";
  try {
    transferId = openSelfTestWorker();
    await save();
    await browser.storage.local.set({
      [`pendingArticle:${transferId}`]: { createdAt: Date.now(), article: CleanArticleCore.selfTestArticle() }
    });
    status.textContent = "Self-test opened in a processing page. Use Retrieve document there after submission.";
    const stored = await browser.storage.local.get({ jobs: [] }); renderJobs(stored.jobs);
  } catch (error) {
    status.textContent = error.message;
    if (transferId) {
      await browser.storage.local.set({
        [`pendingArticle:${transferId}`]: { createdAt: Date.now(), error: error.message }
      }).catch(() => {});
    }
  }
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.jobs) renderJobs(changes.jobs.newValue || []);
  if (changes.lastDiagnostic) showDiagnostic(changes.lastDiagnostic.newValue);
  if (changes.specificationStatus) showSpecificationStatus(changes.specificationStatus.newValue);
});
restore();
