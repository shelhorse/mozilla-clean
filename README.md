# Clean Article

Clean Article is a relay-free Firefox for Android extension. When an article is
visible in Firefox, including after Bypass Paywalls Clean has reconstructed it,
tap **Save**. The extension sends that rendered article directly to OpenAI.
OpenAI cleans the article, creates the selected document in an ephemeral Code
Interpreter container, and returns the file to Firefox for download.

There is no Linux service, Docker container, relay URL, or relay token.

## Workflow

1. The content script captures the article currently rendered in Firefox.
2. The extension calls the OpenAI Responses API with Code Interpreter enabled.
3. OpenAI removes site chrome without summarizing or rewriting the article.
4. OpenAI creates a PDF, EPUB archive, or RTF document in its temporary
   container.
5. The extension downloads the container file directly from OpenAI, verifies
   its basic file signature, assigns the article title as the filename, and
   passes it to Firefox's download manager.
6. The extension requests deletion of the OpenAI container.

If a save fails, the exact failing stage and error are displayed on the article
page. A content-free diagnostic record is also available under **Last save
attempt** in extension settings. It contains timing, stage, format, model, and
article character count, but no API key, article text, title, or URL.

OpenAI documents both
[generated container files](https://developers.openai.com/api/docs/guides/tools-code-interpreter#work-with-files)
and the
[container-file download endpoint](https://developers.openai.com/api/reference/cli/resources/containers).

## Important API-key tradeoff

A relay normally keeps the OpenAI API key off the client. With a relay-free
design, the key must instead be stored in the Firefox extension's local profile
on the Android device. It is not included in the extension package and is sent
only to `api.openai.com`, but anyone who can extract the Firefox profile may be
able to recover it.

Use a dedicated OpenAI project for this extension, set a low project budget and
usage alerts, and revoke the key if the phone is lost. This is reasonable for a
personal sideloaded extension, but it is not an appropriate design for an
extension distributed to other users. OpenAI's production guidance recommends
keeping API keys in a secure server-side location.

## Build the extension

```bash
./scripts/build-extension.sh
```

This creates:

- `dist/clean-article-extension-unsigned.xpi`
- `dist/clean-article-extension-source.zip`

Firefox release builds require Mozilla signing. Upload
`clean-article-extension-unsigned.xpi` as a new version of the existing
**unlisted** extension in the
[Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/), then
download the signed XPI. Keep the source archive available, but upload it only
if AMO explicitly requests a separate source submission.

## Install on Firefox for Android

1. Save the Mozilla-signed XPI to the phone.
2. Open **Settings > About Firefox**.
3. Tap the Firefox logo five times.
4. Return to Settings and select **Install Extension from File**.
5. Select the signed XPI and approve the requested permissions.

These are Mozilla's current
[Android self-distribution instructions](https://extensionworkshop.com/documentation/publish/install-self-distributed/).

## Configure

1. Open **Firefox > Extensions > Clean Article**. The standard options entry in
   Manage Extensions opens the same settings page when Firefox exposes it.
2. Paste a project API key from the OpenAI Platform.
3. Choose EPUB, PDF, or RTF.
4. Leave the model at GPT-5.6 Luna unless you want to trade cost and speed for a
   stronger model.
5. Tap **Test connection**, then **Save settings**.

The API project must have billing or credits available. GPT-5.6 Luna does not
support the free API tier.

## Save an article

1. Open the article and let BPC finish reconstructing it.
2. Tap the floating **Save** button.
3. Wait while the button displays **Saving…**.
4. Firefox downloads the completed document.

The extension page itself shows no format choices. Those remain in extension
settings.

## Cleaning policy

The policy is stored in `extension/spec/clean-article-spec.md`. Because the
specification is packaged inside the signed extension, changing it requires a
version rebuild and another Mozilla signing submission.

## Tests

```bash
./scripts/test.sh
```

The tests validate JavaScript syntax, response citation parsing, file-signature
checks, filenames, manifest JSON, and extension packaging. A live OpenAI call
requires your API key and is intentionally not part of the automated suite.

## Current limitations

- Images are omitted. Sending article images through the direct API flow would
  materially increase request size and complexity.
- Document generation uses a hosted model tool, so it is slower and less
  deterministic than a fixed local converter. The extension rejects output
  with the wrong basic file signature, but this is not full EPUB or PDF
  conformance testing.
- If Code Interpreter fails to create exactly one cited output file, Save fails
  and can be retried.
- The key is stored in Firefox `storage.local`; Android's hardware-backed
  keystore is not available to ordinary Firefox extensions.
- The supplied XPI is unsigned. Mozilla signing is required for permanent use
  in Firefox release.

## Version 0.2.1

- Displays the full save error on the article page instead of only “Failed.”
- Records the failing pipeline stage and safe diagnostic metadata in Settings.
- Includes OpenAI request IDs in API errors when the response exposes one.

## Version 0.2.2

- Lowers the minimum supported Firefox desktop and Android version from 142 to
  140.
