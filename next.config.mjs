/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
