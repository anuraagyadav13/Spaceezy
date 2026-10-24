import { redirect } from "next/navigation";

export default function CallRecordingsPage() {
    redirect("/dashboard/calling/calls?tab=recordings");
}
