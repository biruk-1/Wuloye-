/**
 * server.js — Entry point
 *
 * Responsibility: load environment variables and start the HTTP server.
 * All Express configuration lives in app.js to keep this file minimal and
 * to make the app easily importable in tests without binding to a port.
 */

import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[server] Wuloye backend running on port ${PORT} (${process.env.NODE_ENV ?? "development"})`);
});
