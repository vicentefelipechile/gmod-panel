// =========================================================================
// views/login.ts — Login / unauthenticated view
// =========================================================================

import { Auth } from "../lib/api";
import type { RouteContext } from "../router";

export async function loginView(_ctx: RouteContext): Promise<string> {
  // Hide sidebar and topbar on login page
  document.getElementById("sidebar")!.style.display = "none";
  document.getElementById("topbar")!.style.display = "none";

  return `
    <div class="login-page">
      <div class="login-box">
        <div class="login-wordmark">
          <div class="login-wordmark-name">GMod<span>Panel</span></div>
          <div class="login-wordmark-sub">Server Dashboard</div>
        </div>
        <div class="login-desc">
          Serverless Garry's Mod server monitoring &amp; administration dashboard.
        </div>
        <a href="${Auth.loginUrl()}" class="btn-steam">
          <svg width="16" height="16" viewBox="0 0 233 233" fill="currentColor">
            <path d="M116.5 0C52.1 0 0 52.1 0 116.5c0 55.4 38.8 101.8 90.8 113.5l30.5-73.2a46.3 46.3 0 0 1-5.5-60.4 46.4 46.4 0 1 1 74.8 54.7l-1.1 1.2-71.7 30.1a46.3 46.3 0 0 1-26.2 0l-1.2.3C137.2 222 176.1 233 214.7 220A116.5 116.5 0 0 0 116.5 0z"/>
          </svg>
          Sign in with Steam
        </a>
      </div>
    </div>
  `;
}

export function loginAfter(_ctx: RouteContext) {
  // Restore layout for other views
  document.getElementById("sidebar")!.style.display = "";
  document.getElementById("topbar")!.style.display = "";
}
