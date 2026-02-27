#!/usr/bin/env node
/**
 * Reads a Firebase service account JSON file and prints the three env vars
 * you need for backend/.env. Run from project root:
 *
 *   node backend/scripts/env-from-firebase-json.js [path-to-json]
 *
 * Default path: backend/serviceAccountKey.json
 * Then copy the printed lines into backend/.env
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const defaultPath = join(root, "serviceAccountKey.json");
const jsonPath = process.argv[2] || defaultPath;

try {
  const raw = readFileSync(jsonPath, "utf8");
  const j = JSON.parse(raw);
  const key = (j.private_key || "").replace(/\n/g, "\\n");
  console.log("# Paste these into backend/.env (Firebase section)\n");
  console.log("FIREBASE_PROJECT_ID=" + (j.project_id || ""));
  console.log("FIREBASE_CLIENT_EMAIL=" + (j.client_email || ""));
  console.log('FIREBASE_PRIVATE_KEY="' + key + '"');
} catch (e) {
  console.error("Error:", e.message);
  console.error("Usage: node backend/scripts/env-from-firebase-json.js [path-to-service-account.json]");
  process.exit(1);
}
