"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Settings, Save, Check } from "lucide-react";

interface RateCard {
  id: number;
  complexity: number;
  label: string;
  rate_per_hour: number;
  description: string | null;
}

interface BusinessSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  description: string | null;
}

export default function SettingsPage() {
  const supabase = createClient();
  const [rates, setRates] = useState<RateCard[]>([]);
  const [settings, setSettings] = useState<BusinessSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [rateRes, settRes] = await Promise.all([
        supabase.from("tbl_rate_card").select("*").order("complexity"),
        supabase.from("tbl_business_settings").select("*").order("setting_key"),
      ]);
      if (rateRes.data) setRates(rateRes.data);
      if (settRes.data) setSettings(settRes.data);
      setLoading(false);
    };
    load();
  }, []);

  const updateRate = async (id: number, value: number) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, rate_per_hour: value } : r));
    await supabase.from("tbl_rate_card").update({ rate_per_hour: value }).eq("id", id);
    flash("Rate saved");
  };

  const updateSetting = async (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.setting_key === key ? { ...s, setting_value: value } : s));
    await supabase.from("tbl_business_settings").upsert({ setting_key: key, setting_value: value }, { onConflict: "setting_key" });
    flash("Setting saved");
  };

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
  };

  const getSetting = (key: string) => settings.find(s => s.setting_key === key)?.setting_value || "";

  if (loading) return <div className="p-8 text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-3xl mx-auto p-8">
      {/* Save indicator */}
      {saved && (
        <div className="fixed top-4 right-4 bg-starlight-green text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg z-50 text-sm">
          <Check className="h-4 w-4" /> {saved}
        </div>
      )}

      <div className="flex items-center gap-3 mb-8">
        <Settings className="h-6 w-6 text-gray-400" />
        <h1 className="text-xl font-bold text-navy">Settings</h1>
      </div>

      {/* Rate Card */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Standard rate card
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Hourly rates by complexity level, used for estimated costs on work orders. These are your standard costing rates, not individual freelancer rates.
        </p>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Complexity</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium w-40">Rate per hour</th>
              </tr>
            </thead>
            <tbody>
              {rates.map(rate => (
                <tr key={rate.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-2 font-semibold ${
                      rate.complexity === 1 ? "text-starlight-green" :
                      rate.complexity === 2 ? "text-starlight-blue" :
                      "text-starlight-red"
                    }`}>
                      <span className="text-lg">{rate.complexity}</span>
                      <span className="text-xs font-normal text-gray-500">{rate.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <input
                      type="text"
                      defaultValue={rate.description || ""}
                      onBlur={async (e) => {
                        const val = e.target.value.trim();
                        await supabase.from("tbl_rate_card").update({ description: val || null }).eq("id", rate.id);
                        flash("Description saved");
                      }}
                      className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-starlight-blue focus:outline-none rounded px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">£</span>
                      <input
                        type="number"
                        step="0.50"
                        value={rate.rate_per_hour}
                        onChange={(e) => setRates(prev => prev.map(r => r.id === rate.id ? { ...r, rate_per_hour: parseFloat(e.target.value) || 0 } : r))}
                        onBlur={(e) => updateRate(rate.id, parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1 text-right font-mono border border-gray-200 hover:border-gray-300 focus:border-starlight-blue focus:outline-none rounded bg-white"
                      />
                      <span className="text-xs text-gray-400">/hr</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Business defaults */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Business defaults
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
          {/* Target margin */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Default target margin</p>
              <p className="text-xs text-gray-400 mt-0.5">Applied to new jobs. Override per job on the job page.</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={getSetting("default_target_margin_pct") || "40"}
                onChange={(e) => setSettings(prev => prev.map(s => s.setting_key === "default_target_margin_pct" ? { ...s, setting_value: e.target.value } : s))}
                onBlur={(e) => updateSetting("default_target_margin_pct", e.target.value || "40")}
                className="w-20 px-2 py-1.5 text-right font-mono border border-gray-200 hover:border-gray-300 focus:border-starlight-blue focus:outline-none rounded"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </div>

          {/* Standard day hours */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-5">
            <div>
              <p className="text-sm font-medium text-gray-700">Standard day hours</p>
              <p className="text-xs text-gray-400 mt-0.5">Default working hours per day for capacity calculations.</p>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.5"
                min="1"
                max="16"
                value={getSetting("standard_day_hours") || "10"}
                onChange={(e) => setSettings(prev => prev.map(s => s.setting_key === "standard_day_hours" ? { ...s, setting_value: e.target.value } : s))}
                onBlur={(e) => updateSetting("standard_day_hours", e.target.value || "10")}
                className="w-20 px-2 py-1.5 text-right font-mono border border-gray-200 hover:border-gray-300 focus:border-starlight-blue focus:outline-none rounded"
              />
              <span className="text-sm text-gray-400">hrs</span>
            </div>
          </div>
        </div>
      </section>

      {/* Info note */}
      <div className="text-xs text-gray-400 mt-8 leading-relaxed">
        Rate card rates are used for estimated costs on work orders. Actual costs use the freelancer&apos;s personal rate (day_rate / standard_day_hours) captured at task completion, or the WO rate override if set.
      </div>
    </div>
  );
}
