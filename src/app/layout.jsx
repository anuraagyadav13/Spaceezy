// src/app/layout.jsx
import "./globals.css";

export const metadata = {
  title: "SpaceEzy CRM",
  description: "Owner and Employee CRM for SpaceEzy real estate",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}