import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Wordmark from "../brand/Wordmark";

/** Placeholder until the public domain is chosen; one place to change it. */
export const CONTACT_EMAIL = "privacy@YOURDOMAIN";

/** Links every signed-out page and Settings show: the policies and account deletion. */
export const LEGAL_LINKS: { to: string; label: string }[] = [
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/third-party-licenses", label: "Licences" },
  { to: "/delete-account", label: "Delete account" },
];

export function LegalLinks({ className = "", align = "center" }: { className?: string; align?: "center" | "start" }) {
  return (
    <nav aria-label="Policies" className={`flex flex-wrap ${align === "start" ? "justify-start" : "justify-center"} gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 ${className}`}>
      {LEGAL_LINKS.map((link) => (
        <Link key={link.to} to={link.to} className="underline hover:text-slate-800 dark:hover:text-slate-200">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Pages that work signed in or out (policies, account deletion, password reset):
 * no app shell, just the name, the content and the policy links.
 */
export default function PublicPageLayout({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className={`mx-auto flex ${wide ? "max-w-4xl" : "max-w-3xl"} items-center px-4 py-3`}>
          <Link to="/" aria-label="Midivory home">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main id="main-content" className={`mx-auto w-full ${wide ? "max-w-4xl" : "max-w-3xl"} px-4 pb-16 pt-8`}>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        <div className="mt-6">{children}</div>
      </main>
      <footer className="border-t border-slate-200 py-6 dark:border-slate-800">
        <LegalLinks />
      </footer>
    </div>
  );
}

/** Long-form policy text: readable measure, spaced headings, real lists. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 [&_a]:text-felt-700 [&_a]:underline dark:[&_a]:text-felt-300 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      {children}
    </div>
  );
}
