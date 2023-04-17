import * as vite from "vite";

import { copyVm2Files, createEsbuildContext } from "./helpers/index.mjs";

console.log("Compiling the renderer files...");
await vite.build();

console.log("Compiling the electron main process...");
const esbuild = await createEsbuildContext({
  minify: true,
  define: {
    "process.env.PROD": "true",
    "import.meta.env": JSON.stringify({
      BASE_URL: "",
      MODE: "production",
      DEV: false,
      PROD: true,
      SSR: false,
    }),
    "process.env.SEGMENT_WRITE_KEY": JSON.stringify(
      process.env.SEGMENT_WRITE_KEY || "",
    ),
  },
});
await esbuild.rebuild();
await esbuild.dispose();

console.log("Copying vm2 files...");
await copyVm2Files();

console.log("Done");
