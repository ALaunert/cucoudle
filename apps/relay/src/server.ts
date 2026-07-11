import { startServer } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const relayMobileUrl = process.env.RELAY_MOBILE_URL;

startServer(port, relayMobileUrl)
  .then((app) => {
    app.log.info(`relay listening on ${port}`);
    console.log(`cucoudle relay listening on ws://localhost:${port}`);
  })
  .catch((err) => {
    console.error("relay failed to start", err);
    process.exit(1);
  });
