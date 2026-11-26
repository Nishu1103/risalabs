import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A package-lock.json in the parent directory makes Next infer the wrong
  // tracing root, which can drop data/*.xlsx from the Vercel serverless bundle.
  outputFileTracingRoot: path.resolve(process.cwd()),
  // The reset endpoint re-reads the original xlsx at runtime — make sure Vercel bundles it.
  outputFileTracingIncludes: {
    "/api/reset": ["./data/**/*"],
  },
  serverExternalPackages: ["exceljs", "pg"],
};

export default nextConfig;
