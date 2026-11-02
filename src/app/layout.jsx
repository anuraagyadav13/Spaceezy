// src/app/layout.jsx
import "./globals.css";
import QueryProvider from "../components/providers/QueryProvider";
import { AuthProvider } from "../features/auth/providers/AuthProvider";
import ToastContainer from "../components/shared/ToastContainer";

export const metadata = {
  title: "Spaceezy CRM",
  description: "Owner and Employee CRM for Spaceezy real estate",
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