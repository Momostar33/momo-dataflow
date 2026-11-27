// Modified for Momo DataFlow, 2026-11-27. See NOTICE.md.
import { PowerSyncDatabase } from '@powersync/web';
import { PowerSyncContext } from '@powersync/react';
import { createContext, Suspense, useContext, useEffect, useState } from 'react';
import { AppSchema, drizzleSchema } from '@/lib/schemas/app-schema';
import { PowerSyncSQLiteDatabase, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';
import { seedDataTypes } from '@/lib/data_types/seed_datatypes';

export const powerSyncDb = new PowerSyncDatabase({
  database: { dbFilename: 'momo-dataflow.sqlite' }, schema: AppSchema,
});
export const db: PowerSyncSQLiteDatabase<typeof drizzleSchema> = wrapPowerSyncWithDrizzle(powerSyncDb, { schema: drizzleSchema });
// No network connector is created by this local-first edition.
const ConnectorContext = createContext<null>(null);
export const useConnector = () => useContext(ConnectorContext);

let initialization: Promise<unknown> | undefined;
function initializeCatalog() {
  initialization ??= seedDataTypes(db).catch(error => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    initializeCatalog().then(() => { if (active) setReady(true); }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : String(e));
    });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <div role="alert">初始化类型目录失败：{error}<button onClick={() => setAttempt(x => x + 1)}>重试</button></div>;
  if (!ready) return <div role="status">正在准备本地设计目录…</div>;
  return <Suspense><PowerSyncContext.Provider value={powerSyncDb}>{children}</PowerSyncContext.Provider></Suspense>;
}
