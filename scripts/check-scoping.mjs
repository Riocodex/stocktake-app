/**
 * Signs in as an outlet admin and requests records belonging to other outlets,
 * asserting the app refuses them rather than leaking cross-outlet data.
 *
 * Usage: node scripts/check-scoping.mjs <email> <password> <path>...
 * Set ORIGIN if the dev server is not on the default port.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const PORT = 9334;

const [email, password, ...paths] = process.argv.slice(2);

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const target = (await res.json()).find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  return { send, close: () => ws.close() };
}

const evaluate = (send, expression) =>
  send("Runtime.evaluate", { expression, returnByValue: true }).then(
    (r) => r.result.value,
  );

async function main() {
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--remote-allow-origins=*",
    "--disable-gpu",
    "--window-size=1280,900",
    "--user-data-dir=/tmp/tribe-scope-profile",
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

  await send("Page.navigate", { url: `${ORIGIN}/login` });
  await sleep(2500);
  await evaluate(
    send,
    `(() => {
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
  );
  await sleep(4000);

  const landed = await evaluate(send, "location.pathname");
  console.log(`signed in as ${email} -> ${landed}`);
  if (landed !== "/app") {
    console.log("FAIL: could not sign in");
    close();
    chrome.kill();
    process.exit(1);
  }

  let failures = 0;
  for (const path of paths) {
    await send("Page.navigate", { url: `${ORIGIN}${path}` });
    await sleep(2200);
    const [where, body] = await Promise.all([
      evaluate(send, "location.pathname"),
      evaluate(send, "document.body.innerText.slice(0, 300)"),
    ]);

    // A notFound() render keeps the URL, so the page body is the real signal.
    const redirected = where !== path;
    const showsCount = /ST-\d{4}-\d{4}/.test(body);
    const ok = redirected || !showsCount;
    if (!ok) failures++;

    const heading = body.replace(/\s+/g, " ").trim().slice(0, 90);
    console.log(
      `${ok ? "BLOCKED" : "LEAKED "}  ${path}\n           -> ${where} | "${heading}"`,
    );
  }

  console.log(failures === 0 ? "\nAll foreign records refused." : `\n${failures} LEAK(S)`);
  close();
  chrome.kill();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
