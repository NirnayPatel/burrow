"use client";

import Script from "next/script";
import { useEffect } from "react";

type AnalyticsValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsValue | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: "config" | "event" | "js", target: string | Date, params?: AnalyticsParams) => void;
  }
}

// GA measurement IDs are public identifiers. The env override makes preview or
// future production streams possible without a code change.
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-LXXGPP3DYD";

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  const definedParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
  window.gtag("event", name, definedParams);
}

function cleanLabel(value: string | null) {
  if (!value) return undefined;

  // Click labels should describe controls, never capture free-form field values.
  const label = value.replace(/\s+/g, " ").trim().slice(0, 100);
  return label || undefined;
}

function sectionFor(element: Element) {
  const explicit = element.closest<HTMLElement>("[data-analytics-section]")?.dataset
    .analyticsSection;
  if (explicit) return explicit;
  if (element.closest("header")) return "header";
  if (element.closest("footer")) return "footer";
  if (element.closest("aside")) return "sidebar";
  if (element.closest("nav")) return "navigation";
  return "main";
}

function clickLabelFor(element: HTMLElement) {
  const explicit = element.dataset.analyticsLabel;
  const accessible = element.getAttribute("aria-label") ?? element.getAttribute("title");
  const containingLabel = element.closest("label")?.childNodes[0]?.textContent ?? null;
  const text = element.matches("a, button") ? element.textContent : null;
  return cleanLabel(explicit ?? accessible ?? containingLabel ?? text) ?? element.tagName.toLowerCase();
}

function AnalyticsClickTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;

      const element = event.target.closest<HTMLElement>(
        "a, button, input, select, textarea, [role='button'], [data-analytics-event]",
      );
      if (!element || element.closest("[data-analytics-ignore]")) return;

      const anchor = element.closest<HTMLAnchorElement>("a[href]");
      const destination = anchor ? new URL(anchor.href, window.location.href) : undefined;
      const isDemo = window.location.pathname.startsWith("/demo");
      const eventName = element.dataset.analyticsEvent ?? (isDemo ? "demo_click" : "marketing_click");

      trackEvent(eventName, {
        click_label: clickLabelFor(element),
        click_type: anchor ? "link" : element.tagName.toLowerCase(),
        page_path: window.location.pathname,
        page_section: sectionFor(element),
        demo_view: isDemo ? window.location.hash.slice(1) || "home" : undefined,
        link_domain: destination?.hostname,
        link_path: destination?.pathname,
        link_target: anchor?.target || "_self",
        outbound: destination ? destination.origin !== window.location.origin : undefined,
      });
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}

export function GoogleAnalytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            cookie_domain: 'auto',
            linker: { domains: ['nirnaypatel.com', 'burrow.nirnaypatel.com'] }
          });
        `}
      </Script>
      <AnalyticsClickTracker />
    </>
  );
}
