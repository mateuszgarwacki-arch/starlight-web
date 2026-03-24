"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================
// Presence — who's viewing the same resource right now
// ============================================================

export interface PresenceUser {
  userId: string;
  userName: string;
  avatarColor: string;
  currentPage: string;
  editingField?: string | null;
  enteredAt: string;
}

/** Deterministic colour from user ID — 8 pleasing colours */
const AVATAR_COLORS = [
  "#E25D5D", // red
  "#E2875D", // orange
  "#D4A843", // gold
  "#5DAE5D", // green
  "#5D9EE2", // blue
  "#7E5DE2", // purple
  "#C55DB8", // pink
  "#5DB8B8", // teal
];

function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * usePresence — join a presence channel for a resource.
 *
 * @param resourceType  "job" | "scope" | "wo"
 * @param resourceId    the numeric ID
 * @param pageName      label for what the user is viewing (e.g. "Quote Lines", "Scope Breakdown")
 *
 * Returns:
 *   others       — array of other users on the same channel
 *   setEditing   — call with field name when user focuses an input, null on blur
 *   myColor      — this user's avatar colour (for field highlight matching)
 */
export function usePresence(
  resourceType: string,
  resourceId: number | string | null,
  pageName: string = ""
) {
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const [myColor, setMyColor] = useState<string>("#999");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const editingRef = useRef<string | null>(null);
  const userInfoRef = useRef<{ userId: string; userName: string } | null>(null);

  // Broadcast current editing field to the channel
  const setEditing = useCallback((field: string | null) => {
    editingRef.current = field;
    const ch = channelRef.current;
    if (!ch || !userInfoRef.current) return;
    ch.track({
      userId: userInfoRef.current.userId,
      userName: userInfoRef.current.userName,
      avatarColor: myColor,
      currentPage: pageName,
      editingField: field,
      enteredAt: new Date().toISOString(),
    });
  }, [myColor, pageName]);

  useEffect(() => {
    if (!resourceId) return;

    const supabase = createClient();
    const channelName = `presence:${resourceType}:${resourceId}`;

    let mounted = true;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const userId = user.id;
      const userName = user.user_metadata?.name || user.email || "Unknown";
      const color = colorFromId(userId);
      userInfoRef.current = { userId, userName };
      setMyColor(color);

      const myState = {
        userId,
        userName,
        avatarColor: color,
        currentPage: pageName,
        editingField: null as string | null,
        enteredAt: new Date().toISOString(),
      };

      const channel = supabase.channel(channelName, {
        config: { presence: { key: userId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!mounted) return;
          const state = channel.presenceState<PresenceUser>();
          const users: PresenceUser[] = [];
          for (const [key, presences] of Object.entries(state)) {
            if (key === userId) continue; // skip self
            const p = presences[0] as PresenceUser;
            if (p) users.push(p);
          }
          setOthers(users);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track(myState);
          }
        });

      channelRef.current = channel;
    }

    init();

    return () => {
      mounted = false;
      if (channelRef.current) {
        const supabase = createClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [resourceType, resourceId, pageName]);

  return { others, setEditing, myColor };
}
