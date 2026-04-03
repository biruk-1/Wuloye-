/**
 * This folder is the Express API only — not a React Native / Expo app.
 * Running `npx expo start` here makes Metro try to bundle `package.json#main`
 * (`src/server.js`), which uses Node-only modules (`dotenv` → `path`, `fs`).
 *
 * Start Expo from `Wuloye-/mobile`, or from this folder run: `npm run mobile`
 */
export default function wuloyeBackendExpoGuard() {
    throw new Error(
        "[Wuloye] Do not run Expo from the backend folder.\n\n" +
            "Start the mobile app:\n" +
            "  cd ..\\Wuloye-\\mobile\n" +
            "  npx expo start\n\n" +
            "Or from this folder:\n" +
            "  npm run mobile\n\n" +
            "Run the API with:\n" +
            "  npm run dev\n",
    );
}
