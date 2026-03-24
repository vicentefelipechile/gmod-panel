// =========================================================================
// lib/icons.ts — Lucide icon helpers for template-string rendering
// =========================================================================

import {
  createIcons,
  Server,
  Settings,
  LogIn,
  Users,
  Activity,
  Terminal,
  AlertTriangle,
  BarChart2,
  ChevronRight,
  User,
  Menu,
  Map,
  Clock,
} from "lucide";

// -------------------------------------------------------------------------
// Icon map — used by createIcons() to hydrate data-lucide attributes
// -------------------------------------------------------------------------

export const iconMap = {
  server:         Server,
  settings:       Settings,
  "log-in":       LogIn,
  users:          Users,
  activity:       Activity,
  terminal:       Terminal,
  "alert-triangle": AlertTriangle,
  "bar-chart-2":  BarChart2,
  "chevron-right":ChevronRight,
  user:           User,
  menu:           Menu,
  map:            Map,
  clock:          Clock,
};

// -------------------------------------------------------------------------
// refreshIcons — call after any innerHTML update that contains data-lucide
// -------------------------------------------------------------------------

export function refreshIcons() {
  createIcons({ icons: iconMap });
}
