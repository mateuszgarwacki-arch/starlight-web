import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ICS calendar feed for a freelancer's confirmed bookings
// Subscribe URL: /api/calendar/{freelancerId}/route?pin={pin}
// Works with Google Calendar, Apple Calendar, Outlook, etc.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ freelancerId: string }> }
) {
  const { freelancerId } = await params;
  const fId = Number(freelancerId);
  if (!fId) return new NextResponse("Invalid freelancer ID", { status: 400 });

  // Simple PIN auth for calendar feed (no full session needed)
  const pin = request.nextUrl.searchParams.get("pin");
  if (!pin) return new NextResponse("PIN required", { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify PIN
  const { data: freelancer } = await supabase
    .from("tbl_freelancers")
    .select("freelancer_id, freelancer_name, pin")
    .eq("freelancer_id", fId)
    .single();

  if (!freelancer || freelancer.pin !== pin) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Fetch confirmed bookings (past 1 month + all future)
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const pastStr = oneMonthAgo.toISOString().split("T")[0];

  const { data: bookings } = await supabase
    .from("tbl_freelancer_schedule")
    .select("schedule_id, scheduled_date, status, job_id, notes, booking_group")
    .eq("freelancer_id", fId)
    .in("status", ["Confirmed", "Booked", "Notified"])
    .gte("scheduled_date", pastStr)
    .order("scheduled_date");

  // Get job names
  const jobIds = [...new Set((bookings || []).map((b: any) => b.job_id).filter(Boolean))];
  let jobMap: Record<number, string> = {};
  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from("tbl_production_plan")
      .select("job_id, job_name")
      .in("job_id", jobIds);
    (jobs || []).forEach((j: any) => { jobMap[j.job_id] = j.job_name; });
  }

  // Generate ICS
  const name = freelancer.freelancer_name || "Freelancer";
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  let ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Starlight Design//Workshop Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Starlight — ${name}`,
    "X-WR-TIMEZONE:Europe/London",
  ];

  (bookings || []).forEach((b: any) => {
    const jobName = b.job_id ? jobMap[b.job_id] || "Workshop" : "Workshop";
    const dateClean = b.scheduled_date.replace(/-/g, "");
    // End date is next day for all-day events
    const endDate = new Date(b.scheduled_date + "T00:00:00");
    endDate.setDate(endDate.getDate() + 1);
    const endClean = endDate.toISOString().split("T")[0].replace(/-/g, "");

    const statusText = b.status === "Confirmed" ? "CONFIRMED" : "TENTATIVE";

    ics.push("BEGIN:VEVENT");
    ics.push(`UID:starlight-${b.schedule_id}@starlightdesign.co.uk`);
    ics.push(`DTSTAMP:${now}`);
    ics.push(`DTSTART;VALUE=DATE:${dateClean}`);
    ics.push(`DTEND;VALUE=DATE:${endClean}`);
    ics.push(`SUMMARY:Starlight — ${jobName}`);
    ics.push(`STATUS:${statusText}`);
    if (b.notes) ics.push(`DESCRIPTION:${b.notes.replace(/\n/g, "\\n")}`);
    ics.push("END:VEVENT");
  });

  ics.push("END:VCALENDAR");

  return new NextResponse(ics.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="starlight-${fId}.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
