import { redirect } from "next/navigation";

export default function SiteVisitReportsPage() {
    redirect("/dashboard/reports?tab=site-visits");
}
