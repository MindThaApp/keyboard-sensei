import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { GlassSurface } from "./GlassSurface";
import "./ui.css";

export type ToastTone = "reward" | "info" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  tone?: ToastTone;
  title: string;
  body?: ReactNode;
  action?: ToastAction;
  onDismiss: () => void;
  /** Milliseconds before it hides itself; the timer pauses on hover and focus. 0 disables it. */
  duration?: number;
  className?: string;
}

const ICONS: Record<ToastTone, string> = { reward: "★", info: "i", error: "!" };
const SWIPE_DISMISS_PX = 64;

/** Glass capsule notification. Swipe sideways or press the close button to dismiss. */
export function Toast({ tone = "info", title, body, action, onDismiss, duration = 4000, className }: ToastProps) {
  const [paused, setPaused] = useState(false);
  const [dx, setDx] = useState(0);
  const dragStart = useRef<number | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (paused || duration <= 0) return;
    const id = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(id);
  }, [paused, duration]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragStart.current = event.clientX;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current !== null) setDx(event.clientX - dragStart.current);
  };
  const endDrag = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (Math.abs(dx) >= SWIPE_DISMISS_PX) dismissRef.current();
    else setDx(0);
  };

  return (
    <GlassSurface
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      data-tone={tone}
      className={cx("ks-toast", className)}
      style={dx ? { transform: `translateX(${dx}px)`, opacity: 1 - Math.min(0.6, Math.abs(dx) / 240) } : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="ks-toast__icon" aria-hidden="true">
        {ICONS[tone]}
      </span>
      <span className="ks-toast__text">
        <span className="ks-toast__title">{title}</span>
        {body && <span className="ks-toast__body">{body}</span>}
      </span>
      {action && (
        <Button
          variant="plain"
          size="sm"
          className="ks-toast__action"
          onClick={() => {
            action.onClick();
            onDismiss();
          }}
        >
          {action.label}
        </Button>
      )}
      <button type="button" className="ks-toast__close" aria-label="Dismiss notification" onClick={onDismiss}>
        <span aria-hidden="true">{"✕"}</span>
      </button>
    </GlassSurface>
  );
}

interface ToastEntry extends Omit<ToastProps, "onDismiss"> {
  id: number;
}

interface ToastApi {
  show: (toast: Omit<ToastProps, "onDismiss">) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Hosts toasts above the tab bar. Mount once near the app root, then call `useToast().show(...)`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((toast: Omit<ToastProps, "onDismiss">) => {
    const id = nextId.current++;
    // Keep at most two on screen (each is a blurred layer): the oldest makes room.
    setToasts((list) => [...list.slice(-1), { ...toast, id }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ks-toast-viewport">
        {toasts.map(({ id, ...toast }) => (
          <Toast key={id} {...toast} onDismiss={() => dismiss(id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside a ToastProvider");
  return api;
}
