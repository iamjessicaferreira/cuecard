import * as React from "react";
import { cn } from "../../lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-14 w-full rounded-2xl border-2 border-white/15 bg-white/10 px-4 text-lg font-extrabold text-[var(--cream)] outline-none placeholder:font-semibold placeholder:text-white/40 focus:border-[var(--mango)]",
        className,
      )}
      {...props}
    />
  );
}
