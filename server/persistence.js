import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// data/ lives at the project root (one level up from server/).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

const SAVE_DEBOUNCE_MS = 1500;

const pending = new Map(); // projectId -> { serialized, timer }

export async function ensureDirs() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

function worldPath(projectId) {
  return path.join(PROJECTS_DIR, `${projectId}.json`);
}

// Atomic write: write a temp file then rename over the target.
async function writeAtomic(file, contents) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, file);
}

// ---- generic small-JSON docs (accounts, project index) ----
// Low-frequency, so these write immediately (not debounced).

export async function readJson(relPath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, relPath), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(relPath, obj) {
  await writeAtomic(path.join(DATA_DIR, relPath), JSON.stringify(obj, null, 2));
}

export async function loadWorld(projectId) {
  try {
    return await fs.readFile(worldPath(projectId), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Debounced per-project world save. `getSerialized` is called at flush time so
// we always persist the latest state, not a stale snapshot.
export function saveWorldDebounced(projectId, getSerialized) {
  const entry = pending.get(projectId) || {};
  entry.getSerialized = getSerialized;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => { flush(projectId); }, SAVE_DEBOUNCE_MS);
  pending.set(projectId, entry);
}

export async function flush(projectId) {
  const entry = pending.get(projectId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  pending.delete(projectId);
  await writeAtomic(worldPath(projectId), entry.getSerialized());
}

export async function flushAll() {
  await Promise.all([...pending.keys()].map((id) => flush(id)));
}

// Delete a project's world file and cancel any pending debounced write.
export async function deleteWorld(projectId) {
  const entry = pending.get(projectId);
  if (entry?.timer) clearTimeout(entry.timer);
  pending.delete(projectId);
  try {
    await fs.unlink(worldPath(projectId));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
