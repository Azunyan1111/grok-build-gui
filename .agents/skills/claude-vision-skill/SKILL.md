---
name: claude-vision-skill
description: Use when an image must be described, analyzed, or recognized through an external OpenAI-compatible vision API because native image input is unavailable, or when the user explicitly requests this helper.
---

# External Vision Helper

Use this helper only when native image tooling is unavailable or the user explicitly asks to use the configured external vision service. Images sent through this helper leave the local machine and may incur provider charges.

Resolve the directory containing this `SKILL.md` from the absolute skill path exposed by Codex, then run the adjacent `vision.js`. Do not assume the current working directory and do not hardcode a user-specific path.

For a local image:

```bash
node "<absolute-skill-directory>/vision.js" "<absolute image path>" "<prompt>"
```

For an image URL:

```bash
node "<absolute-skill-directory>/vision.js" --url "<image url>" "<prompt>"
```

When the user pastes an image into the chat but no file path or URL is visible:

```bash
node "<absolute-skill-directory>/vision.js" --clipboard "<prompt>"
```

`--clipboard` reads the current image from the system clipboard (macOS uses a bundled Swift helper, Windows uses a bundled PowerShell script; the pasted image is usually still there). If it fails, ask the user to save the image to a file and provide the absolute path.

Fallback rules (automatic):

- If a local path is given but the file does not exist, vision.js automatically falls back to the clipboard.
- If no image path or URL is given at all, vision.js automatically tries the clipboard.
- Pass `--no-fallback` to disable this behavior and fail with an explicit error instead.

Rules:

- Prefer native image tooling when it is available.
- Always use the resolved absolute path to `vision.js`.
- Use an absolute image path for local files, or `--url` for remote images.
- Prefer `--clipboard` when the user pasted an image with no accessible path.
- Use Chinese for descriptions unless the user asks otherwise.
- Configuration lives in `.env` next to `vision.js` (`DASHSCOPE_API_KEY`, `VISION_MODEL`, `DASHSCOPE_BASE_URL`). Start from `.env.example`; never print or commit the API key.
- If the API call fails, report the error to the user and ask them to check the key, model, or base URL.
