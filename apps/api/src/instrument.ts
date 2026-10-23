// Imported first by server.ts so Sentry is running before the app (and Express) load.
import "dotenv/config";
import { initSentry } from "./sentry.js";

initSentry();
