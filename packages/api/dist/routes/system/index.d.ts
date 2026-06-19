import { z } from 'zod';
export declare function createSystemRoutes(): {
    ping: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        message: z.ZodString;
    }, z.core.$strip>, import("@orpc/server").Schema<string, string>, Record<never, never>, Record<never, never>>;
};
//# sourceMappingURL=index.d.ts.map