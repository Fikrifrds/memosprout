import { MemoSprout } from "@/lib/index";
import { createApiServer } from "@/lib/api/server";

const directory = process.env.MEMOSPROUT_DIR ?? "corrections";
const port = Number(process.env.MEMOSPROUT_PORT ?? 3456);

const ms = new MemoSprout(directory);
createApiServer(ms, port);
