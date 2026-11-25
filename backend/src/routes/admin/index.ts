import { Router } from "express";
import { withMatrix } from "../../lib/rbac.ts";
import { roleGuard } from "../../middleware/auth.ts";
import { astroPayoutsRouter } from "./astro-payouts.ts";
import { adminCareersRouter } from "./careers.ts";
import { astroHelpAdminRouter } from "../astro-help.ts";
import { configRouter } from "./config.ts";
import { customerSessionsRouter } from "./customer-sessions.ts";
import { contactFlagsRouter } from "./contact-flags.ts";
import { financeRouter } from "./finance.ts";
import { handoverRouter } from "./handover.ts";
import { governanceRouter } from "./governance.ts";
import { messagesRouter } from "./messages.ts";
import { monitoringRouter } from "./monitoring.ts";
import { operationsRouter } from "./operations.ts";
import { overviewRouter } from "./overview.ts";
import { payoutHoldsRouter } from "./payout-holds.ts";
import { recordingsRouter } from "./recordings.ts";
import { paymentsRouter } from "./payments.ts";
import { refundsRouter } from "./refunds.ts";
import { staffRouter } from "./staff.ts";
import { tdsRouter } from "./tds.ts";
import { supportRouter } from "./support.ts";

// The admin console. Every route needs an admin; each page and action then checks the
// admin's department against the access matrix (see lib/rbac.ts), loaded here first.
export const adminRouter = Router();
adminRouter.use(roleGuard("admin"), withMatrix);
adminRouter.use(overviewRouter, configRouter, financeRouter, supportRouter, operationsRouter, monitoringRouter, governanceRouter, staffRouter, messagesRouter, handoverRouter, astroPayoutsRouter, tdsRouter, adminCareersRouter, astroHelpAdminRouter);
adminRouter.use(customerSessionsRouter, refundsRouter, paymentsRouter, payoutHoldsRouter, contactFlagsRouter, recordingsRouter);
