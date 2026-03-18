"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { LogOut, User, Calendar, Check, X, MapPin } from "lucide-react";

interface MyBooking {
  schedule_id: number;
  scheduled_date: string;
  status: string;
  job_id: number | null;
  notes: string | null;
  job_name?: string;
  job_number?: string;
}

export default function MobileProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [myId, setMyId] = useState(0);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/m/login"); return; }

    const fId = user.user_metadata?.freelancer_id || 0;
    setMyId(fId);
    setName(user.user_metadata?.name || "Unknown");
    setRole(user.user_metadata?.role || "freelancer");

    // Load upcoming bookings (today + future)
    const today = new Date().toISOString().split("T")[0];
    const { data: schedData } = await supabase
      .from("tbl_freelancer_schedule")
      .select("schedule_id, scheduled_date, status, job_id, notes")
      .eq("freelancer_id", fId)
      .gte("scheduled_date", today)
      .order("scheduled_date");

    if (schedData && schedData.length > 0) {
      // Enrich with job names
      const jobIds = [...new Set(schedData.map(s => s.job_id).filter(Boolean))];
      let jobMap: Record<number, { name: string; number: string }> = {};
      if (jobIds.length > 0) {
        const { data: jobs } = await supabase
          .from("tbl_production_plan")
          .select("job_id, job_name, job_number")
          .in("job_id", jobIds);
        (jobs || []).forEach((j: any) => { jobMap[j.job_id] = { name: j.job_name, number: j.job_number }; });
      }
      setBookings(schedData.map(s => ({
        ...s,
        job_name: s.job_id ? jobMap[s.job_id]?.name : undefined,
        job_number: s.job_id ? jobMap[s.job_id]?.number : undefined,
      })));
    } else {
      setBookings([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadProfile(); }, []);

  const respondToBooking = async (scheduleId: number, response: "Confirmed" | "Declined") => {
    await supabase.from("tbl_freelancer_schedule")
      .update({ status: response })
      .eq("schedule_id", scheduleId);
    setBookings(prev => prev.map(b =>
      b.schedule_id === scheduleId ? { ...b, status: response } : b
    ));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/m/login");
  };

  const formatDay = (d: string) => {
    const date = new Date(d);
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    if (d === today) return "Today";
    if (d === tomorrow) return "Tomorrow";
    return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-gray-400 text-sm animate-pulse">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-navy/10 flex items-center justify-center">
            <User className="h-7 w-7 text-navy" />
          </div>
          <div>
            <p className="text-lg font-semibold text-navy">{name}</p>
            <p className="text-sm text-gray-400 capitalize">{role.replace("_", " ")}</p>
          </div>
        </div>
      </div>

      {/* Upcoming bookings */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-5 w-5 text-navy" />
          <h2 className="text-base font-semibold text-navy">Upcoming Schedule</h2>
        </div>

        {bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">No upcoming bookings</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.schedule_id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy">{formatDay(b.scheduled_date)}</p>
                    {b.job_name && (
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {b.job_number} — {b.job_name}
                      </p>
                    )}
                    {!b.job_name && (
                      <p className="text-xs text-gray-400 mt-0.5">General workshop</p>
                    )}
                    {b.notes && (
                      <p className="text-xs text-gray-400 mt-1 italic">{b.notes}</p>
                    )}
                  </div>

                  <div>
                    {b.status === "Booked" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => respondToBooking(b.schedule_id, "Confirmed")}
                          className="w-9 h-9 rounded-full bg-starlight-green text-white flex items-center justify-center active:bg-green-700"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => respondToBooking(b.schedule_id, "Declined")}
                          className="w-9 h-9 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center active:bg-gray-300"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <span className={"text-xs font-medium px-2.5 py-1 rounded-full " + (
                        b.status === "Confirmed" ? "bg-starlight-green/10 text-starlight-green" :
                        b.status === "Declined" ? "bg-starlight-red/10 text-starlight-red" :
                        "bg-gray-100 text-gray-500"
                      )}>
                        {b.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={handleLogout}
        className="w-full py-3.5 bg-white border border-gray-200 text-starlight-red text-sm font-medium rounded-xl flex items-center justify-center gap-2 active:bg-red-50 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </button>
    </div>
  );
}
