// src/app/layout.jsx
import "./globals.css";
import Script from "next/script";
import QueryProvider from "../components/providers/QueryProvider";
import { ThemeProvider } from "../components/providers/ThemeProvider";
import { AuthProvider } from "../features/auth/providers/AuthProvider";
import ToastContainer from "../components/shared/ToastContainer";

export const metadata = {
  title: "Spaceezy CRM",
  description: "Owner and Employee CRM for Spaceezy real estate",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Theme bootstrap: applies .dark/.crm before first paint so a dark-mode
            CRM user never sees a white flash. It lives in public/theme-bootstrap.js
            and loads via beforeInteractive, which injects a real <script> into
            <head> of the server HTML. An inline <script> here earlier triggered
            React 19's "Encountered a script tag while rendering React component"
            warning (React never executes scripts it renders on the client). */}
        <Script
          id="theme-bootstrap"
          src="/theme-bootstrap.js"
          strategy="beforeInteractive"
        />
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
