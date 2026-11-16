import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  noUppercase?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, noUppercase, onChange, ...props }, ref) => {
    const isExcluded =
      type === "email" ||
      type === "password" ||
      type === "number" ||
      type === "date" ||
      type === "time" ||
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      Boolean(noUppercase);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isExcluded && typeof e.target.value === "string") {
        e.target.value = e.target.value.toUpperCase();
      }
      onChange?.(e);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50",
          !isExcluded && "uppercase",
          className
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
