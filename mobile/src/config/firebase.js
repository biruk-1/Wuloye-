import { getApps, initializeApp, getApp } from "firebase/app";
import {
    getAuth,
    initializeAuth,
    getReactNativePersistence,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FIREBASE_CONFIG } from "../utils/constants";

const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();

export const firebaseApp = app;

/**
 * On React Native:
 *  - First call: initializeAuth + AsyncStorage persistence (tokens survive app restarts).
 *  - Hot reload / fast refresh: initializeAuth throws because auth is already bound to the
 *    app instance — fall back to getAuth() which returns the existing instance.
 *  - Any other unexpected error: same fallback keeps the app from crashing.
 */
export const auth = (() => {
    try {
        return initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage),
        });
    } catch {
        return getAuth(app);
    }
})();
