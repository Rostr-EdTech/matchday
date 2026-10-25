import {
  LayoutDashboard,
  ListChecks,
  Activity,
  Users,
  UserCog,
  Contact,
  Shield,
  LayoutGrid,
  CalendarDays,
  ClipboardCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const OWNER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Tactical Board", href: "/teams/board", icon: LayoutGrid },
  { label: "Matches", href: "/teams/matches", icon: CalendarDays },
  { label: "Attendance", href: "/teams/attendance", icon: ClipboardCheck },
  { label: "Teams", href: "/admin/teams", icon: Shield },
  { label: "Athletes", href: "/admin/athletes", icon: Contact },
  { label: "Assistant Coaches", href: "/admin/assistants", icon: UserCog },
  { label: "Tasks", href: "/admin/tasks", icon: ListChecks },
  { label: "Activity Log", href: "/admin/activity", icon: Activity },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export const ASSISTANT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/assistant/dashboard", icon: LayoutDashboard },
  { label: "Tactical Board", href: "/teams/board", icon: LayoutGrid },
  { label: "Matches", href: "/teams/matches", icon: CalendarDays },
  { label: "Attendance", href: "/teams/attendance", icon: ClipboardCheck },
  { label: "My Tasks", href: "/assistant/tasks", icon: ListChecks },
];

// CLIENT portal — a limited view scoped to the athlete's own data.
export const CLIENT_NAV: NavItem[] = [
  { label: "Overview", href: "/portal/dashboard", icon: LayoutDashboard },
];

export function navFor(role: string): NavItem[] {
  if (role === "CLIENT") return CLIENT_NAV;
  if (role === "ASSISTANT") return ASSISTANT_NAV;
  return OWNER_NAV; // OWNER / legacy ADMIN
}
