import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@music-room/shared'],
  webpack(config) {
    config.resolve.alias['@'] = frontendRoot;
    return config;
  }
};

export default nextConfig;
