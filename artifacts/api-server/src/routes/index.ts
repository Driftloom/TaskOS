import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import focusSessionsRouter from "./focus-sessions";
import projectsRouter from "./projects";
import tagsRouter from "./tags";
import taskFilesRouter from "./task-files";
import blocksRouter from "./blocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(focusSessionsRouter);
router.use(projectsRouter);
router.use(tagsRouter);
router.use(taskFilesRouter);
router.use(blocksRouter);

export default router;
