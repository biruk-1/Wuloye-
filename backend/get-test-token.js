/**
 * get-test-token.js
 * Generates a Firebase ID token for the first user in your project.
 * Usage: node get-test-token.js
 */
import "dotenv/config";
import admin from "firebase-admin";
import https from "https";

// Init admin (uses env vars already configured)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = admin.auth();
const apiKey = process.env.FIREBASE_WEB_API_KEY;

// 1. List users and pick the first one
const listResult = await auth.listUsers(1);
if (listResult.users.length === 0) {
  console.error("No users found in Firebase Auth. Create one first.");
  process.exit(1);
}

const user = listResult.users[0];
console.log(`Using user: ${user.email ?? user.uid}`);

// 2. Create a custom token for that user
const customToken = await auth.createCustomToken(user.uid);

// 3. Exchange the custom token for an ID token via REST
const body = JSON.stringify({ token: customToken, returnSecureToken: true });

const idToken = await new Promise((resolve, reject) => {
  const req = https.request(
    {
      hostname: "identitytoolkit.googleapis.com",
      path: `/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    },
    (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        const parsed = JSON.parse(raw);
        if (parsed.idToken) resolve(parsed.idToken);
        else reject(new Error(JSON.stringify(parsed)));
      });
    }
  );
  req.on("error", reject);
  req.write(body);
  req.end();
});

console.log("\n--- COPY THIS TOKEN ---");
console.log(idToken);
console.log("--- END TOKEN ---\n");
console.log("Token length:", idToken.length);
