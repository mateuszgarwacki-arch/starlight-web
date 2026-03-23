"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to Supabase Realtime changes on one or more tables.
 * Calls `onEvent` whenever an INSERT, UPDATE, or DELETE happens.
 * Debounces by 500ms to batch rapid-fire changes (e.g. multi-day bookings).
 *
 * Usage:
 *   useRealtimeRefresh(["tbl_work_orders", "tbl_wo_time_entries"], loadAll);
 */
export function useRealtimeRefresh(
  tables: string | string[],
  onEvent: () => void,
  enabled: boolean = true
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const tableKey = Array.isArray(tables) ? tables.join(",") : tables;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const tableList = Array.isArray(tables) ? tables : [tables];
    const channelName = `rt-${tableList.join("-")}-${Date.now()}`;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onEventRef.current();
      }, 500);
    };

    let channel: RealtimeChannel = supabase.channel(channelName);

    tableList.forEach((table) => {
      channel = channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        debouncedRefresh
      );
    });

    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [tableKey, enabled]);
}
