"use client";
import { useState, useEffect, useRef, useCallback } from "react";

interface CommandItem {
  id: string;
  label: string;
  section: "recent" | "jobs" | "companies" | "actions";
  icon?: React.ReactNode;
  href?: string;
  onSelect?: () => void;
}

const defaultActions: CommandItem[] = [
  {
    id: "paste-url",
    label: "Paste job URL",
    section: "actions",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 2H5a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V5l-3-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    href: "/ghost-check",
  },
  {
    id: "salary-check",
    label: "Salary check",
    section: "actions",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 1v14M5 4h4.5a2.5 2.5 0 010 5H5M5 9h5a2.5 2.5 0 010 5H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    href: "/salary-check",
  },
  {
    id: "negotiate",
    label: "Start negotiation",
    section: "actions",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 12l2-2 3 3 7-7-2-2-5 5-3-3-4 4 2 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
    href: "/seeker/negotiate",
  },
  {
    id: "saved-jobs",
    label: "My saved jobs",
    section: "actions",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 2h10a1 1 0 011 1v11.5l-5-3-5 3V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
    href: "/seeker",
  },
];

const sectionLabels: Record<string, string> = {
  recent: "Recent",
  jobs: "Jobs",
  companies: "Companies",
  actions: "Actions",
};

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  items?: CommandItem[];
}

export function CommandPalette({
  open: controlledOpen,
  onOpenChange,
  items = [],
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = useCallback(
    (val: boolean) => {
      if (onOpenChange) {
        onOpenChange(val);
      } else {
        setInternalOpen(val);
      }
    },
    [onOpenChange]
  );

  // Merge items with default actions
  const allItems = [...items, ...defaultActions];

  // Filter by query
  const filtered = query.trim()
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  // Group by section
  const sections = ["recent", "jobs", "companies", "actions"] as const;
  const grouped = sections
    .map((section) => ({
      section,
      items: filtered.filter((item) => item.section === section),
    }))
    .filter((g) => g.items.length > 0);

  const flatItems = grouped.flatMap((g) => g.items);

  // Keyboard shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation within the palette
  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[selectedIndex];
      if (item) {
        selectItem(item);
      }
    }
  }

  // Keep selected item visible
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function selectItem(item: CommandItem) {
    if (item.onSelect) {
      item.onSelect();
    } else if (item.href) {
      window.location.href = item.href;
    }
    setIsOpen(false);
  }

  if (!isOpen) return null;

  let itemCounter = 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => setIsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(3, 5, 8, 0.8)" }}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl overflow-hidden animate-fade-up"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 25px 50px rgba(0, 0, 0, 0.5), var(--shadow-glow-cyan)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <svg
            className="w-5 h-5 shrink-0"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            style={{ color: "var(--text-muted)" }}
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search or type a command..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label="Command input"
            aria-activedescendant={
              flatItems[selectedIndex]
                ? `cmd-item-${flatItems[selectedIndex].id}`
                : undefined
            }
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-autocomplete="list"
          />
          <kbd
            className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: "var(--bg-void)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto py-2"
          id="cmd-list"
          role="listbox"
        >
          {grouped.length === 0 && (
            <div
              className="px-4 py-8 text-center text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              No results found.
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.section}>
              <div
                className="px-4 py-1.5 text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {sectionLabels[group.section]}
              </div>

              {group.items.map((item) => {
                const currentIdx = itemCounter++;
                const isSelected = currentIdx === selectedIndex;

                return (
                  <button
                    key={item.id}
                    id={`cmd-item-${item.id}`}
                    type="button"
                    data-index={currentIdx}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--cyan)]"
                    style={{
                      backgroundColor: isSelected ? "var(--cyan-08)" : "transparent",
                      color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setSelectedIndex(currentIdx)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {item.icon && (
                      <span
                        className="shrink-0"
                        style={{
                          color: isSelected ? "var(--cyan)" : "var(--text-muted)",
                        }}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                    {isSelected && (
                      <kbd
                        className="text-[10px] font-mono px-1 py-0.5 rounded shrink-0"
                        style={{
                          backgroundColor: "var(--bg-void)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        {"\u21B5"}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-[10px]"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <span className="inline-flex items-center gap-1">
            <kbd
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--bg-void)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {"\u2191"}
            </kbd>
            <kbd
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--bg-void)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {"\u2193"}
            </kbd>
            Navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--bg-void)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {"\u21B5"}
            </kbd>
            Select
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd
              className="font-mono px-1 py-0.5 rounded"
              style={{
                backgroundColor: "var(--bg-void)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              ESC
            </kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
