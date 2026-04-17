"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { LearningCapture } from "@/components/learning-capture";
import { LearningEntityContext } from "@/lib/learnings";

interface LearningTriggerProps {
  context: LearningEntityContext;
  variant?: "icon" | "button";
  className?: string;
  title?: string;
  onSaved?: () => void;
}

export function LearningTrigger({
  context,
  variant = "icon",
  className = "",
  title = "Capture learning",
  onSaved,
}: LearningTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={title}
        className={
          variant === "icon"
            ? `p-1 text-faint hover:text-starlight-blue hover:bg-starlight-blue/10 rounded-md transition-colors ${className}`
            : `inline-flex items-center gap-1 px-2 py-1 text-xs text-muted hover:text-starlight-blue border border-subtle hover:border-starlight-blue rounded transition-colors ${className}`
        }>
        <BookOpen className={variant === "icon" ? "h-3.5 w-3.5" : "h-3 w-3"} />
        {variant === "button" && <span>Learning</span>}
      </button>
      <LearningCapture open={open} onClose={() => setOpen(false)} onSaved={onSaved} context={context} />
    </>
  );
}
