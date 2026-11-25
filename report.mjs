import {client, reconcile} from './attendance.mjs';

const flags = process.argv.slice(2);
const result = await reconcile(await client(), {
  start: process.env.REPORT_START_DATE,
  dryRun: flags.includes('--dry-run'),
});
console.log(JSON.stringify(result));
