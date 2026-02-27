#!/usr/bin/env node
/**
 * Helper script to get a Firebase ID token for testing
 * 
 * This script uses Firebase REST API to sign in and get an ID token.
 * 
 * Usage:
 *   node scripts/get-test-token.js <email> <password>
 * 
 * Or set environment variables:
 *   FIREBASE_TEST_EMAIL=test@example.com
 *   FIREBASE_TEST_PASSWORD=password123
 *   node scripts/get-test-token.js
 * 
 * You'll need your Firebase Web API Key from Firebase Console:
 *   Project Settings → General → Web API Key
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get credentials from command line or env vars
const email = process.argv[2] || process.env.FIREBASE_TEST_EMAIL;
const password = process.argv[3] || process.env.FIREBASE_TEST_PASSWORD;
const apiKey = process.env.FIREBASE_WEB_API_KEY;

if (!email || !password) {
  console.error("❌ Error: Email and password required");
  console.error("\nUsage:");
  console.error("  node scripts/get-test-token.js <email> <password>");
  console.error("\nOr set environment variables:");
  console.error("  FIREBASE_TEST_EMAIL=test@example.com");
  console.error("  FIREBASE_TEST_PASSWORD=password123");
  console.error("  FIREBASE_WEB_API_KEY=your-web-api-key");
  console.error("  node scripts/get-test-token.js");
  process.exit(1);
}

if (!apiKey) {
  console.error("❌ Error: FIREBASE_WEB_API_KEY not set");
  console.error("\nGet your Web API Key from:");
  console.error("  Firebase Console → Project Settings → General → Web API Key");
  console.error("\nAdd it to your .env file:");
  console.error("  FIREBASE_WEB_API_KEY=your-api-key-here");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error("❌ Error: FIREBASE_PROJECT_ID not found in .env");
  process.exit(1);
}

const identityToolkitUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

try {
  console.log("🔐 Signing in to Firebase...");
  
  const response = await fetch(identityToolkitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Authentication failed:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("✅ Successfully authenticated!");
  console.log("\n📋 User Info:");
  console.log(`   UID: ${data.localId}`);
  console.log(`   Email: ${data.email}`);
  console.log(`   Email Verified: ${data.emailVerified}`);
  
  console.log("\n🔑 ID Token (use this in Authorization header):");
  console.log("─".repeat(80));
  console.log(data.idToken);
  console.log("─".repeat(80));
  
  console.log("\n💡 Test command:");
  console.log(`curl -H "Authorization: Bearer ${data.idToken}" http://localhost:5000/api/profile`);
  
  // Save token to file for easy access (optional)
  const tokenFile = join(__dirname, "..", ".test-token.txt");
  try {
    await import("fs/promises").then(fs => fs.writeFile(tokenFile, data.idToken, "utf8"));
    console.log(`\n💾 Token saved to: ${tokenFile}`);
    console.log("   (This file is in .gitignore, safe to commit)");
  } catch (err) {
    // Ignore file write errors
  }

} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
