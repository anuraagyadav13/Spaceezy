// src/app/layout.jsx
import "./globals.css";
import QueryProvider from "../components/providers/QueryProvider";
import { AuthProvider } from "../features/auth/providers/AuthProvider";
import ToastContainer from "../components/shared/ToastContainer";

export const metadata = {
  title: "SpaceEzy CRM",
  description: "Owner and Employee CRM for SpaceEzy real estate",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>
            {children}
            <ToastContainer />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}