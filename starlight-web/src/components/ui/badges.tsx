import { cn, statusClass } from "@/lib/utils";

export function StatusBadge({ status }: { status: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        statusClass(status)
      )}
    >
      {status || "Unknown"}
    </span>
  );
}

export function DaysRemainingBadge({
  eventDate,
}: {
  eventDate: string | null;
}) {
  if (!eventDate) return null;

  const diff = Math.ceil(
    (new Date(eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  let color = "bg-starlight-green/10 text-starlight-green";
  if (diff < 0) color = "bg-gray-100 text-gray-500";
  else if (diff <= 7) color = "bg-red-100 text-starlight-red";
  else if (diff <= 14) color = "bg-amber-100 text-starlight-amber";

  const label = diff < 0 ? `${Math.abs(diff)}d ago` : `${diff}d`;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        color
      )}
    >
      {label}
    </span>
  );
}

export function PhasePill({ phase }: { phase: number | null }) {
  const colors: Record<number, string> = {
    1: "bg-phase-1",
    2: "bg-phase-2",
    3: "bg-phase-3",
    4: "bg-phase-4",
    5: "bg-phase-5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white",
        phase ? colors[phase] || "bg-gray-400" : "bg-gray-400"
      )}
    >
      Phase {phase || "?"}
    </span>
  );
}
