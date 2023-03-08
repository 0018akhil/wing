import { config } from "dotenv";
import esbuild from "esbuild";

config();

export interface RunEsbuildOptions {
  port?: number;
  watch?: esbuild.WatchMode;
  minify?: boolean;
}

export const runEsbuild = ({ port, watch, minify }: RunEsbuildOptions) => {
  return esbuild.build({
    entryPoints: ["electron/main/index.ts"],
    outdir: "dist/vite/electron/main",
    target: "node16.17.1",
    platform: "node",
    format: "cjs",
    bundle: true,
    external: ["electron", "fsevents", "esbuild-wasm"],
    define: {
      "import.meta.env": JSON.stringify({
        BASE_URL: port ? `http://localhost:${port}` : "",
        MODE: watch ? "development" : "production",
        DEV: watch !== undefined,
        PROD: watch === undefined,
        SSR: false,
      }),
      "process.env.SEGMENT_WRITE_KEY": JSON.stringify(
        process.env.SEGMENT_WRITE_KEY || "",
      ),
    },
    logLevel: "info",
    watch,
    minify,
  });
};
