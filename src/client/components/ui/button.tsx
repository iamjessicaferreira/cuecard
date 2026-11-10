import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-extrabold transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mango)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--night)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--mango)] text-[var(--ink)] shadow-[0_4px_0_#a86b00]",
        secondary: "bg-white/10 text-[var(--cream)]",
        outline: "border-2 border-white/20 bg-transparent text-[var(--cream)]",
        ghost: "bg-transparent text-[var(--cream)]",
        destructive: "bg-[var(--coral)] text-white shadow-[0_4px_0_#9d1c2f]",
      },
      size: {
        default: "h-14 px-5 text-base",
        lg: "h-16 px-6 text-lg",
        xl: "h-[4.5rem] w-full px-6 text-xl",
        sm: "h-10 px-3 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} type={asChild ? undefined : type} {...props} />;
}
