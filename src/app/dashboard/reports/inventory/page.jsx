import { redirect } from "next/navigation";

export default function InventoryReportsPage() {
    redirect("/dashboard/reports?tab=inventory");
}
