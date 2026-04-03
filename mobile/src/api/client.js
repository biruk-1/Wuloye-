import axios from "axios";
import { API_BASE_URL } from "../utils/constants";
import { auth } from "../config/firebase";
import * as authStorage from "../utils/authStorage";

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 60000,
    headers: {
        "Content-Type": "application/json",
    },
});

// ─── Request interceptor ──────────────────────────────────────────────────────
// Attach a fresh Firebase ID token before every request.
// `auth.currentUser` is always checked at call-time (not at module load),
// so the token is never stale from a previous session.

apiClient.interceptors.request.use(
    async (config) => {
        const user = auth.currentUser;
        if (user) {
            // getIdToken() serves from cache; Firebase auto-refreshes ~5min before expiry.
            const token = await user.getIdToken();
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

// ─── Response interceptor ─────────────────────────────────────────────────────
// Backend returns 401 when `auth.verifyIdToken` fails. This can happen when
// the SDK served a cached but expired JWT. On first 401:
//   1. Force-refresh the token (getIdToken(true)) — always hits Firebase servers.
//   2. Persist the new token to AsyncStorage.
//   3. Retry the original request ONCE with the new token.
// If the retry also returns 401 the request is rejected (AuthContext handles sign-out).

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error.response?.status;
        const config = error.config;

        // Only retry 401s once, and only when there is an active Firebase session.
        if (status !== 401 || !config || config.__authRetried) {
            return Promise.reject(error);
        }

        const user = auth.currentUser;
        if (!user) {
            // No session — propagate; AuthContext will route to Login.
            return Promise.reject(error);
        }

        config.__authRetried = true;

        try {
            // Force a new token from Firebase's servers.
            const freshToken = await user.getIdToken(true);
            await authStorage.setFirebaseToken(freshToken);

            // Patch the retried request with the new token.
            config.headers = config.headers ?? {};
            config.headers.Authorization = `Bearer ${freshToken}`;

            return apiClient.request(config);
        } catch {
            // Force-refresh failed (revoked token, network down, etc.).
            return Promise.reject(error);
        }
    },
);

export default apiClient;
