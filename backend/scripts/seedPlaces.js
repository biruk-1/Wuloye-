/**
 * scripts/seedPlaces.js — One-shot Firestore seeder for the places collection.
 *
 * Usage (from the backend root):
 *   node scripts/seedPlaces.js
 *
 * Idempotent: if the places collection already contains documents it exits
 * without writing anything.
 */

import "dotenv/config";
import "../src/config/firebase.js";
import { seedPlacesIfEmpty } from "../src/services/place.service.js";
import { SEED_PLACES } from "../src/data/places.seed.js";

async function main() {
  console.log("[seed] Starting places seed script…");

  const result = await seedPlacesIfEmpty(SEED_PLACES);

  if (result.skipped) {
    console.log(`[seed] Nothing written — collection already has ${result.existing} place(s).`);
  } else {
    console.log(`[seed] Done — ${result.inserted} place(s) inserted.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err.message);
  process.exit(1);
});
