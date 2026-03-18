"use client";

import { Camera } from "lucide-react";

export default function MobilePhotosPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-navy">Site Photos</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <Camera className="h-10 w-10 text-gray-300 mx-auto" />
        <p className="text-sm text-gray-400 mt-3">
          Workshop Complete items awaiting site photos will appear here.
        </p>
        <p className="text-xs text-gray-300 mt-1">Coming soon</p>
      </div>
    </div>
  );
}
