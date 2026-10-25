import { z } from "zod";
import { values, PRIORITIES, FEEDBACK_VISIBILITY, ATHLETE_STATUSES, INJURY_STATUSES, SOCCER_POSITIONS, DOMINANT_FOOT } from "./enums";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// A newly CHOSEN password (signup, invite-accept, change-password) — at
// least 8 characters plus one digit and one special character, on top of
// bcrypt's own cost factor. Not applied to loginSchema.password above,
// which just needs to be non-empty (an existing password may predate this
// rule).
export const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character");

// A brand-new head coach creating their own independent workspace (OWNER
// account) — see actions/signup.ts. Same password-choice shape as
// acceptAthleteInviteSchema below.
export const signupSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Enter a valid email address"),
    password: newPassword,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// Treat empty strings from form fields as undefined so optional fields work.
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url("Must be a valid URL").optional(),
);

export const feedbackSchema = z.object({
  message: z.string().min(1, "Feedback cannot be empty"),
  visibility: z.enum(values(FEEDBACK_VISIBILITY)).default("COACH_ONLY"),
});

export const feedbackEditSchema = z.object({
  message: z.string().min(1, "Feedback cannot be empty"),
});

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: optionalString,
  assignedToId: optionalString,
  athleteId: optionalString, // optional: athlete-specific, team-wide, or general
  teamId: optionalString,
  date: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  recurring: z.coerce.boolean().default(false),
  priority: z.enum(values(PRIORITIES)).default("MEDIUM"),
});

export const taskUpdateSchema = z.object({
  completed: z.coerce.boolean().optional(),
  notes: optionalString,
  evidenceUrl: optionalUrl,
});

// Always creates an ASSISTANT (assistant coach) — OWNER accounts only ever
// come from /signup now, and CLIENT (Athlete) accounts from the athlete-
// invite flow, not here. An existing assistant can still be promoted to
// OWNER via changeUserRole (src/actions/users.ts) if they're "graduating"
// into their own workspace — this schema only governs the initial create.
export const newUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email address"),
});

// --- Athlete schemas ---------------------------------------------------------
export const athleteSchema = z.object({
  displayName: z.string().min(1, "Athlete name is required"),
  dateOfBirth: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  jerseyNumber: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(999).optional()),
  primaryPosition: z.preprocess(emptyToUndefined, z.enum(values(SOCCER_POSITIONS)).optional()),
  // Sent as a JSON-encoded string[] by the form (a checkbox group) — see
  // src/components/athletes/athlete-form.tsx.
  secondaryPositions: z.preprocess((v) => {
    if (typeof v !== "string" || v === "") return undefined;
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : undefined;
    } catch {
      return undefined;
    }
  }, z.array(z.enum(values(SOCCER_POSITIONS))).optional()),
  dominantFoot: z.preprocess(emptyToUndefined, z.enum(values(DOMINANT_FOOT)).optional()),
  status: z.enum(values(ATHLETE_STATUSES)).default("ACTIVE"),
  injuryStatus: z.enum(values(INJURY_STATUSES)).default("HEALTHY"),
  injuryNote: optionalString,
  notes: optionalString,
  email: z.preprocess(emptyToUndefined, z.string().email("Enter a valid email address").optional()),
});
export type AthleteInput = z.infer<typeof athleteSchema>;

// An athlete's own email + password when accepting a self-service invite
// link (the coach no longer picks these — see actions/invite.ts).
export const acceptAthleteInviteSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    password: newPassword,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// An assistant coach setting their own password when accepting a
// self-service invite link — no email field, since their account (and its
// email) already exists (see actions/assistant-invite.ts).
export const acceptAssistantInviteSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// --- Team schemas -------------------------------------------------------------
export const teamSchema = z.object({
  name: z.string().min(1, "Team name is required"),
  ageGroup: optionalString,
  season: optionalString,
});
export type TeamInput = z.infer<typeof teamSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
