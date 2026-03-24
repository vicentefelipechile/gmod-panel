// =========================================================================
// router.ts — Minimal SPA router using the History API
// =========================================================================

import type { Me } from "./lib/api";
import { refreshIcons } from "./lib/icons";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
  user: Me | null;
}

type ViewFn = (ctx: RouteContext) => string | Promise<string>;
type AfterFn = (ctx: RouteContext) => void;

interface Route {
  pattern: RegExp;
  keys: string[];
  view: ViewFn;
  after?: AfterFn;
  requireAuth: boolean;
}

// -------------------------------------------------------------------------
// Registry
// -------------------------------------------------------------------------

const routes: Route[] = [];
let notFoundView: ViewFn = () =>
  `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Page not found</div></div>`;

export function route(
  path: string,
  view: ViewFn,
  opts: { requireAuth?: boolean; after?: AfterFn } = {}
) {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:([^/]+)/g, (_, k) => {
        keys.push(k);
        return "([^/]+)";
      }) +
      "$"
  );
  routes.push({ pattern, keys, view, after: opts.after, requireAuth: opts.requireAuth ?? true });
}

export function notFound(view: ViewFn) {
  notFoundView = view;
}

// -------------------------------------------------------------------------
// Navigation
// -------------------------------------------------------------------------

export function navigate(path: string, replace = false) {
  if (replace) {
    history.replaceState(null, "", path);
  } else {
    history.pushState(null, "", path);
  }
  dispatch();
}

// -------------------------------------------------------------------------
// Dispatch
// -------------------------------------------------------------------------

let currentUser: Me | null = null;

export function setUser(u: Me | null) {
  currentUser = u;
}

async function dispatch() {
  const path = location.pathname;
  const query = new URLSearchParams(location.search);

  for (const r of routes) {
    const m = path.match(r.pattern);
    if (!m) continue;

    if (r.requireAuth && !currentUser) {
      navigate("/login", true);
      return;
    }

    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

    const ctx: RouteContext = { params, query, user: currentUser };
    const viewEl = document.getElementById("view")!;

    viewEl.innerHTML = `<div class="loading-screen"><span class="spinner"></span></div>`;
    viewEl.innerHTML = await r.view(ctx);
    r.after?.(ctx);
    refreshIcons();
    return;
  }

  const viewEl = document.getElementById("view")!;
  viewEl.innerHTML = await notFoundView({ params: {}, query, user: currentUser });
}

// -------------------------------------------------------------------------
// Init
// -------------------------------------------------------------------------

export function initRouter() {
  // Intercept link clicks
  document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("//") || href.startsWith("/auth/")) return;
    e.preventDefault();
    navigate(href);
  });

  // Browser back/forward
  window.addEventListener("popstate", dispatch);

  // Dispatch current URL
  dispatch();
}
