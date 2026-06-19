import type { AppDatabase } from '@electron-template/db';
/**
 * Aggregate all domain routers into a single router.
 * Each domain module owns its procedures and closes over the DB it needs.
 */
export declare function createRouter(db: AppDatabase): {
    createUser: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        name: import("zod").ZodString;
        email: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>, import("@orpc/server").Schema<{
        id: number;
        name: string;
        email: string | null;
        createdAt: Date | null;
    }, {
        id: number;
        name: string;
        email: string | null;
        createdAt: Date | null;
    }>, Record<never, never>, Record<never, never>>;
    getUsers: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("@orpc/server").Schema<unknown, unknown>, import("@orpc/server").Schema<{
        id: number;
        name: string;
        email: string | null;
        createdAt: Date | null;
    }[], {
        id: number;
        name: string;
        email: string | null;
        createdAt: Date | null;
    }[]>, Record<never, never>, Record<never, never>>;
    getUserById: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        id: import("zod").ZodNumber;
    }, import("zod/v4/core").$strip>, import("@orpc/server").Schema<{
        id: number;
        name: string;
        email: string | null;
        createdAt: Date | null;
    } | undefined, {
        id: number;
        name: string;
        email: string | null;
        createdAt: Date | null;
    } | undefined>, Record<never, never>, Record<never, never>>;
    deleteUser: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        id: import("zod").ZodNumber;
    }, import("zod/v4/core").$strip>, import("@orpc/server").Schema<{
        success: boolean;
    }, {
        success: boolean;
    }>, Record<never, never>, Record<never, never>>;
    ping: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        message: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("@orpc/server").Schema<string, string>, Record<never, never>, Record<never, never>>;
};
export type AppRouter = ReturnType<typeof createRouter>;
//# sourceMappingURL=index.d.ts.map