const interval = 300;
const monitors = [
  {
    friendlyName: "North State Blockchain - Member App",
    url: process.env.UPTIMEROBOT_MEMBER_URL ?? "https://www.northstateblockchain.com",
  },
  {
    friendlyName: "North State Blockchain - Admin Panel",
    url: process.env.UPTIMEROBOT_ADMIN_URL ?? "https://north-state-blockchain-admin-panel.vercel.app",
  },
  {
    friendlyName: "North State Blockchain - API and Neon DB",
    url: process.env.UPTIMEROBOT_API_URL
      ?? "https://workspaceapi-server-production-838d.up.railway.app/api/health",
  },
].map((monitor) => ({ ...monitor, url: validateHttpsUrl(monitor.url) }));

function validateHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("UptimeRobot monitor URLs must use HTTPS.");
  }
  return url.toString();
}

function canonicalUrl(value) {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  return `${url.origin}${pathname}${url.search}`;
}

async function uptimeRobotRequest(endpoint, apiKey, values = {}) {
  const response = await fetch(`https://api.uptimerobot.com/v2/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: new URLSearchParams({ api_key: apiKey, format: "json", ...values }),
  });
  const result = await response.json();
  if (!response.ok || result.stat !== "ok") {
    const reason = result.error?.message ?? result.message ?? `HTTP ${response.status}`;
    throw new Error(`UptimeRobot ${endpoint} failed: ${reason}`);
  }
  return result;
}

async function getAllMonitors(apiKey) {
  const result = [];
  let offset = 0;
  while (true) {
    const page = await uptimeRobotRequest("getMonitors", apiKey, {
      limit: "50",
      offset: String(offset),
    });
    const monitors = page.monitors ?? [];
    result.push(...monitors);
    if (monitors.length < 50) return result;
    offset += monitors.length;
  }
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log(`UptimeRobot monitor plan (${interval}-second interval):`);
    for (const monitor of monitors) {
      console.log(`${monitor.friendlyName}: ${monitor.url}`);
    }
    return;
  }

  const apiKey = process.env.UPTIMEROBOT_API_KEY;
  if (!apiKey) {
    throw new Error("Set UPTIMEROBOT_API_KEY in the environment; do not commit it.");
  }

  const existing = await getAllMonitors(apiKey);
  for (const monitor of monitors) {
    const match = existing.find((item) => canonicalUrl(item.url) === canonicalUrl(monitor.url));
    if (match) {
      console.log(`Already monitored: ${monitor.friendlyName} (${match.id})`);
      continue;
    }

    const created = await uptimeRobotRequest("newMonitor", apiKey, {
      type: "1",
      friendly_name: monitor.friendlyName,
      url: monitor.url,
      interval: String(interval),
      timeout: "30",
      http_method: "1",
    });
    const monitorId = created.monitor?.id;
    console.log(`Created monitor: ${monitor.friendlyName}${monitorId ? ` (${monitorId})` : ""}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UptimeRobot setup failed.");
  process.exitCode = 1;
});
