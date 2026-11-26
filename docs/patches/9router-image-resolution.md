# Native Gemini resolution through 9router

**Deployment update, 6 November 2026:** the compiled 9router 0.5.111 runtime on the Tencent VPS has now been patched and restarted. See the [deployment report and rollback instructions](9router-vps-image-fix.md). GPT image generation passed live tests; Gemini currently returns provider quota error 429, superseding the earlier 403 observation below.

The dashboard sends `image_size: "1K" | "2K" | "4K"` to `/v1/images/generations`. In the upstream 9router Antigravity implementation inspected on 2026-11-06, two layers discard that setting:

1. `open-sse/handlers/imageProviders/antigravity.js` builds a new request containing only `contents`.
2. `open-sse/executors/antigravity.js` builds `imageConfig` from the model's aspect-ratio suffix, omitting `imageSize`.

The adjacent patch forwards and validates the setting in both layers. Existing requests without `image_size` retain their behavior; source references and aspect ratio remain intact. This enables the native provider setting, with no local resizing.

## VPS deployment

Copy `9router-image-resolution.patch` to the root of the **9router source checkout on the VPS**, then inspect/apply it:

```sh
git apply --check 9router-image-resolution.patch
git apply 9router-image-resolution.patch
```

Rebuild and restart/redeploy 9router using the deployment's existing process. For Docker, rebuild the image from the patched source and recreate the container; a dashboard redeploy alone does not update the gateway. Do not apply this patch to the siBluudz Dashboard repository.

If `git apply --check` fails, stop and adapt the two changes to the installed 9router version. Do not force it. An upstream update may already include a fix or overwrite this local change.

## Verification

Generate a photo at 2K from Relight Studio with a working Antigravity Gemini Image account. Inspect the **actual output dimensions** below the image, then repeat at 4K. For a 3:2 image, typical native tiers are approximately 1264×848 (1K), 2528×1696 (2K), and 5056×3392 (4K), with exact dimensions controlled by the provider.

The dashboard compares actual pixel area against 75% of the requested square tier to accommodate aspect-ratio presets. A smaller or unverifiable result is retained with a notice, never silently enlarged or relabeled as HD. PNG size varies with content; no minimum 2 MB is forced.

Live verification on 2026-11-06 is blocked independently: the configured Antigravity provider returns HTTP 403 `PERMISSION_DENIED`, stating the service has been disabled on that account. The resolution patch does not resolve account restrictions. No live 2K/4K success is claimed.

Reference sources: [9router adapter](https://github.com/decolua/9router/blob/master/open-sse/handlers/imageProviders/antigravity.js), [9router executor](https://github.com/decolua/9router/blob/master/open-sse/executors/antigravity.js), [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation).
