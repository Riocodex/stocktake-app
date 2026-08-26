/**
 * Dev-only screenshot harness. Drives a headless Chrome over the DevTools
 * protocol so authenticated app pages can be captured full-page at a real
 * desktop viewport.
 *
 * Usage: node scripts/shots.mjs <outDir> <email> <password>
 * Set ORIGIN if the dev server is not on the default port.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const PORT = 9333;

const [outDir = "/tmp/tribe-shots/app", email, password] = process.argv.slice(2);

const PUBLIC_PAGES = [
  ["site-home", "/"],
  ["site-events", "/events"],
  ["site-shop", "/shop"],
];

const APP_PAGES = [
  ["app-dashboard", "/app"],
  ["app-inventory", "/app/inventory"],
  ["app-stock-takes", "/app/stock-takes"],
  ["app-outlets", "/app/outlets"],
  ["app-team", "/app/team"],
];

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  const events = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  return { send, events, close: () => ws.close() };
}

/** Waits for the network to settle, since Next streams and hydrates. */
async function settle(send, ms = 1200) {
  await sleep(ms);
  for (let i = 0; i < 40; i++) {
    const { result } = await send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.value === "complete") break;
    await sleep(150);
  }
  await sleep(600);
}

async function capture(send, name, path) {
  await send("Page.navigate", { url: `${ORIGIN}${path}` });
  await settle(send);

  // Scroll through the page so lazy reveal animations and images resolve.
  await send("Runtime.evaluate", {
    expression: `(async () => {
      // Half-viewport steps with a generous pause, so IntersectionObserver
      // reveals actually fire before the page is captured.
      const step = window.innerHeight / 2;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 260));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 900));
    })()`,
    awaitPromise: true,
  });

  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    optimizeForSpeed: false,
  });
  await writeFile(`${outDir}/${name}.png`, Buffer.from(data, "base64"));

  // Viewport-only shot too, so dense pages stay legible when reviewed.
  const { data: top } = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(`${outDir}/${name}-top.png`, Buffer.from(top, "base64"));
  const { result } = await send("Runtime.evaluate", {
    expression: "location.pathname",
    returnByValue: true,
  });
  console.log(`  ${name}.png  (landed on ${result.value})`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--remote-allow-origins=*",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1440,1000",
    "--user-data-dir=/tmp/tribe-chrome-profile",
    "about:blank",
  ]);
  chrome.stderr.on("data", () => {});

  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      break;
    } catch {
      await sleep(250);
    }
  }

  const { send, close } = await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log("Public pages:");
  for (const [name, path] of PUBLIC_PAGES) await capture(send, name, path);

  if (email && password) {
    console.log(`Signing in as ${email}:`);
    await send("Page.navigate", { url: `${ORIGIN}/login` });
    await settle(send);
    await send("Runtime.evaluate", {
      expression: `(() => {
        const set = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, "value").set;
          setter.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        set(document.querySelector('input[name="email"]'), ${JSON.stringify(email)});
        set(document.querySelector('input[name="password"]'), ${JSON.stringify(password)});
        document.querySelector("form").requestSubmit();
      })()`,
    });
    await sleep(3500);
    await settle(send);
    const { result } = await send("Runtime.evaluate", {
      expression: "location.pathname",
      returnByValue: true,
    });
    console.log(`  after submit -> ${result.value}`);

    console.log("App pages:");
    for (const [name, path] of APP_PAGES) await capture(send, name, path);

    // Deep-link into a real stock take so the review flow is covered too.
    await send("Page.navigate", { url: `${ORIGIN}/app/stock-takes` });
    await settle(send);
    const { result: href } = await send("Runtime.evaluate", {
      expression: `(() => {
        const links = [...document.querySelectorAll('a[href^="/app/stock-takes/"]')]
          .map((a) => a.pathname)
          .filter((p) => p !== "/app/stock-takes/new");
        return links[0] ?? "";
      })()`,
      returnByValue: true,
    });
    if (href.value) await capture(send, "app-stock-take-detail", href.value);
    else console.log("  no stock take link found");
  }

  close();
  chrome.kill();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
