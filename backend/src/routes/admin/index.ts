import { Router } from "express";
import { roleGuard } from "../../middleware/auth.ts";
import { configRouter } from "./config.ts";
import { financeRouter } from "./finance.ts";
import { governanceRouter } from "./governance.ts";
import { operationsRouter } from "./operations.ts";
import { overviewRouter } from "./overview.ts";
import { supportRouter } from "./support.ts";

// The admin console. Every route needs an admin; each page and action then checks
// the admin's role (see lib/rbac.ts).
export const adminRouter = Router();
adminRouter.use(roleGuard("admin"));
adminRouter.use(overviewRouter, configRouter, financeRouter, supportRouter, operationsRouter, governanceRouter);
