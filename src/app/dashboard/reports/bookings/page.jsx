import { redirect } from "next/navigation";

export default function BookingReportsPage() {
    redirect("/dashboard/reports?tab=bookings");
}
