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
};

export default nextConfig;
