import { readFileSync, writeFileSync, cpSync, rmSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const FIREFOX_DIST = join(ROOT, "dist-firefox");
const XPI_PATH = join(ROOT, "extension.xpi");

// 1. Clean previous firefox build
if (existsSync(FIREFOX_DIST)) rmSync(FIREFOX_DIST, { recursive: true });
if (existsSync(XPI_PATH)) rmSync(XPI_PATH);

// 2. Copy dist → dist-firefox
cpSync(DIST, FIREFOX_DIST, { recursive: true });

// Remove .vite cache dir if copied
const viteCache = join(FIREFOX_DIST, ".vite");
if (existsSync(viteCache)) rmSync(viteCache, { recursive: true });

// 3. Patch manifest.json for Firefox
const manifestPath = join(FIREFOX_DIST, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

// Convert service_worker → scripts (Firefox uses background scripts, not service workers)
if (manifest.background?.service_worker) {
  const sw = manifest.background.service_worker;
  manifest.background = {
    scripts: [sw],
    type: "module",
  };
}

// Remove use_dynamic_url (not supported by Firefox)
if (manifest.web_accessible_resources) {
  for (const entry of manifest.web_accessible_resources) {
    delete entry.use_dynamic_url;
  }
}

// Add gecko ID (required for Firefox sideloading / signing)
manifest.browser_specific_settings = {
  gecko: {
    id: "testportal-stealth@extension",
    strict_min_version: "109.0",
  },
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("✓ Patched manifest.json for Firefox");

// 4. Package into .xpi (which is just a zip)
try {
  // Use PowerShell Compress-Archive on Windows
  execSync(
    `powershell -Command "Compress-Archive -Path '${FIREFOX_DIST}\\*' -DestinationPath '${XPI_PATH}' -Force"`,
    { stdio: "inherit" }
  );
  console.log(`✓ Created ${XPI_PATH}`);
} catch {
  // Fallback: try zip command (Linux/macOS/Git Bash)
  try {
    execSync(`cd "${FIREFOX_DIST}" && zip -r "${XPI_PATH}" .`, {
      stdio: "inherit",
    });
    console.log(`✓ Created ${XPI_PATH}`);
  } catch (e) {
    console.error("✗ Failed to create XPI. Please zip dist-firefox/ manually.");
    console.error(e.message);
    process.exit(1);
  }
}
