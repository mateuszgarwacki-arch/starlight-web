"use client";

import { PresenceUser } from "@/lib/use-presence";
import { useState } from "react";

// ============================================================
// PresenceAvatars — coloured initials showing who's here
// ============================================================

interface Props {
  others: PresenceUser[];
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function PresenceAvatars({ others, className = "" }: Props) {
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);

  if (others.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-xs text-gray-400 mr-1">Also viewing:</span>
      <div className="flex -space-x-1.5">
        {others.map((user) => (
          <div
            key={user.userId}
            className="relative"
            onMouseEnter={() => setHoveredUser(user.userId)}
            onMouseLeave={() => setHoveredUser(null)}
          >
            {/* Avatar circle */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white cursor-default select-none"
              style={{ backgroundColor: user.avatarColor }}
              title={user.userName}
            >
              {getInitials(user.userName)}
            </div>

            {/* Editing indicator dot */}
            {user.editingField && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-starlight-amber ring-2 ring-white" />
            )}

            {/* Tooltip on hover */}
            {hoveredUser === user.userId && (
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap">
                <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                  <p className="font-medium">{user.userName}</p>
                  {user.editingField && (
                    <p className="text-amber-300 mt-0.5">
                      Editing: {user.editingField.replace(/_/g, " ")}
                    </p>
                  )}
                  <p className="text-gray-400 mt-0.5">
                    Viewing since {timeAgo(user.enteredAt)}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FieldPresenceIndicator — wraps a field to show who's editing it.
 * Use: <FieldPresenceIndicator others={others} field="est_hours">
 *        <input ... />
 *      </FieldPresenceIndicator>
 */
interface FieldIndicatorProps {
  others: PresenceUser[];
  field: string;
  children: React.ReactNode;
}

export function FieldPresenceIndicator({ others, field, children }: FieldIndicatorProps) {
  const editor = others.find((u) => u.editingField === field);
  if (!editor) return <>{children}</>;

  return (
    <div className="relative">
      <div
        className="absolute inset-0 rounded pointer-events-none z-10"
        style={{ boxShadow: `0 0 0 2px ${editor.avatarColor}` }}
      />
      <div
        className="absolute -top-5 left-1 text-[10px] font-medium px-1.5 py-0.5 rounded-t text-white z-10"
        style={{ backgroundColor: editor.avatarColor }}
      >
        {editor.userName.split(" ")[0]}
      </div>
      {children}
    </div>
  );
}
