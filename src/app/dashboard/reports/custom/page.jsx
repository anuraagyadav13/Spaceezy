import { redirect } from "next/navigation";

export default function CustomReportsPage() {
    redirect("/dashboard/reports?tab=custom");
}
