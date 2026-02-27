# Backend environment setup (before Docker or `npm run dev`)

You created a **Firebase project** and a **web app**. The backend needs **Service Account** credentials (server-side), not the web app config.

---

## 1. Get the Service Account JSON

1. Open [Firebase Console](https://console.firebase.google.com/) and select your project.
2. Click the **gear icon** → **Project settings**.
3. Open the **Service accounts** tab.
4. Click **Generate new private key** (confirm with **Generate key**).
5. A JSON file downloads (e.g. `your-project-firebase-adminsdk-xxxxx.json`).  
   **Keep this file private and never commit it to git.**

---

## 2. Create `backend/.env` from the JSON

Create the file:

```bash
cp backend/.env.example backend/.env
```

Then open `backend/.env` and set these from the downloaded JSON:

| Variable in `.env` | Field in the JSON file |
|--------------------|------------------------|
| `FIREBASE_PROJECT_ID` | `project_id` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_PRIVATE_KEY` | `private_key` (see below) |

### Private key format

- In the JSON, `private_key` is one long string with real newlines.
- In `.env` you must put it on **one line** and write `\n` where the newlines are.

**Option A — Manual:** Copy the value of `private_key` from the JSON, then replace every actual newline with the two characters `\n` and wrap the whole thing in double quotes.

**Option B — Helper script (recommended):**

1. Save the downloaded JSON as `backend/serviceAccountKey.json` (this path is in `.gitignore`).
2. From the **project root** (`wuloye/`), run:

   ```bash
   node backend/scripts/env-from-firebase-json.js
   ```

   Or with a custom path:

   ```bash
   node backend/scripts/env-from-firebase-json.js /path/to/your-project-firebase-adminsdk-xxxxx.json
   ```

3. Copy the three printed lines into `backend/.env` (replace the placeholder values).

---

## 3. Final `.env` checklist

Before running Docker or `npm run dev`, ensure:

- [ ] `backend/.env` exists (copy from `backend/.env.example`).
- [ ] `FIREBASE_PROJECT_ID` = your Firebase project ID.
- [ ] `FIREBASE_CLIENT_EMAIL` = the service account email from the JSON.
- [ ] `FIREBASE_PRIVATE_KEY` = the private key in one line with `\n` for newlines, in double quotes.
- [ ] `ALLOWED_ORIGINS` is set (e.g. `http://localhost:3000,http://localhost:8081`).

---

## 4. Run Docker

From the **project root** (`wuloye/`):

```bash
docker-compose up --build
```

`docker-compose.yml` loads `./backend/.env` for the backend service, so no extra step is needed.

---

## Summary

| What you have | Used for |
|---------------|----------|
| Web app config (apiKey, authDomain, …) | Frontend (React Native, Next.js) — later |
| Service account JSON (project_id, client_email, private_key) | Backend only — **required now** |

Without a valid `backend/.env` (with the three Firebase variables), the backend will exit on startup with a missing-env error.
