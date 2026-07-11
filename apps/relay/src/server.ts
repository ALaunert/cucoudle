import { startServer } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const relayMobileUrl = process.env.RELAY_MOBILE_URL;
const mobileSessionTtlMs = Number(process.env.MOBILE_SESSION_TTL_SECONDS ?? 8 * 60 * 60) * 1000;
const desktopResponseTimeoutMs = Number(process.env.DESKTOP_RESPONSE_TIMEOUT_MS ?? 15_000);

startServer(port, relayMobileUrl, { mobileSessionTtlMs, desktopResponseTimeoutMs }, host)
  .then((app) => {
    app.log.info(`relay listening on ${host}:${port}`);
    console.log(`cucoudle relay listening on ws://${host}:${port}`);
  })
  .catch((err) => {
    console.error("relay failed to start", err);
    process.exit(1);
  });
