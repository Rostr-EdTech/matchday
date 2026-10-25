// Shared shapes for the roster bulk-import pipeline. CSV upload/paste
// normalizes to `ImportSheet` — the mapping/preview/commit path downstream is
// source-agnostic. Client-safe (no server-only imports), so the browser-side
// CSV parsing step can import this file directly.

export type ImportSheet = {
  headers: string[];
  rows: string[][];
  sourceLabel: string; // e.g. "roster.csv" or "Pasted text"
};

export type FieldKey = "displayName" | "firstName" | "lastName" | "email" | "jerseyNumber" | "primaryPosition" | "externalId" | "skip";

// Column index -> which Athlete field it maps to.
export type ColumnMapping = Record<number, FieldKey>;

export type ImportRowStatus = "NEW" | "MATCH_EXISTING" | "ALREADY_ROSTERED" | "ERROR";

export type ImportPreviewRow = {
  rowIndex: number; // index into ImportSheet.rows
  status: ImportRowStatus;
  displayName: string;
  email: string | null;
  jerseyNumber: string | null;
  primaryPosition: string | null;
  externalId: string | null;
  matchedAthleteId: string | null; // set when status is MATCH_EXISTING or ALREADY_ROSTERED
  matchReason: "email" | "externalId" | "name" | null;
  error: string | null;
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  displayName: "Name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  jerseyNumber: "Jersey #",
  primaryPosition: "Position",
  externalId: "Player ID",
  skip: "(skip this column)",
};
