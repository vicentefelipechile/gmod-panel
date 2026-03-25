// =========================================================================
// lib/events.ts - Centralized event formatter for the server event feed
// =========================================================================

export interface EventDef {
  icon: string;
  emoji: string;
  format: (data: Record<string, any>) => string;
}

const eventRegistry: Record<string, EventDef> = {
  player_join: {
    icon: "join",
    emoji: "→",
    format: (d) => `<strong>${d.name ?? "?"}</strong> joined`
  },
  player_leave: {
    icon: "leave",
    emoji: "←",
    format: (d) => `<strong>${d.name ?? "?"}</strong> left`
  },
  player_death: {
    icon: "death",
    emoji: "💀",
    format: (d) => {
      const a = (d.attacker as { name?: string } | null)?.name;
      const v = (d.victim   as { name?: string } | null)?.name;
      return a ? `<strong>${a}</strong> killed <strong>${v ?? "?"}</strong> with ${d.weapon ?? "?"}` : `<strong>${v ?? "?"}</strong> died`;
    }
  },
  player_chat: {
    icon: "chat",
    emoji: "💬",
    format: (d) => `<strong>${d.name ?? "?"}</strong>: ${d.message ?? ""}`
  },
  map_change: {
    icon: "map",
    emoji: "🗺️",
    format: (d) => `Map changed to <strong>${d.map ?? "?"}</strong>`
  }
};

export function getEventDef(type: string): EventDef {
  if (eventRegistry[type]) {
    return eventRegistry[type];
  }
  return {
    icon: "default",
    emoji: "•",
    format: () => `${type}`
  };
}
