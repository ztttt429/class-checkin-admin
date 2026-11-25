import {client, reconcile} from './attendance.mjs';

const flags = process.argv.slice(2);
const dryRun = flags[0] === '--dry-run';
const now = dryRun && flags[1] ? Date.parse(flags[1]) : Date.now();
if (!Number.isFinite(now)) throw new Error('预演时间无效。');
const result = await reconcile(await client(), {
  start: process.env.REPORT_START_DATE, now, dryRun,
});
console.log(JSON.stringify(result));
