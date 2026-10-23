import { useEffect, useRef, useState } from "react";

/**
 * "Sign in with Google" via Google Identity Services. Renders nothing unless the build
 * has VITE_GOOGLE_CLIENT_ID, so the button only appears once Google sign-in is set up
 * (the API also needs GOOGLE_CLIENT_IDS). GIS hands back an ID token ("credential"),
 * which the API verifies and exchanges for the app's own session.
 */
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export const googleSignInEnabled = Boolean(CLIENT_ID);

interface GoogleAccountsId {
  initialize(options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode?: "popup" }): void;
  renderButton(
    element: HTMLElement,
    options: { type?: "standard"; theme?: "outline" | "filled_blue"; size?: "large"; text?: string; shape?: "pill" | "rectangular"; width?: number },
  ): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not reach Google sign-in"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function GoogleSignInButton({
  onCredential,
  text = "continue_with",
}: {
  onCredential(credential: string): void;
  /** GIS button wording: "continue_with" | "signin_with" | "signup_with". */
  text?: "continue_with" | "signin_with" | "signup_with";
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        const id = window.google?.accounts?.id;
        if (cancelled || !id || !container.current) return;
        id.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
          callback: (response) => {
            if (response.credential) callback.current(response.credential);
          },
        });
        id.renderButton(container.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "pill",
          width: Math.min(400, container.current.clientWidth || 320),
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Google sign-in is unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!CLIENT_ID) return null;
  return (
    <div className="space-y-1">
      <div ref={container} className="flex min-h-[44px] w-full justify-center" />
      {error && <p className="text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
