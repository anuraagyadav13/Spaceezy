// src/app/layout.jsx
import "./globals.css";
import QueryProvider from "../components/providers/QueryProvider";
import { ThemeProvider } from "../components/providers/ThemeProvider";
import { AuthProvider } from "../features/auth/providers/AuthProvider";
import ToastContainer from "../components/shared/ToastContainer";

export const metadata = {
  title: "Spaceezy CRM",
  description: "Owner and Employee CRM for Spaceezy real estate",
};

// Runs before the page paints so a dark-mode CRM user never sees a white flash.
// Dark mode is CRM-only, so the public site is always forced to light.
// Must stay in sync with THEME_STORAGE_KEY / DARK_BACKGROUND / isCrmRoute in
// components/providers/ThemeProvider.jsx.
const THEME_BOOTSTRAP = `(function(){try{var p=window.location.pathname;var crm=p.indexOf("/dashboard")===0||p.indexOf("/login")===0||p.indexOf("/forgot-password")===0;var k="spaceezy-theme";var s=localStorage.getItem(k);var d=crm&&(s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches));var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";r.style.backgroundColor=d?"#171b22":"";}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              {children}
              <ToastContainer />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
