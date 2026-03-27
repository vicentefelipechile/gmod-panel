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
  WifiOff,
  Trash2,
  Save,
  RefreshCw,
  Zap,
  Globe,
  Globe2,
  Shield,
  MessageSquare,
  Sliders,
  Info,
  AlertCircle,
  Loader,
  Send,
  List,
  Inbox,
  Box,
  Pencil,
  UserPlus,
  UserMinus,
  ChevronDown,
} from "lucide";

// -------------------------------------------------------------------------
// Icon map — used by createIcons() to hydrate data-lucide attributes
// -------------------------------------------------------------------------

export const iconMap = {
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
  WifiOff,
  Trash2,
  Save,
  RefreshCw,
  Zap,
  Globe,
  Globe2,
  Shield,
  MessageSquare,
  Sliders,
  Info,
  AlertCircle,
  Loader,
  Send,
  List,
  Inbox,
  Box,
  Pencil,
  UserPlus,
  UserMinus,
  ChevronDown,
};

// -------------------------------------------------------------------------
// refreshIcons — call after any innerHTML update that contains data-lucide
// -------------------------------------------------------------------------

export function refreshIcons() {
  createIcons({ icons: iconMap });
}
