import { redirect } from "next/navigation";

export default function CallHistoryPage() {
    redirect("/dashboard/calling/calls?tab=history");
}
