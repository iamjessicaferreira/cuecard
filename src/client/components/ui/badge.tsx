import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-[var(--cream)]",
        className,
      )}
      {...props}
    />
  );
}
