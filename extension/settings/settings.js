"use strict";

const DEFAULTS = {
  format: "epub",
  model: "gpt-5.6-luna",
  apiKey: ""
};

const form = document.querySelector("#settings-form");
const format = document.querySelector("#format");
const model = document.querySelector("#model");
const apiKey = document.querySelector("#api-key");
const status = document.querySelector("#status");
const testButton = document.querySelector("#test-button");
const diagnosticSummary = document.querySelector("#diagnostic-summary");
const diagnosticDetails = document.querySelector("#diagnostic-details");

const STAGE_LABELS = {
  settings: "Settings",
  specification: "Cleaning specification",
  response: "OpenAI document generation",
  citation: "Generated-file lookup",
  fileDownload: "OpenAI file download",
  validation: "RTF/PDF/EPUB validation",
  firefoxDownload: "Firefox download",
  complete: "Complete"
};

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function showDiagnostic(diagnostic) {
  if (!diagnostic) {
    diagnosticSummary.textContent = "No save attempt has been recorded.";
    diagnosticDetails.hidden = true;
    return;
  }

  const statusLabels = {
    working: "In progress",
    success: "Saved successfully",
    error: "Failed"
  };
  diagnosticSummary.textContent = statusLabels[diagnostic.status] || diagnostic.status;
  setText("diagnostic-time", new Date(diagnostic.timestamp).toLocaleString());
  setText("diagnostic-result", statusLabels[diagnostic.status] || diagnostic.status);
  setText("diagnostic-stage", STAGE_LABELS[diagnostic.stage] || diagnostic.stage);
  setText("diagnostic-format", String(diagnostic.format || "unknown").toUpperCase());
  setText("diagnostic-model", diagnostic.model || "unknown");
  setText(
    "diagnostic-elapsed",
    Number.isFinite(diagnostic.elapsedMs) ? `${(diagnostic.elapsedMs / 1000).toFixed(1)} seconds` : "Not recorded"
  );
  setText("diagnostic-length", Number(diagnostic.articleTextLength || 0).toLocaleString());
  setText("diagnostic-error", diagnostic.error || "None");
  document.querySelector("#diagnostic-error-row").hidden = !diagnostic.error;
  diagnosticDetails.hidden = false;
}

async function restore() {
  const values = await browser.storage.local.get(DEFAULTS);
  format.value = values.format;
  model.value = values.model;
  apiKey.value = values.apiKey;
  const diagnostics = await browser.storage.local.get("lastDiagnostic");
  showDiagnostic(diagnostics.lastDiagnostic);
}

async function save() {
  await browser.storage.local.set({
    format: format.value,
    model: model.value,
    apiKey: apiKey.value.trim()
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Saving…";
  try {
    await save();
    status.textContent = "Settings saved.";
  } catch (error) {
    status.textContent = `Could not save settings: ${error.message}`;
  }
});

testButton.addEventListener("click", async () => {
  status.textContent = "Testing…";
  testButton.disabled = true;
  try {
    await save();
    const result = await browser.runtime.sendMessage({ type: "test-connection" });
    if (!result?.ok) {
      throw new Error(result?.error || "OpenAI did not respond.");
    }
    status.textContent = `Connected. Model: ${result.model}.`;
  } catch (error) {
    status.textContent = `Connection failed: ${error.message}`;
  } finally {
    testButton.disabled = false;
  }
});

restore().catch((error) => {
  status.textContent = `Could not load settings: ${error.message}`;
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.lastDiagnostic) {
    showDiagnostic(changes.lastDiagnostic.newValue);
  }
});
