// Session catalog — populated at runtime from Firestore.
// Typed loosely here; tightened to Map<string, Session> in the calendar batch
// when the populating component is converted.
export const SESSION_CATALOG = new Map<string, unknown>();
