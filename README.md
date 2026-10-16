# Clean Article

Clean Article 0.3.4 is a relay-free Firefox extension for Android and desktop.
It captures the article currently displayed, asks OpenAI to clean it, and creates
an EPUB, PDF, RTF, or self-contained HTML file locally in Firefox.

The result is a portable, distraction-free document that preserves the article's
title, byline, headings, links, and substantive text while removing page chrome,
ads, prompts, and other unrelated material.

There is no hosted relay, Linux service, Google account, automatic polling loop,
or Firefox Downloads API dependency. The background script only handles the
user's click on the extension action.

## Use Clean Article

1. Open an article and wait for it to finish rendering.
2. Open Firefox's **Extensions** menu and select **Clean Article**.
3. A visible Clean Article tab opens and submits one durable OpenAI background
   response with `background: true`, `stream: false`, and `store: true`.
4. Wait until the page says **Submitted**. The OpenAI response ID is now stored
   in the Firefox profile.
5. Tap **Retrieve document** on that page.
6. If OpenAI is still working, the page says **Not ready yet**. Wait a little and
   tap **Retrieve document** again.
7. If it is complete, the extension creates the selected file locally and shows
   a **Download EPUB**, **Download PDF**, **Download RTF**, or **Download HTML**
   link. Tap that link once.

Keep the processing page open until the document has been downloaded. The job
record remains in Settings if the page is closed, but version 0.3.4 does not
recreate a closed processing page.

Firefox shows its normal download notification after the Download link is
tapped. The file then appears in Firefox Downloads and the device's Downloads
folder, subject to the device's normal download settings.

## Why retrieval is manual

Firefox submits the article and OpenAI stores the generated response. Retrieval
only runs while the processing page is visible and the user taps **Retrieve
document**.

Each Retrieve tap makes one request for the saved response ID:

- Firefox for Android uses one `XMLHttpRequest`.
- Desktop Firefox uses one `fetch` request.
- No fallback chain or retry loop runs behind the user's back.
- No `browser.downloads.download()` call is made. A completed file is exposed as
  a normal, user-tapped `<a download>` link on the processing page.

Mozilla fixed user-initiated download links in Firefox for Android extension
pages in Firefox 130. Clean Article requires Firefox 140 or later. See
[Mozilla bug 1867717](https://bugzilla.mozilla.org/show_bug.cgi?id=1867717).

This follows OpenAI's documented background-response flow: start a response in
background mode, then retrieve the response by ID. The documented working states
are `queued` and `in_progress`; any other status is terminal. See
[OpenAI background mode](https://developers.openai.com/api/docs/guides/background).

Responses are stored for at least 30 days by default when `store: true` is
honored. Zero Data Retention projects are an exception: background response data
is temporarily retained for roughly 10 minutes. See
[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint).

## One-time setup

1. Use a dedicated OpenAI project and API key for this extension.
2. Enable billing, set a project budget, and configure usage alerts.
3. Open Firefox's extension manager, select Clean Article, and open **Settings**
   or **Options**.
4. Enter the API key, choose the OpenAI model and document format, and save.
5. Use **Test OpenAI** for a quick credential check.
6. Use **Run submission self-test**, wait for **Submitted**, then tap **Retrieve
   document** on the processing page.

## Cleaning specification

Settings offers three specification sources:

- **Bundled default** uses the specification packaged with the extension.
- **External HTTPS URL** downloads the current Markdown file for each new
  article. The last successful copy is cached for temporary outages.
- **Imported Markdown file** stores a copy in the Firefox profile. Re-import it
  after changing the original file.

Use **Load specification now** to validate the selected source. The external
specification host receives only a request for that file, without the API key or
article content.

## Processing states

The processing page and the recent-jobs list in Settings can display:

- **Queued at OpenAI**: OpenAI accepted the response.
- **Processing at OpenAI**: OpenAI is still working.
- **Ready to retrieve**: a previous retrieval completed; tap **Retrieve
  document** again to recreate the Download link.
- **OpenAI job failed**: OpenAI returned a terminal error.
- **Stored response unavailable**: OpenAI could not find the response ID, usually
  because its retention period ended.

Do not clear the extension's storage before retrieving a document because the
response ID is stored there. Keep the processing page open so its **Retrieve
document** control remains available.

## Build and test

```bash
./scripts/test.sh
./scripts/package-project.sh
```

The build produces:

- `dist/clean-article-0.3.4-unsigned.xpi`
- `dist/clean-article-0.3.4-source.zip`
- `dist/clean-article-0.3.4-project.zip`

Firefox release builds require Mozilla signing. Upload the unsigned XPI as a new
version of the existing unlisted extension in the
[Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/), then
download Mozilla's signed XPI.

The automated suite verifies:

- all JavaScript and manifest syntax;
- durable submission with `background: true`, `stream: false`, and `store: true`;
- extension-menu activation and visible processing-page submission;
- exactly one Android retrieval request using `XMLHttpRequest`;
- queued responses returning **Not ready yet**;
- completed responses producing a literal user-tapped download anchor;
- absence of alarms and downloads permissions;
- absence of `browser.downloads` and `browser.alarms` source calls;
- RTF, EPUB, PDF, and HTML generation;
- packaged XPI integrity.

## Optional live API test

Copy the example configuration, protect the API key, and run the live test:

```bash
cp live-test.config.example.json live-test.config.json
chmod 600 live-test.config.json
node scripts/live-e2e.mjs
```

The live test uses the production request and formatter. Its command-line test
runner checks the saved response until it is complete and writes the file under
`live-test-output/`. The released extension itself does not poll.

## Install on Firefox for Android

1. Save the Mozilla-signed XPI to the phone.
2. Open **Settings > About Firefox**.
3. Tap the Firefox logo five times.
4. Return to Settings and select **Install Extension from File**.
5. Select the signed XPI and approve the requested permissions.

The extension requires Firefox 140 or later.

## Security and privacy

- The API key is stored in Firefox `storage.local` and is not included in the
  XPI. Anyone who can extract the Firefox profile may be able to recover it.
- The selected article, URL, visible content, and cleaning specification are sent
  directly from Firefox to OpenAI.
- The article is treated as untrusted data. The prompt tells the model to ignore
  commands embedded in article content.
- Document creation occurs locally on the processing page. No credentials or
  article data are sent to Google or a separate relay.
- This client-side credential design is intended for a personal sideloaded
  extension, not a public multi-user extension.

## Current release

### 0.3.4

- Starts from the **Clean Article** entry in Firefox's extensions menu without
  injecting controls into the article page.
- Opens a visible processing page for submission, manual retrieval, and the
  final green Download button.
- Fixes processing-page retrieval by passing the stored `jobId` returned by
  submission to the manual retrieval function.
- Supports HTML, EPUB, PDF, and RTF output without automatic polling or the
  Firefox Downloads API.
