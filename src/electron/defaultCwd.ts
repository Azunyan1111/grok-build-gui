/**
 * Pick the workspace a fresh chat starts in.
 *
 * `process.cwd()` is right when the app was started from a shell (dev runs, or
 * `grok-gui .` from a project). It is actively harmful when the OS launched the
 * app: on packaged Windows the cwd is the install directory, so a chat opened
 * there makes the agent read and write inside the install tree — and the next
 * update wipes those files, taking the user's outputs with them.
 */
import path from "node:path";

/** `true` when `child` is `parent` or sits under it. */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function pickDefaultCwd(opts: {
  /** `process.cwd()`. */
  cwd: string;
  /** `app.getPath("exe")` — its directory is the install tree. */
  exePath: string;
  /** `app.getPath("home")` — the fallback workspace. */
  home: string;
}): string {
  const cwd = opts.cwd?.trim();
  if (!cwd || cwd === "/" || cwd === ".") return opts.home;
  // macOS launches the dev shell inside the Electron bundle.
  if (cwd.includes("Electron.app")) return opts.home;

  const exeDir = opts.exePath?.trim() ? path.dirname(opts.exePath) : "";
  if (exeDir && isInside(exeDir, cwd)) return opts.home;

  return cwd;
}
