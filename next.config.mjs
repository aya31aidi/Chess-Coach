/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No next/image in this app, so the optimizer endpoint stays off entirely.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // The engine files never change for a given Stockfish version.
        source: '/engine/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
