# Tencent 9router image fix, 6 November 2026

Applied over the authorized SSH host `tencent` to the installed **9router 0.5.111** runtime. The service is `9router.service`, bound to `127.0.0.1:20128`.

## Changes deployed

- Removed the forced `reasoning: { effort: "medium", summary: "auto" }` from Codex image-generation requests. The provider rejects that complexity value for the image tool.
- Surface the real upstream `error`, `response.failed`, and `response.incomplete` messages instead of hiding them behind the generic paid-plan error.
- Forward Gemini `image_size` through the Antigravity image adapter and preserve it as `generationConfig.imageConfig.imageSize` in the executor.
- Retain source-image references, model choice, and source aspect ratio. No model fallback or local image resizing was added.

The runtime patch is reproducible with [patch-ninerouter-images.mjs](../../scripts/patch-ninerouter-images.mjs). It intentionally checks the exact installed version and unique bundle fragments; it stops on a mismatch instead of guessing. Both bundles are syntax-checked and backed up before replacement.

## Backup and rollback

Original files and SHA-256 hashes are stored on the VPS at:

`/var/backups/9router-sibluudz-images-20261106T072006Z/manifest.json`

The two modified runtime files are:

```text
/usr/lib/node_modules/9router/app/.next-cli-build/server/app/api/v1/images/generations/route.js
/usr/lib/node_modules/9router/app/.next-cli-build/server/chunks/2380.js
```

To roll back this deployment on the VPS:

```sh
sudo cp -- /var/backups/9router-sibluudz-images-20261106T072006Z/.next-cli-build/server/app/api/v1/images/generations/route.js /usr/lib/node_modules/9router/app/.next-cli-build/server/app/api/v1/images/generations/route.js
sudo cp -- /var/backups/9router-sibluudz-images-20261106T072006Z/.next-cli-build/server/chunks/2380.js /usr/lib/node_modules/9router/app/.next-cli-build/server/chunks/2380.js
sudo systemctl restart 9router.service
```

An npm update/reinstall of 9router can replace these compiled bundles. Review upstream fixes before reapplying this version-specific patch; do not force it onto another build. Account data and provider settings were not modified.

## Verification

- Reproduced the original forced-medium request by loading the actual VPS bundle in an isolated Node VM.
- Verified the patched bundle sends `reasoning: null`, retains the selected image tool model, edit action and source image, parses a final image, and surfaces the exact upstream error.
- Verified the actual patched Gemini executor for automatic/1K/2K/4K output settings, source references and 3:2 framing.
- Restarted the service; HTTP readiness passed. Both `9router.service` and `antigravity-bridge.service` are active.
- Live image edit through the dashboard's configured gateway succeeded for `cx/gpt-image-2`: PNG **1536×1024**, **1,561,257 bytes**.
- Live image edit succeeded for `cx/gpt-image-2.5`: PNG **1536×1024**, **1,540,190 bytes**.
- Full authenticated `POST /api/ai/image-relight` also returned **HTTP 200** with `cx/gpt-image-2.5`, PNG **1536×1024**, **1,504,322 bytes**, and exactly one successful usage entry. This proof used a temporary isolated application database/session; no real user history or usage was changed by the test.

Gemini image generation remains limited by the provider account's quota: `ag/gemini-3.1-flash-image` returns **429 RESOURCE_EXHAUSTED**, with approximately four hours until its reported reset at the time of testing. The only active Antigravity account is quota-limited; the eight inactive connections have seven 403 errors and one 401 error. Their activation state and credentials were not changed. Native Gemini 2K/4K generation cannot be claimed verified until a working account has available quota.

Upstream diagnosis: [9router PR #5477](https://github.com/decolua/9router/pull/5477). This deployment was verified against the installed bundle and live gateway rather than assuming that PR had been merged.
