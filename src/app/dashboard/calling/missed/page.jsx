import { redirect } from "next/navigation";

export default function MissedCallsPage() {
    redirect("/dashboard/calling/calls?tab=missed");
}
