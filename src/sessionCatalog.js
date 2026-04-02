import catalogData from "../data/gtc-2026-sessions-detailed.json";

// Session catalog map: session_id -> session data
// Separated from constants.js to allow Vite to code-split the 2MB JSON
export const SESSION_CATALOG = new Map(catalogData.map((s) => [s.session_id, s]));
