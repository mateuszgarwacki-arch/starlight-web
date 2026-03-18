/** @type {import('next').NextConfig} */
const nextConfig = {
  // Supabase image domains (for photo storage later)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
