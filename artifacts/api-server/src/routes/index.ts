import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import focusSessionsRouter from "./focus-sessions";
import projectsRouter from "./projects";
import tagsRouter from "./tags";
import taskFilesRouter from "./task-files";
import blocksRouter from "./blocks";
import remindersRouter from "./reminders";
import settingsRouter from "./settings";
import internalRouter from "./internal";
import telegramRouter from "./telegram";
import momentumRouter from "./momentum";
import rescheduleRouter from "./reschedule";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(focusSessionsRouter);
router.use(projectsRouter);
router.use(tagsRouter);
router.use(taskFilesRouter);
router.use(blocksRouter);
router.use(remindersRouter);
router.use(settingsRouter);
router.use(internalRouter);
router.use(telegramRouter);
router.use(momentumRouter);
router.use(rescheduleRouter);

export default router;
