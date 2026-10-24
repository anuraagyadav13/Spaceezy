import { redirect } from "next/navigation";

export default function LeadReportsPage() {
    redirect("/dashboard/reports?tab=leads");
}
