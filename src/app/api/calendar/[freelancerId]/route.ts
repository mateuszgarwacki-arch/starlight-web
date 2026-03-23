import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ICS download for a freelancer's bookings
// Full schedule: /api/calendar/{id}?pin={pin}
// Single booking group: /api/calendar/{id}?pin={pin}&group={uuid}

function icsDateClean(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}
function icsNextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ freelancerId: string }> }
) {
  const { freelancerId } = await params;
  const fId = Number(freelancerId);
  if (!fId) return new NextResponse("Invalid ID", { status: 400 });

  const pin = request.nextUrl.searchParams.get("pin");
  const groupFilter = request.nextUrl.searchParams.get("group");
  if (!pin) return new NextResponse("PIN required", { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: freelancer } = await supabase
    .from("tbl_freelancers")
    .select("freelancer_id, freelancer_name, pin")
    .eq("freelancer_id", fId)
    .single();
  if (!freelancer || freelancer.pin !== pin) return new NextResponse("Unauthorized", { status: 401 });

  // Build query
  let query = supabase
    .from("tbl_freelancer_schedule")
    .select("schedule_id, scheduled_date, status, job_id, notes, booking_group")
    .eq("freelancer_id", fId)
    .in("status", ["Confirmed", "Booked", "Notified"])
    .order("scheduled_date");

  if (groupFilter) {
    query = query.eq("booking_group", groupFilter);
  } else {
    // Full schedule — future only
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    query = query.gte("scheduled_date", todayStr);
  }

  const { data: bookings } = await query;

  // Get job names
  const jobIds = [...new Set((bookings || []).map((b: any) => b.job_id).filter(Boolean))];
  let jobMap: Record<number, string> = {};
  if (jobIds.length > 0) {
    const { data: jobs } = await supabase.from("tbl_production_plan").select("job_id, job_name").in("job_id", jobIds);
    (jobs || []).forEach((j: any) => { jobMap[j.job_id] = j.job_name; });
  }

  const name = freelancer.freelancer_name || "Freelancer";
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Starlight Design//Workshop//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Starlight — ${name}`,
    "X-WR-TIMEZONE:Europe/London",
  ];

  (bookings || []).forEach((b: any) => {
    const jobName = b.job_id ? jobMap[b.job_id] || "Workshop" : "Workshop";
    const statusText = b.status === "Confirmed" ? "CONFIRMED" : "TENTATIVE";
    ics.push("BEGIN:VEVENT");
    ics.push(`UID:starlight-${b.schedule_id}@starlightdesign.co.uk`);
    ics.push(`DTSTAMP:${now}`);
    ics.push(`DTSTART;VALUE=DATE:${icsDateClean(b.scheduled_date)}`);
    ics.push(`DTEND;VALUE=DATE:${icsNextDay(b.scheduled_date)}`);
    ics.push(`SUMMARY:Starlight — ${jobName}`);
    ics.push(`STATUS:${statusText}`);
    if (b.notes) ics.push(`DESCRIPTION:${b.notes.replace(/\n/g, "\\n")}`);
    ics.push("END:VEVENT");
  });
  ics.push("END:VCALENDAR");

  // Build filename
  const safeName = (name || "freelancer").replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
  let filename: string;
  if (groupFilter && bookings && bookings.length > 0) {
    const firstBooking = bookings[0];
    const jobName = firstBooking.job_id && jobMap[firstBooking.job_id] ? jobMap[firstBooking.job_id] : "Workshop";
    const safeJob = jobName.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
    const startDate = firstBooking.scheduled_date;
    filename = `Starlight-${safeJob}-${safeName}-${startDate}.ics`;
  } else {
    filename = `Starlight-Schedule-${safeName}.ics`;
  }

  return new NextResponse(ics.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache, no-store",
    },
  });
}
