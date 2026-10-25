// Static app branding. No admin-configurable brandName system (nothing in
// this domain needs it) — if per-coach branding is ever wanted, add it then.
export const APP_NAME = "Matchday";

// The public base URL to build absolute links in outbound email (invite
// links can't be relative — the recipient isn't already on the site).
// NEXTAUTH_URL is unset by default in local dev, where localhost is correct
// anyway. Shared by every action that sends an invite email (athletes,
// assistant coaches).
export function siteBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}
