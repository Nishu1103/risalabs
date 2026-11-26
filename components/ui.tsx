"use client";
import clsx from "clsx";
import { X, Loader2 } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";

export function Card({ children, className, title, subtitle, action }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={clsx("rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const tones = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
export type Tone = keyof typeof tones;
export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

export const stageTone = (s: string): Tone =>
  s === "partner_confirmed" ? "emerald" : s === "lost" || s === "withdrawn" ? "rose" : s === "negotiating" || s === "proposal_sent" ? "amber" : "slate";
export const decisionTone = (d: string): Tone => (d === "Scale" ? "emerald" : d === "Kill" ? "rose" : d === "Pivot" ? "amber" : "slate");

export function Button({ variant = "secondary", size = "md", loading, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
        variant === "primary" && "bg-slate-900 text-white hover:bg-slate-800",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

const field = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={clsx(field, p.className)} />;
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={clsx(field, "pr-7", p.className)} />;
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={clsx(field, p.className)} />;
}
export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
      {children}
      {hint && <span className="ml-1 normal-case tracking-normal text-slate-400">{hint}</span>}
    </label>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
}

/** Header uses backdrop-blur, which traps position:fixed inside the bar. Portal to body. */
function useBodyPortal(open: boolean) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return open && mounted ? document.body : null;
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEscape(open, onClose);
  const host = useBodyPortal(open);
  if (!host) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={clsx("w-full rounded-xl border border-slate-200 bg-white shadow-xl", width)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    host,
  );
}

export function SlideOver({ open, onClose, title, children, width = "max-w-xl" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEscape(open, onClose);
  const host = useBodyPortal(open);
  if (!host) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 bg-slate-900/20" onMouseDown={onClose}>
      <aside className={clsx("absolute right-0 top-0 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl", width)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0 text-sm font-semibold text-slate-900">{title}</div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    host,
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">{children}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{(error as Error).message ?? String(error)}</div>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={clsx("whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx("whitespace-nowrap px-3 py-2.5 text-[13px] text-slate-700", className)}>{children}</td>;
}

export function SourceTag({ kind }: { kind: "sourced" | "assumption" | "app" | "derived" }) {
  const m = { sourced: ["Sourced", "slate"], assumption: ["Assumption", "violet"], app: ["User-logged", "sky"], derived: ["Derived", "indigo"] } as const;
  return <Badge tone={m[kind][1]}>{m[kind][0]}</Badge>;
}
