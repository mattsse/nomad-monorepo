import { readConfig, sleep } from "./utils";
import { Keymaster } from "./keymaster";

const DRY_RUN = process.env.DRY_RUN === "true";
const METRICS_PORT = parseInt(process.env.METRICS_PORT || "9090") || 9090;
const CONFIG_PATH = process.env.CONFIG_PATH || `./config/keymaster.json`;
const PERIOD = parseInt(process.env.PERIOD || "60") || 60;
const NETWORK_ENABLED = process.env.NETWORK_ENABLED;

async function run(
  configPath: string,
  port: number,
  period: number,
  dryrun = false
) {
  const config = readConfig(configPath);
  const km = await new Keymaster(config).init();
  km.ctx.metrics.startServer(port);

  while (true) {
    if (NETWORK_ENABLED) {
      km.checkAndPaySingleNetwork(NETWORK_ENABLED, dryrun)
    } else {
      await km.checkAndPayAllNetworks(dryrun);
    }

    await sleep(period * 1000);
  }
}

(async () => {
  await run(CONFIG_PATH, METRICS_PORT, PERIOD, DRY_RUN);
})();
