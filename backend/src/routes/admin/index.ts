import { Router } from "express";
import { withMatrix } from "../../lib/rbac.ts";
import { roleGuard } from "../../middleware/auth.ts";
import { configRouter } from "./config.ts";
import { contactFlagsRouter } from "./contact-flags.ts";
import { financeRouter } from "./finance.ts";
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
import { supportRouter } from "./support.ts";

// The admin console. Every route needs an admin; each page and action then checks the
// admin's department against the access matrix (see lib/rbac.ts), loaded here first.
export const adminRouter = Router();
adminRouter.use(roleGuard("admin"), withMatrix);
adminRouter.use(overviewRouter, configRouter, financeRouter, supportRouter, operationsRouter, monitoringRouter, governanceRouter, staffRouter, messagesRouter);
adminRouter.use(refundsRouter, paymentsRouter, payoutHoldsRouter, contactFlagsRouter, recordingsRouter);
