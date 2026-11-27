/**
 * Imported first in main.tsx so the storage migrations finish before any other module
 * (or store) reads local storage. Never throws: a failed step is logged and retried on
 * the next start, and the app runs on the data as it is.
 */
import { runStorageMigrations } from "./storageMigrations";

try {
  const result = runStorageMigrations();
  if (result.error && result.error.version !== null) {
    console.warn(`Storage migration ${result.error.version} failed: ${result.error.message}`);
  }
} catch (error) {
  console.warn("Storage migrations did not run", error);
}
