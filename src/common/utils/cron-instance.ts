/**
 * The API runs as a pm2 cluster, and `@Cron` fires in EVERY worker. A job that
 * sends something (an email, a notification) or writes a row must run in one
 * worker only, or each customer gets it once per worker — the workers all read
 * "not sent yet" in the same millisecond, before any of them has saved "sent".
 *
 * pm2 numbers its workers from 0; outside pm2 (tests, a single dev process)
 * there is no number and the job runs.
 */
export function isCronLeaderInstance(): boolean {
  const instanceId =
    process.env.INSTANCE_ID ?? process.env.NODE_APP_INSTANCE ?? null;
  return !instanceId || instanceId === '0';
}
