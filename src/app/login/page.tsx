"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Star } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-starlight-amber/10 mb-4">
            <Star className="h-7 w-7 text-starlight-amber" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">
            STARLIGHT
          </h1>
          <p className="text-white/40 text-sm mt-1">Production System</p>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleLogin}
          className="bg-surface rounded-xl p-6 shadow-2xl space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue focus:border-transparent"
              placeholder="mateusz@starlightdesign.co.uk"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue focus:border-transparent"
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-starlight-red bg-starlight-red/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-8">
          Starlight Design &middot; Internal System
        </p>
      </div>
    </div>
  );
}
