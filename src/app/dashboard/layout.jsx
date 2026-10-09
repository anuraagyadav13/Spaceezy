import DashboardShell from "./DashboardShell";

// Private CRM area — never index it.
export const metadata = {
    robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }) {
    return <DashboardShell>{children}</DashboardShell>;
}
