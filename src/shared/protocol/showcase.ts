// The public showcase at /pom/ (see shared/showcase.ts and http/routes/showcase.ts): off until an
// admin turns it on in Settings, and how each repository shows there.

import type { RepoVisibility } from '../showcase.js';

/** Settings for the showcase (admins). */
export interface ShowcaseSettingsState {
  enabled: boolean;
  /** An admin's choice per repository ("owner/name", lower case); the rest follow the defaults. */
  repos: Record<string, RepoVisibility>;
  /** The repositories on the office's floors, and whether GitHub says each is private, so the pane can list them. */
  known: { repo: string; private?: boolean; shows: RepoVisibility }[];
  by?: string;
  at?: number;
}

export type ShowcaseClientMsg =
  /** The settings, for Settings (answered with `showcase.settings`). */
  | { t: 'showcase.settings.get' }
  /** Admins: turn the page on or off, or set how repositories show (null: back to the default). */
  | { t: 'showcase.settings'; patch: { enabled?: boolean; repos?: Record<string, RepoVisibility | null> } };

export type ShowcaseServerMsg = { t: 'showcase.settings'; state: ShowcaseSettingsState };
