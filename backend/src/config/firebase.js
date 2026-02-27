/**
 * config/firebase.js — Firebase Admin SDK initialisation
 *
 * Credentials are read exclusively from environment variables so that no
 * service-account JSON file needs to be committed to the repository.
 *
 * Usage (in any service file):
 *   import { db, auth } from "../config/firebase.js";
 */

import admin from "firebase-admin";

// Guard against accidental double-initialisation (e.g. during hot-reload)
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !privateKey
  ) {
    throw new Error(
      "[firebase] Missing required environment variables: " +
        "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  console.log("[firebase] Admin SDK initialised successfully");
}

// Firestore database instance
export const db = admin.firestore();

// Firebase Authentication instance
export const auth = admin.auth();

export default admin;
