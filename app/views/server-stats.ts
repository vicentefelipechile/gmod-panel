// =========================================================================
// views/server-stats.ts — Charts: player count, map playtime, FPS
// Uses Chart.js, loaded lazily.
// =========================================================================

import { Servers } from "../lib/api";
import { renderTopbar } from "../components/topbar";
import { serverTabs } from "./server-home";
import type { RouteContext } from "../router";

export async function serverStatsView(ctx: RouteContext): Promise<string> {
  const id = ctx.params.id;
  renderTopbar(["Servers", id, "Stats"], ctx.user);

  return `
    ${serverTabs(id, "stats")}
    <div class="grid grid-2 mb-4">
      <div class="card">
        <div class="card-header"><div class="card-title">Player Count (24h)</div></div>
        <canvas id="chart-players" height="180"></canvas>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Server FPS (7d)</div></div>
        <canvas id="chart-fps" height="180"></canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Map Playtime (7d)</div></div>
      <canvas id="chart-maps" height="120"></canvas>
    </div>
  `;
}

export async function serverStatsAfter(ctx: RouteContext) {
  const id = ctx.params.id;
  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);

  const GRID_COLOR = "rgba(99,179,237,0.07)";
  const TICK_COLOR = "#475569";
  const BASE_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: TICK_COLOR, font: { size: 11 } }, grid: { color: GRID_COLOR } },
      y: { ticks: { color: TICK_COLOR, font: { size: 11 } }, grid: { color: GRID_COLOR } },
    },
  };

  try {
    const [playersData, fpsData, mapsData] = await Promise.all([
      Servers.stats.players(id),
      Servers.stats.performance(id),
      Servers.stats.maps(id),
    ]);

    // Players chart
    new Chart(document.getElementById("chart-players") as HTMLCanvasElement, {
      type: "line",
      data: {
        labels: playersData.data.map(d => new Date(d.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
        datasets: [{
          label: "Avg Players",
          data: playersData.data.map(d => d.avg_players),
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.08)",
          fill: true,
          tension: 0.4,
        }],
      },
      options: BASE_OPTS,
    });

    // FPS chart
    new Chart(document.getElementById("chart-fps") as HTMLCanvasElement, {
      type: "line",
      data: {
        labels: fpsData.data.map(d => new Date(d.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
        datasets: [{
          label: "Avg FPS",
          data: fpsData.data.map(d => d.avg_fps),
          borderColor: "#4ade80",
          backgroundColor: "rgba(74,222,128,0.08)",
          fill: true,
          tension: 0.4,
        }],
      },
      options: BASE_OPTS,
    });

    // Maps bar chart
    new Chart(document.getElementById("chart-maps") as HTMLCanvasElement, {
      type: "bar",
      data: {
        labels: mapsData.data.map(d => d.map),
        datasets: [{
          label: "Snapshots",
          data: mapsData.data.map(d => d.snapshot_count),
          backgroundColor: "rgba(167,139,250,0.5)",
          borderColor: "#a78bfa",
          borderWidth: 1,
        }],
      },
      options: BASE_OPTS,
    });


  } catch {
    // Charts fail silently — no data is fine
  }
}
