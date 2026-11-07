// Finds the newest installer. latest.json can't be read from a browser (GitHub sends no CORS
// header for release files) and the file name carries the version, so this asks the GitHub API.
// Whatever goes wrong, the button keeps RELEASES_PAGE, which always shows the latest release.

const REPO = "umutugrasan/catail";
const API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const INSTALLER = /^catail[_-]v?(\d+\.\d+\.\d+)[_-]x64-setup\.exe$/i;
const CACHE_KEY = "catail.site.release";
const CACHE_TTL_MS = 60 * 60 * 1000;

export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

// The newest published release that has an installer. A release still waiting for its upload,
// a draft or a pre-release is skipped, so the button never points at nothing.
export function pickLatest(releases) {
  if (!Array.isArray(releases)) return null;
  let best = null;
  for (const release of releases) {
    if (!release || release.draft || release.prerelease) continue;
    for (const asset of release.assets ?? []) {
      const match = INSTALLER.exec(asset?.name ?? "");
      const url = asset?.browser_download_url;
      if (!match || typeof url !== "string" || !url.startsWith(DOWNLOAD_PREFIX)) continue;
      if (!best || compareVersions(match[1], best.version) > 0) {
        best = {
          version: match[1],
          url,
          size: Number(asset.size) || 0,
          publishedAt: release.published_at ?? null,
        };
      }
    }
  }
  return best;
}

function readCache(storage) {
  try {
    const cached = JSON.parse(storage.getItem(CACHE_KEY));
    if (cached?.release?.url?.startsWith(DOWNLOAD_PREFIX)) return cached;
  } catch {
    // Storage is off or holds something else; ask GitHub instead.
  }
  return null;
}

function writeCache(storage, release, at) {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify({ release, at }));
  } catch {
    // Only saves a request next time.
  }
}

// Resolves to { release, source }, release being null when nothing is known. Never rejects.
export async function loadLatest({
  fetchFn = globalThis.fetch.bind(globalThis),
  storage = globalThis.localStorage,
  now = Date.now(),
  timeoutMs = 6000,
} = {}) {
  const cached = readCache(storage);
  if (cached && now - cached.at < CACHE_TTL_MS) return { release: cached.release, source: "cache" };

  try {
    const response = await fetchFn(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const release = pickLatest(await response.json());
    if (release) {
      writeCache(storage, release, now);
      return { release, source: "api" };
    }
  } catch {
    // Offline, rate limited (60 an hour per address) or GitHub is down: fall through.
  }
  return cached ? { release: cached.release, source: "stale" } : { release: null, source: "none" };
}
