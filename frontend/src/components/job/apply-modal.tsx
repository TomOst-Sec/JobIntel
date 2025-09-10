"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Job {
  job_id: string;
  title: string;
  company: string;
  company_logo?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  apply_link?: string;
  location?: string;
  is_remote?: boolean;
}

interface ApplyModalProps {
  job: Job;
  open: boolean;
  onClose: () => void;
}

type ApplyVariant = "external" | "quick" | "both";

interface QuickApplyForm {
  fullName: string;
  email: string;
  resumeFile: File | null;
  coverLetter: string;
}

interface ApplicationPayload {
  job_id: string;
  company: string;
  title: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalary(amount: number): string {
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `$${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const val = amount / 1000;
    return `$${val.toFixed(0)}K`;
  }
  return `$${amount}`;
}

function getSalaryDisplay(
  min?: number | null,
  max?: number | null
): string | null {
  const hasMin = min != null && min > 0;
  const hasMax = max != null && max > 0;
  if (hasMin && hasMax) return `${formatSalary(min!)} - ${formatSalary(max!)}`;
  if (hasMin) return formatSalary(min!);
  if (hasMax) return formatSalary(max!);
  return null;
}

function detectVariant(_job: Job): ApplyVariant {
  // Always use native quick-apply — never redirect users away from the platform
  return "quick";
}

function isExternalLink(link: string): boolean {
  try {
    const url = new URL(link, window.location.origin);
    return url.origin !== window.location.origin;
  } catch {
    return true;
  }
}

function getLettermarkColor(company: string): string {
  const colors = [
    "var(--cyan)",
    "var(--green)",
    "var(--gold)",
    "var(--purple)",
    "#ff8800",
    "var(--red)",
  ];
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = company.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ---------------------------------------------------------------------------
// ApplyModal Component
// ---------------------------------------------------------------------------

export function ApplyModal({ job, open, onClose }: ApplyModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const backdropRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const variant = detectVariant(job);

  // Form state
  const [form, setForm] = useState<QuickApplyForm>({
    fullName: user?.full_name || "",
    email: user?.email || "",
    resumeFile: null,
    coverLetter: "",
  });

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"external" | "quick">(
    variant === "quick" ? "quick" : "external"
  );

  // Pre-fill form when user data loads
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        fullName: prev.fullName || user.full_name || "",
        email: prev.email || user.email || "",
      }));
    }
  }, [user]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSuccess(false);
      setError(null);
      setSubmitting(false);
      setActiveTab(variant === "quick" ? "quick" : "external");
    }
  }, [open, variant]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Trap focus inside modal
  useEffect(() => {
    if (!open) return;
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = modal.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }, [open, success]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle external apply
  const handleExternalApply = useCallback(async () => {
    if (!job.apply_link) return;
    setSubmitting(true);
    setError(null);

    try {
      // Track the application
      await api.post<ApplicationPayload>("/applications", {
        job_id: job.job_id,
        company: job.company,
        title: job.title,
        status: "applied",
      });
    } catch {
      // Non-blocking: tracking failure shouldn't prevent applying
    }

    // Open external link
    window.open(job.apply_link, "_blank", "noopener,noreferrer");
    setSubmitting(false);
    setSuccess(true);
  }, [job]);

  // Handle quick apply submit
  const handleQuickApply = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);

      if (!form.fullName.trim()) {
        setError("Full name is required.");
        setSubmitting(false);
        return;
      }

      if (!form.email.trim() || !form.email.includes("@")) {
        setError("A valid email address is required.");
        setSubmitting(false);
        return;
      }

      try {
        await api.post("/applications", {
          job_id: job.job_id,
          company: job.company,
          title: job.title,
          status: "applied",
          notes: form.coverLetter || undefined,
          external_url: job.apply_link || undefined,
        });
        setSuccess(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [form, job]
  );

  // Handle file selection
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      setForm((prev) => ({ ...prev, resumeFile: file }));
    },
    []
  );

  if (!open) return null;

  const salaryDisplay = getSalaryDisplay(job.salary_min, job.salary_max);
  const letterColor = getLettermarkColor(job.company);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(3, 5, 8, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full rounded-xl overflow-hidden animate-fade-up"
        style={{
          maxWidth: "500px",
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5), var(--shadow-glow-cyan)",
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-200"
          style={{
            color: "var(--text-muted)",
            backgroundColor: "var(--bg-surface)",
          }}
          aria-label="Close modal"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Job Summary Header */}
        <div
          className="px-6 pt-6 pb-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-start gap-3 pr-8">
            {job.company_logo ? (
              <img
                src={job.company_logo}
                alt={`${job.company} logo`}
                className="w-10 h-10 rounded-lg object-contain shrink-0"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-display text-sm shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, ${letterColor} 15%, transparent)`,
                  color: letterColor,
                  border: `1px solid color-mix(in srgb, ${letterColor} 25%, transparent)`,
                }}
              >
                {job.company.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id="apply-modal-title"
                className="text-base font-semibold leading-snug"
                style={{ color: "var(--text-primary)" }}
              >
                {job.title}
              </h2>
              <p
                className="text-sm mt-0.5"
                style={{ color: "var(--text-secondary)" }}
              >
                {job.company}
              </p>
              {salaryDisplay && (
                <p
                  className="text-sm font-mono font-bold mt-1"
                  style={{ color: "var(--green)" }}
                >
                  {salaryDisplay}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5">
          {success ? (
            <SuccessState onClose={onClose} />
          ) : variant === "external" ? (
            <ExternalApplyView
              job={job}
              submitting={submitting}
              error={error}
              onApply={handleExternalApply}
              onCancel={onClose}
            />
          ) : variant === "quick" ? (
            <QuickApplyView
              form={form}
              setForm={setForm}
              submitting={submitting}
              error={error}
              onSubmit={handleQuickApply}
              onCancel={onClose}
              onFileChange={handleFileChange}
            />
          ) : (
            /* Both variant — tabbed */
            <BothApplyView
              job={job}
              form={form}
              setForm={setForm}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              submitting={submitting}
              error={error}
              onExternalApply={handleExternalApply}
              onQuickApply={handleQuickApply}
              onCancel={onClose}
              onFileChange={handleFileChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success State
// ---------------------------------------------------------------------------

function SuccessState({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center text-center py-4">
      {/* Checkmark animation */}
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4 animate-fade-up"
        style={{
          backgroundColor: "var(--green-15)",
          boxShadow: "var(--shadow-glow-green)",
        }}
      >
        <svg
          className="w-8 h-8"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          style={{ color: "var(--green)" }}
        >
          <path
            d="M8 16l6 6 10-12"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Application tracked!
      </h3>
      <p
        className="text-sm mb-6"
        style={{ color: "var(--text-secondary)" }}
      >
        Your application has been recorded. Track all your applications in one
        place to stay organized throughout your job search.
      </p>

      <div className="flex gap-3 w-full">
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          onClick={() => {
            onClose();
            router.push("/dashboard/settings");
          }}
        >
          View Application Tracker
        </Button>
        <Button variant="secondary" size="md" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// External Apply View
// ---------------------------------------------------------------------------

function ExternalApplyView({
  job,
  submitting,
  error,
  onApply,
  onCancel,
}: {
  job: Job;
  submitting: boolean;
  error: string | null;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          You will be redirected to the employer's application page. Your
          application will be tracked in JobIntel so you can follow up and
          monitor its progress.
        </p>
        {job.apply_link && (
          <p
            className="text-xs mt-2 font-mono truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {job.apply_link}
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          loading={submitting}
          onClick={onApply}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 3l-1 1 4 4-4 4 1 1 5-5-5-5z"
              fill="currentColor"
            />
            <path
              d="M3 8h9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Apply on External Site
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Apply View
// ---------------------------------------------------------------------------

function QuickApplyView({
  form,
  setForm,
  submitting,
  error,
  onSubmit,
  onCancel,
  onFileChange,
}: {
  form: QuickApplyForm;
  setForm: React.Dispatch<React.SetStateAction<QuickApplyForm>>;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Full Name */}
      <FormField label="Full Name" required>
        <input
          type="text"
          value={form.fullName}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, fullName: e.target.value }))
          }
          placeholder="Your full name"
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors duration-200"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
          required
          autoComplete="name"
        />
      </FormField>

      {/* Email */}
      <FormField label="Email" required>
        <input
          type="email"
          value={form.email}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, email: e.target.value }))
          }
          placeholder="your@email.com"
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors duration-200"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
          required
          autoComplete="email"
        />
      </FormField>

      {/* Resume Upload */}
      <FormField label="Resume">
        <div
          className="relative rounded-lg p-3 text-center cursor-pointer transition-colors duration-200"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px dashed var(--border-default)",
          }}
        >
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={onFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Upload resume"
          />
          {form.resumeFile ? (
            <div className="flex items-center justify-center gap-2">
              <svg
                className="w-4 h-4"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                style={{ color: "var(--green)" }}
              >
                <path
                  d="M4 8l3 3 5-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="text-sm truncate max-w-[300px]"
                style={{ color: "var(--text-primary)" }}
              >
                {form.resumeFile.name}
              </span>
            </div>
          ) : (
            <div>
              <svg
                className="w-5 h-5 mx-auto mb-1"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                style={{ color: "var(--text-muted)" }}
              >
                <path
                  d="M10 3v10M6 7l4-4 4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Click to upload PDF, DOC, or DOCX
              </p>
            </div>
          )}
        </div>
      </FormField>

      {/* Cover Letter */}
      <FormField label="Cover Letter (optional)">
        <textarea
          value={form.coverLetter}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, coverLetter: e.target.value }))
          }
          placeholder="Why are you a great fit for this role?"
          rows={4}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-y transition-colors duration-200"
          style={{
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            minHeight: "80px",
          }}
        />
      </FormField>

      {error && (
        <p className="text-xs" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          variant="primary"
          size="md"
          className="flex-1"
          loading={submitting}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14 2l-7 7M14 2l-4 12-3-5-5-3 12-4z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Submit Application
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Both Apply View (tabbed: external + quick)
// ---------------------------------------------------------------------------

function BothApplyView({
  job,
  form,
  setForm,
  activeTab,
  setActiveTab,
  submitting,
  error,
  onExternalApply,
  onQuickApply,
  onCancel,
  onFileChange,
}: {
  job: Job;
  form: QuickApplyForm;
  setForm: React.Dispatch<React.SetStateAction<QuickApplyForm>>;
  activeTab: "external" | "quick";
  setActiveTab: (tab: "external" | "quick") => void;
  submitting: boolean;
  error: string | null;
  onExternalApply: () => void;
  onQuickApply: (e: React.FormEvent) => void;
  onCancel: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div
        className="flex rounded-lg overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
        role="tablist"
        aria-label="Apply method"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "external"}
          onClick={() => setActiveTab("external")}
          className="flex-1 px-4 py-2.5 text-xs font-medium transition-all duration-200"
          style={{
            backgroundColor:
              activeTab === "external" ? "var(--cyan-15)" : "transparent",
            color:
              activeTab === "external"
                ? "var(--cyan)"
                : "var(--text-secondary)",
            borderBottom:
              activeTab === "external"
                ? "2px solid var(--cyan)"
                : "2px solid transparent",
          }}
        >
          External Apply
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "quick"}
          onClick={() => setActiveTab("quick")}
          className="flex-1 px-4 py-2.5 text-xs font-medium transition-all duration-200"
          style={{
            backgroundColor:
              activeTab === "quick" ? "var(--cyan-15)" : "transparent",
            color:
              activeTab === "quick" ? "var(--cyan)" : "var(--text-secondary)",
            borderBottom:
              activeTab === "quick"
                ? "2px solid var(--cyan)"
                : "2px solid transparent",
          }}
        >
          Quick Apply
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "external" ? (
        <ExternalApplyView
          job={job}
          submitting={submitting}
          error={error}
          onApply={onExternalApply}
          onCancel={onCancel}
        />
      ) : (
        <QuickApplyView
          form={form}
          setForm={setForm}
          submitting={submitting}
          error={error}
          onSubmit={onQuickApply}
          onCancel={onCancel}
          onFileChange={onFileChange}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form Field Wrapper
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: "var(--red)" }}>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

export default ApplyModal;
