/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse is a CommonJS module; keep it external so it runs as plain
  // Node on the server instead of being bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

module.exports = nextConfig;
