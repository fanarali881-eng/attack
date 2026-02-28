2. ملف next.config.js

إعدادات Next.js للسماح باستخدام مكتبات النظام.

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['ssh2'],
  },
}

module.exports = nextConfig