import "server-only";
import nodemailer from "nodemailer";
import { getApiKey } from "./settings";

// Outbound email via Gmail SMTP + an App Password (GMAIL_SMTP_USER /
// GMAIL_SMTP_APP_PASSWORD, managed the same DB-first/env-fallback way as
// every other key in settings.ts — see that file's comment for why this is
// SMTP and not the Gmail API). Used for athlete portal invites (individual
// via actions/athletes.ts::sendAthleteInviteEmail, or bulk via
// actions/teams.ts::sendTeamInvites) and assistant-coach invites
// (actions/users.ts::sendAssistantInvite(s)); anything else that needs to
// send mail later should go through here too.

async function credentials(): Promise<{ user: string; pass: string } | null> {
  const [user, rawPass] = await Promise.all([
    getApiKey("GMAIL_SMTP_USER"),
    getApiKey("GMAIL_SMTP_APP_PASSWORD"),
  ]);
  if (!user || !rawPass) return null;
  // Google displays App Passwords as four space-separated groups for
  // readability; strip whitespace in case it was pasted verbatim.
  return { user, pass: rawPass.replace(/\s+/g, "") };
}

export async function emailSendingConfigured(): Promise<boolean> {
  return (await credentials()) !== null;
}

let cachedTransport: { user: string; transport: nodemailer.Transporter } | null = null;

// One transporter per Gmail user, reused across calls so a bulk send doesn't
// pay a fresh TLS handshake per recipient. Rebuilt if the configured account
// changes (e.g. the coach swaps the Gmail address in /admin/settings).
async function transporterFor(user: string, pass: string): Promise<nodemailer.Transporter> {
  if (cachedTransport?.user === user) return cachedTransport.transport;
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  cachedTransport = { user, transport };
  return transport;
}

export async function sendInviteEmail(args: {
  to: string;
  athleteName: string;
  coachName: string;
  coachEmail: string;
  teamName: string;
  inviteUrl: string;
}): Promise<void> {
  const creds = await credentials();
  if (!creds) throw new Error("Email sending isn't set up yet — add a Gmail address and App Password in Settings.");
  const transport = await transporterFor(creds.user, creds.pass);

  await transport.sendMail({
    from: `"${args.coachName}" <${creds.user}>`,
    // The shared Gmail account is one sender for every coach in the
    // workspace — replyTo routes an athlete's reply to the actual coach who
    // sent the invite instead of the shared inbox.
    replyTo: `"${args.coachName}" <${args.coachEmail}>`,
    to: args.to,
    subject: `You're invited to join ${args.teamName}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:20px">
        <p>Hi ${args.athleteName},</p>
        <p>${args.coachName} has invited you to join <strong>${args.teamName}</strong> on Matchday,
           where you can see your own schedule and progress.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${args.inviteUrl}"
             style="display:inline-block;padding:10px 24px;background:#0f172a;color:#fff;border-radius:6px;font-size:14px;text-decoration:none">
            Set up your account
          </a>
        </p>
        <p style="font-size:12px;color:#888">This link is unique to you and expires in 7 days.
           If you weren't expecting this, you can ignore this email.</p>
      </div>`,
  });
}

// Same transport, different audience: an assistant coach's account already
// exists (a head coach creates it directly, with a temp password) — this
// invite just lets them set their own password instead. See
// actions/users.ts::sendAssistantInvite(s).
export async function sendAssistantInviteEmail(args: {
  to: string;
  assistantName: string;
  coachName: string;
  coachEmail: string;
  inviteUrl: string;
}): Promise<void> {
  const creds = await credentials();
  if (!creds) throw new Error("Email sending isn't set up yet — add a Gmail address and App Password in Settings.");
  const transport = await transporterFor(creds.user, creds.pass);

  await transport.sendMail({
    from: `"${args.coachName}" <${creds.user}>`,
    replyTo: `"${args.coachName}" <${args.coachEmail}>`,
    to: args.to,
    subject: `You're invited to coach on Matchday`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:20px">
        <p>Hi ${args.assistantName},</p>
        <p>${args.coachName} has added you as an assistant coach on Matchday. Set your own password to
           finish setting up your account.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${args.inviteUrl}"
             style="display:inline-block;padding:10px 24px;background:#0f172a;color:#fff;border-radius:6px;font-size:14px;text-decoration:none">
            Set your password
          </a>
        </p>
        <p style="font-size:12px;color:#888">This link is unique to you and expires in 7 days.
           If you weren't expecting this, you can ignore this email.</p>
      </div>`,
  });
}
