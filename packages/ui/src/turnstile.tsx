"use client";

import * as React from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | undefined;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Failed to load the security check"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };

export type TurnstileProps = {
  /** NEXT_PUBLIC_TURNSTILE_SITE_KEY; when empty the widget renders nothing. */
  siteKey: string | undefined;
  onToken: (token: string | undefined) => void;
  action?: string;
  className?: string;
};

/** Cloudflare Turnstile bot check. Calls onToken with a fresh token, or undefined when it expires. */
export const Turnstile = React.forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { siteKey, onToken, action, className },
  ref,
) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const widgetId = React.useRef<string | undefined>(undefined);
  const onTokenRef = React.useRef(onToken);
  onTokenRef.current = onToken;
  const [failed, setFailed] = React.useState(false);

  React.useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(undefined);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    },
  }));

  React.useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(undefined),
          "error-callback": () => onTokenRef.current(undefined),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [siteKey, action]);

  if (!siteKey) return null;
  return (
    <div className={className}>
      <div ref={containerRef} />
      {failed ? <p className="mt-2 text-xs text-red-600">Security check could not load. Check your connection and refresh.</p> : null}
    </div>
  );
});
