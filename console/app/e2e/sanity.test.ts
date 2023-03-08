import path from "node:path";

import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import { ElectronApplication } from "playwright-core";

import { pause } from "./ electronHelpers.js";

let electronApp: ElectronApplication;

test.beforeAll(async () => {
  // Launch Electron app.
  electronApp = await electron.launch({
    args: [
      path.join(
        __dirname,
        "..",
        "dist",
        "vite",
        "electron",
        "main",
        "index.js",
      ),
    ],
  });
  electronApp
    ?.process()
    ?.stdout?.on("data", (data) => console.log(`stdout: ${data}`));
  electronApp
    ?.process()
    ?.stderr?.on("data", (error) => console.log(`stderr: ${error}`));
});

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.snapshotSuffix = "";
});

test("show app", async () => {
  // Evaluation expression in the Electron context.
  const appPath = await electronApp.evaluate(async ({ app }) => {
    return app.getAppPath();
  });
  console.log(appPath);
  // Get the first window that the app opens, wait if necessary.
  const window = await electronApp.firstWindow();
  window.on("console", console.log);

  const vsCodeLayout = await window.getByTestId("vscode-layout");
  expect(vsCodeLayout).toBeTruthy();
});

test("no loader", async () => {
  // Get the first window that the app opens, wait if necessary.
  const window = await electronApp.firstWindow();
  window.on("console", console.log);

  await pause(3000);

  const loader = await window.getByTestId("main-view-loader");

  await expect(loader).toBeHidden({ timeout: 10_000 });
});

test("tree menu", async () => {
  // Get the first window that the app opens, wait if necessary.
  const window = await electronApp.firstWindow();
  window.on("console", console.log);
  await window.setViewportSize({ width: 1920, height: 1080 });

  await pause(3000);

  const treeMenu = await window.getByTestId("tree-menu");
  expect(await treeMenu.screenshot()).toMatchSnapshot("tree-menu.png", {
    maxDiffPixelRatio: 0.3,
  });
});

test("map view", async () => {
  // Get the first window that the app opens, wait if necessary.
  const window = await electronApp.firstWindow();
  window.on("console", console.log);
  await window.setViewportSize({ width: 1920, height: 1080 });

  await pause(3000);

  const mapView = await window.getByTestId("map-view");
  expect(await mapView.screenshot()).toMatchSnapshot("map-view.png", {
    maxDiffPixelRatio: 0.3,
  });
});

test.afterAll(async () => {
  await electronApp.close();
});
