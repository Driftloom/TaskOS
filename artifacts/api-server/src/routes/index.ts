import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import focusSessionsRouter from "./focus-sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(focusSessionsRouter);

export default router;
