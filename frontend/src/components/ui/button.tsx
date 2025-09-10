"use client";
import { forwardRef, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const Spinner = ({ className = "" }: { className?: string }) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const base = [
      "inline-flex items-center justify-center gap-2",
      "font-medium rounded-lg",
      "transition-all duration-200 ease-out",
      "btn-press",
      "disabled:opacity-50 disabled:pointer-events-none",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]",
    ].join(" ");

    const variantStyles: Record<string, string> = {
      primary: [
        "bg-[var(--cyan)] text-[var(--text-inverse)]",
        "hover:brightness-110",
        "shadow-[0_0_20px_var(--cyan-15)]",
        "hover:shadow-[0_0_30px_var(--cyan-40)]",
      ].join(" "),
      secondary: [
        "bg-[var(--bg-surface)] text-[var(--cyan)]",
        "border border-[var(--border-default)]",
        "hover:border-[var(--border-strong)]",
        "hover:bg-[var(--bg-elevated)]",
      ].join(" "),
      ghost: [
        "bg-transparent text-[var(--text-secondary)]",
        "hover:text-[var(--text-primary)]",
        "hover:bg-[var(--cyan-08)]",
      ].join(" "),
      danger: [
        "bg-[var(--red)] text-white",
        "hover:brightness-110",
        "shadow-[0_0_20px_var(--red-15)]",
        "hover:shadow-[0_0_30px_var(--red-80)]",
      ].join(" "),
    };

    const sizeStyles: Record<string, string> = {
      sm: "px-3 py-1.5 text-xs h-8",
      md: "px-5 py-2.5 text-sm h-10",
      lg: "px-8 py-3 text-base h-12",
    };

    const spinnerSize: Record<string, string> = {
      sm: "w-3 h-3",
      md: "w-4 h-4",
      lg: "w-5 h-5",
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner className={spinnerSize[size]} />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
