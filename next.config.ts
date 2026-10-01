import type { NextConfig } from 'next';

/**
 * Set `NEXT_SKIP_TYPECHECK=1` to skip Next's own type check during a build.
 *
 * Next runs its type checker in a *child process*, which some restricted
 * environments (including this project's sandboxed build) refuse to spawn.
 * Production builds — Vercel included — run the check, and `npm run typecheck`
 * (`tsc --noEmit`) is the type gate everywhere.
 */
const skipTypecheck = process.env.NEXT_SKIP_TYPECHECK === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: skipTypecheck },
  experimental: {
    // Render pages with worker threads: fewer processes, friendlier to
    // sandboxes and CI containers, no behavioural difference in the output.
    workerThreads: true,
  },
  turbopack: {
    // Keeps Turbopack from walking up to unrelated workspace files outside the
    // project (it otherwise warns about a pnpm-workspace.yaml in the home dir).
    root: process.cwd(),
  },
  // The engine ships as plain static assets in /public/engine so that the
  // Web Worker can load them without any bundler involvement.
  async headers() {
    return [
      {
        source: '/engine/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        // Single-threaded WASM builds need no SharedArrayBuffer, but keeping
        // the isolation headers available makes it possible to swap in a
        // multi-threaded build later without touching the deployment.
        source: '/engine-mt/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
