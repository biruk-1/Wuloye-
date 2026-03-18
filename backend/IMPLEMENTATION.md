# Backend Implementation — Authentication & User Profile

This document describes the authentication middleware and user profile system implemented in Sprint 1.

---

## ✅ What Was Implemented

### 1. Firebase Authentication Middleware

**File:** `src/middleware/auth.middleware.js`

- **Purpose:** Validates Firebase ID tokens on protected routes
- **Functionality:**
  - Reads `Authorization: Bearer <token>` header
  - Verifies token using Firebase Admin SDK
  - Attaches decoded user payload to `req.user`
  - Returns 401 if token is missing, invalid, or expired

**Usage:**
```javascript
import { authenticate } from "../middleware/auth.middleware.js";
router.get("/protected", authenticate, controller);
```

---

### 2. User Profile Service

**File:** `src/services/user.service.js`

- **Purpose:** Handles all Firestore operations for user profiles
- **Functionality:**
  - `findOrCreateUser(decodedToken)` — Finds existing user or creates new one on first login
  - `getUserById(uid)` — Retrieves user by UID (for future use)

**Firestore Structure:**
- **Collection:** `users`
- **Document ID:** Firebase UID
- **Fields:**
  - `uid` (string)
  - `email` (string | null)
  - `name` (string | null)
  - `createdAt` (ISO 8601 timestamp)

---

### 3. User Profile Controller

**File:** `src/controllers/user.controller.js`

- **Purpose:** Handles HTTP request/response for user routes
- **Functionality:**
  - `getProfile` — Returns authenticated user's profile (creates if doesn't exist)

---

### 4. User Routes

**File:** `src/routes/user.routes.js`

- **Route:** `GET /api/profile`
- **Protection:** Requires `authenticate` middleware
- **Response Format:**
  ```json
  {
    "success": true,
    "data": {
      "uid": "user-uid",
      "email": "user@example.com",
      "name": null,
      "createdAt": "2024-02-27T20:26:40.913Z"
    },
    "message": "Profile retrieved successfully"
  }
  ```

---

### 5. Error Handler Updates

**File:** `src/middleware/errorHandler.js`

- **Updated:** All error responses now use consistent format:
  ```json
  {
    "success": false,
    "data": null,
    "message": "Error message here"
  }
  ```

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── firebase.js          # Firebase Admin SDK initialization
│   ├── controllers/
│   │   ├── healthController.js
│   │   └── user.controller.js  # User profile controller
│   ├── middleware/
│   │   ├── auth.middleware.js   # Firebase token verification
│   │   └── errorHandler.js      # Global error handling
│   ├── routes/
│   │   ├── health.js
│   │   └── user.routes.js       # User routes
│   ├── services/
│   │   ├── healthService.js
│   │   └── user.service.js      # Firestore user operations
│   ├── app.js                   # Express app configuration
│   └── server.js                # Server entry point
├── scripts/
│   ├── env-from-firebase-json.js
│   └── get-test-token.js        # Helper to get Firebase ID tokens for testing
└── ENV_SETUP.md                 # Environment setup guide
```

---

## 🔐 Authentication Flow

1. **Client sends request** with `Authorization: Bearer <firebase-id-token>` header
2. **Middleware verifies token** using Firebase Admin SDK
3. **On success:** `req.user` is populated with decoded token (uid, email, name, etc.)
4. **On failure:** Returns 401 with error message
5. **Controller** uses `req.user` to get/create user profile in Firestore
6. **Response** returns user data in consistent JSON format

---

## 🧪 Testing

### Get a Firebase ID Token

Use the helper script:
```bash
node scripts/get-test-token.js <email> <password>
```

### Test the Endpoint

```bash
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/profile
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "uid": "oEVSCtSXYpZ0SFyiasZmA4UZi2u2",
    "email": "test@example.com",
    "name": null,
    "createdAt": "2024-02-27T20:26:40.913Z"
  },
  "message": "Profile retrieved successfully"
}
```

---

## 🏗️ Architecture Principles

- **Separation of Concerns:** Routes → Controllers → Services
- **No Firestore logic in controllers:** All database operations in service layer
- **Consistent error handling:** Centralized error handler middleware
- **Consistent JSON responses:** `{ success, data, message }` format
- **ES Modules:** Using `import/export` syntax
- **Async/await:** All async operations use async/await with try/catch

---

## 🔥 Firestore index (interactions)

The **GET /api/interactions** query filters by `userId` and orders by `createdAt` descending. Firestore requires a **composite index** for this.

**One-time setup:**

1. **Option A (quick):** When the API returns an error, it includes a link. Open that link in your browser — it opens the Firebase Console with the index pre-filled. Click **Create index** and wait a few minutes for it to build.

2. **Option B (CLI):** If you use the Firebase CLI from this backend folder, run:
   ```bash
   firebase deploy --only firestore:indexes
   ```
   (Requires `firebase.json` that references `firestore.indexes.json`.)

Index definition is in **`firestore.indexes.json`** at the repo root.

---

## 📝 Next Steps (Future Sprints)

- [ ] User profile updates (PATCH /api/profile)
- [ ] Admin routes for user management
- [ ] Additional user fields (avatar, preferences, etc.)
- [ ] User roles and permissions
- [ ] Integration with mobile app

---

## 🔗 Related Documentation

- `ENV_SETUP.md` — Firebase environment setup guide
- `README.md` — Project overview and quick start
