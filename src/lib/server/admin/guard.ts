import "server-only";
import { cache } from "react";
import { requireOwner } from "@/lib/server/auth";

/**
 * requireOwner() с кешем на один запрос: слой, страница и её части вызывают его без лишних обращений к БД.
 * Server Action вызывает requireOwner() напрямую — отдельный запрос, отдельная проверка.
 */
export const ensureOwner = cache(requireOwner);
