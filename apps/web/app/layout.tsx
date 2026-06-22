import type { Metadata } from "next";
import "./tokens.css";
import "./globals.css";
import "./tour.css";
import { ToastProvider } from "../components/toast";

export const metadata: Metadata = {
  title: "Burrow",
  description:
    "Open-source workspace: multiplayer specs, AI breakdowns, agent bridge.",
};

// Set data-theme before first paint so a saved Light/Dark choice never flashes
// the system default (no FOUC). "system" leaves the attribute off so tokens.css
// falls back to prefers-color-scheme.
const themeScript = `(function(){try{var t=localStorage.getItem('burrow-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
