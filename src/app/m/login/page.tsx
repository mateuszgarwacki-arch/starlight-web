"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Star } from "lucide-react";

export default function MobileLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const email = phone.replace(/\s+/g, "") + "@starlight.local";
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });

    if (error) {
      setError("Invalid phone number or PIN");
      setLoading(false);
    } else {
      router.push("/m");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-starlight-amber/10 mb-4">
            <Star className="h-7 w-7 text-starlight-amber" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">STARLIGHT</h1>
          <p className="text-white/40 text-sm mt-1">Workshop</p>
        </div>

        <div className="bg-surface rounded-2xl p-6 shadow-2xl space-y-5" >
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 border border-subtle rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              placeholder="07712 345 678"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-4 py-3 border border-subtle rounded-xl text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-starlight-blue"
              placeholder="* * * * * *"
              inputMode="numeric"
              maxLength={6}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-starlight-red bg-starlight-red/10 rounded-xl px-4 py-2.5 text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !phone.trim() || !pin.trim()}
            className="w-full py-3.5 bg-starlight-red text-white text-base font-semibold rounded-xl hover:bg-starlight-red active:bg-starlight-red transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Clock In"}
          </button>
        </div>

        <p className="text-center text-white/20 text-xs mt-8">
          Starlight Design
        </p>
      </div>
    </div>
  );
}
