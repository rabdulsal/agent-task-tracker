import cron from "node-cron";
import { queries } from "./db.js";
import { sendReport } from "./mailer.js";

export function startScheduler(): void {
  // 8:00 AM Eastern — morning report
  cron.schedule("0 8 * * *", async () => {
    console.log("[scheduler] Sending morning report...");
    try {
      await sendReport(queries.getAll.all({ userId: null }), "morning");
    } catch (err: any) {
      console.error("[scheduler] Morning report failed:", err.message);
    }
  }, { timezone: "America/New_York" });

  // 6:00 PM Eastern — evening report
  cron.schedule("0 18 * * *", async () => {
    console.log("[scheduler] Sending evening report...");
    try {
      await sendReport(queries.getAll.all({ userId: null }), "evening");
    } catch (err: any) {
      console.error("[scheduler] Evening report failed:", err.message);
    }
  }, { timezone: "America/New_York" });

  // Midnight — cleanup done tasks older than 1 day
  cron.schedule("0 0 * * *", () => {
    console.log("[scheduler] Running cleanup...");
    queries.cleanup.run({ userId: null });
    console.log("[scheduler] Cleanup complete");
  }, { timezone: "America/New_York" });

  console.log("[scheduler] Cron jobs registered: 8AM report, 6PM report, midnight cleanup");
}
