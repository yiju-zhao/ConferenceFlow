// Session catalog — populated at runtime from Firestore.
// Entry shape verified against the report-component readers; see
// `SessionCatalogEntry` in `@/types`.
import type { SessionCatalogEntry } from "./types/firestore";

export const SESSION_CATALOG = new Map<string, SessionCatalogEntry>();
