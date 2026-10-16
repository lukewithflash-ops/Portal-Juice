import "server-only";
import { redis } from "@/lib/chat";
import { emptyDoc, mergePush, resetCols, type CloudDoc, type ListCol, type SyncPush } from "@/lib/syncCore";

const key = (uid: string) => `pj:sync:${uid}`;

// Write only if nobody else wrote since we read (rev unchanged). Upstash runs Lua atomically.
const CAS = `local cur = redis.call('GET', KEYS[1])
local rev = 0
if cur then rev = tonumber(cjson.decode(cur)['rev']) or 0 end
if rev ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

export async function readDoc(uid: string): Promise<CloudDoc> {
  const raw = (await redis(["GET", key(uid)])) as string | null;
  if (!raw) return emptyDoc();
  try {
    const d = JSON.parse(raw) as CloudDoc;
    return { ...emptyDoc(), ...d, cols: { ...emptyDoc().cols, ...d.cols } };
  } catch {
    return emptyDoc();
  }
}

async function update(uid: string, fn: (d: CloudDoc) => CloudDoc): Promise<CloudDoc> {
  for (let i = 0; i < 4; i++) {
    const cur = await readDoc(uid);
    const next = fn(cur);
    const ok = Number(await redis(["EVAL", CAS, 1, key(uid), cur.rev, JSON.stringify(next)]));
    if (ok === 1) return next;
  }
  throw new Error("busy");
}

export function pushChanges(uid: string, push: SyncPush) {
  return update(uid, (d) => mergePush(d, push));
}
export function resetCloud(uid: string, cols: ListCol[]) {
  return update(uid, (d) => resetCols(d, cols));
}
