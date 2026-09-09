import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Creative requests can carry a reference picture as a data URL. The
      // browser downscales it first, but base64 still inflates by a third and
      // the 1MB default would reject perfectly reasonable photos.
      bodySizeLimit: "4mb",
    },
  },

  async headers() {
    return [
      {
        // The sky panorama. Files under public/ are served no-cache by
        // default, because Next has no way to know whether one has changed —
        // which for a background image means every visit spends a round trip
        // revalidating a file that is, by construction, never going to change:
        // the filename carries a version and a new render gets a new one.
        source: "/sky/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
