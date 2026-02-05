import { exec } from "child_process";
import { readFileSync, existsSync, lstatSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

/**
 * Get the plugin root directory (where package.json lives).
 */
function getPluginRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // From dist/src/services/ → go up 3 levels to plugin root
  // Check for package.json at each level to find the correct root
  let root = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(root, "package.json"))) {
      return root;
    }
    root = dirname(root);
  }
  // Fallback: assume dist/src/services structure
  return join(__dirname, "../../..");
}

/**
 * Check if running in development mode.
 * Detection methods (no main package dependency):
 * 1. SCIENTIFY_DEV=1 environment variable
 * 2. tsconfig.json exists in plugin root (source checkout)
 * 3. Plugin directory is a symlink (npm link / pnpm link)
 * 4. Version contains "-dev" suffix
 * 5. NODE_ENV=development
 */
function isDevMode(): boolean {
  // 1. Explicit env var
  const scientifyDev = process.env.SCIENTIFY_DEV;
  if (scientifyDev === "1" || scientifyDev === "true") {
    return true;
  }

  // 2. NODE_ENV
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  const pluginRoot = getPluginRoot();

  // 3. tsconfig.json exists (source checkout, not installed from npm)
  if (existsSync(join(pluginRoot, "tsconfig.json"))) {
    return true;
  }

  // 4. Plugin directory is a symlink (npm/pnpm link)
  try {
    if (lstatSync(pluginRoot).isSymbolicLink()) {
      return true;
    }
  } catch {
    // ignore
  }

  // 5. Version contains "-dev"
  try {
    const pkg = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf-8"));
    if (pkg.version && pkg.version.includes("-dev")) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

// Get current version from package.json
function getCurrentVersion(): string {
  try {
    const packagePath = join(getPluginRoot(), "package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

// Check npm registry for latest version
async function getLatestVersion(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    exec(`npm view ${packageName} version`, { timeout: 10000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Compare semver versions: returns true if latest > current
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Get the OpenClaw extensions directory.
 */
function getExtensionsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return join(home, ".openclaw", "extensions");
}

/**
 * Run the update using npm pack + extract approach.
 * This avoids dependency on `openclaw` CLI being in PATH.
 */
async function runUpdate(
  packageName: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void }
): Promise<boolean> {
  const extensionsDir = getExtensionsDir();
  const targetDir = join(extensionsDir, packageName);

  return new Promise((resolve) => {
    // Use npm pack to download the tarball, then extract
    const cmd = `cd "${extensionsDir}" && npm pack ${packageName} --pack-destination . && tar -xzf ${packageName}-*.tgz && rm -rf "${targetDir}" && mv package "${targetDir}" && rm ${packageName}-*.tgz`;

    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        logger.warn(`Scientify auto-update failed: ${stderr || error.message}`);
        resolve(false);
        return;
      }
      logger.info(`Scientify updated. Restart gateway to apply.`);
      resolve(true);
    });
  });
}

export interface AutoUpdaterOptions {
  packageName: string;
  checkIntervalMs: number;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    debug?: (msg: string) => void;
  };
}

export function createAutoUpdaterService(options: AutoUpdaterOptions) {
  const { packageName, checkIntervalMs, logger } = options;
  let intervalId: NodeJS.Timeout | null = null;
  let isChecking = false;

  const checkAndUpdate = async () => {
    if (isChecking) return;
    isChecking = true;

    try {
      const currentVersion = getCurrentVersion();
      const latestVersion = await getLatestVersion(packageName);

      if (!latestVersion) {
        logger.debug?.(`Scientify update check: could not fetch latest version`);
        return;
      }

      if (isNewerVersion(currentVersion, latestVersion)) {
        logger.info(`Scientify update available: ${currentVersion} → ${latestVersion}`);
        await runUpdate(packageName, logger);
      } else {
        logger.debug?.(`Scientify is up to date (${currentVersion})`);
      }
    } catch (err) {
      logger.warn(`Scientify update check error: ${err}`);
    } finally {
      isChecking = false;
    }
  };

  return {
    id: "scientify-auto-updater",

    start: async () => {
      // Skip auto-updates in development mode
      if (isDevMode()) {
        logger.debug?.("Scientify auto-updater skipped (dev mode)");
        return;
      }

      logger.debug?.("Scientify auto-updater service started");

      // Check once on startup (with a small delay to not block gateway start)
      setTimeout(() => {
        checkAndUpdate();
      }, 5000);

      // Then check periodically
      intervalId = setInterval(checkAndUpdate, checkIntervalMs);
    },

    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      logger.debug?.("Scientify auto-updater service stopped");
    },
  };
}
