import { redirect } from "next/navigation";

export default function SalesReportsPage() {
    redirect("/dashboard/reports?tab=sales");
}
