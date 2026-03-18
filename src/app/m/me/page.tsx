"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { LogOut, User } from "lucide-react";

export default function MobileProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setName(user.user_metadata?.name || "Unknown");
        setRole(user.user_metadata?.role || "freelancer");
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/m/login");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-navy">Profile</h1>

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
