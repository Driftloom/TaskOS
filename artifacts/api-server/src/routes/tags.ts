import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { tagsTable } from "@workspace/db";
import {
  CreateTagBody,
  CreateTagResponse,
  DeleteTagParams,
  ListTagsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import { normalizeTagName } from "../lib/tags";

const router: IRouter = Router();

router.get("/tags", requireAuth, async (req, res): Promise<void> => {
  const tags = await runWithRls(req, async (tx) =>
    tx
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.userId, req.userId!))
      .orderBy(asc(tagsTable.name)),
  );

  res.json(ListTagsResponse.parse(tags));
});

// Find-or-create: an existing tag with the same normalized name returns 200
// with that tag instead of a 409, so type-ahead capture stays one round-trip.
router.post("/tags", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTagBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const name = normalizeTagName(parsed.data.name);
  if (!name) {
    res.status(400).json({ error: "Tag name must not be blank." });
    return;
  }

  const tag = await runWithRls(req, async (tx) => {
    const [existing] = await tx
      .select()
      .from(tagsTable)
      .where(
        and(eq(tagsTable.userId, req.userId!), eq(tagsTable.name, name)),
      );
    if (existing) return existing;

    const [created] = await tx
      .insert(tagsTable)
      .values({ userId: req.userId!, name })
      .returning();
    return created;
  });

  res.json(CreateTagResponse.parse(tag));
});

router.delete("/tags/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTagParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [tag] = await runWithRls(req, async (tx) =>
    tx
      .delete(tagsTable)
      .where(
        and(eq(tagsTable.id, params.data.id), eq(tagsTable.userId, req.userId!)),
      )
      .returning({ id: tagsTable.id }),
  );

  if (!tag) {
    res.status(404).json({ error: "Tag not found" });
    return;
  }

  res.status(204).send();
});

export default router;
