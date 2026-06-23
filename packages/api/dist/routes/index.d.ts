import type { AppDatabase } from '@electron-template/db';
import { type AppStore } from './settings.js';
/**
 * Aggregate all domain routers into a single router.
 * Each domain module owns its procedures and closes over the dependencies it needs.
 */
export declare function createRouter(db: AppDatabase, store: AppStore): {
    getSettings: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodOptional<import("zod").ZodObject<{
        keys: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString>>;
    }, import("zod/v4/core").$strip>>, import("@orpc/server").Schema<Record<string, unknown>, Record<string, unknown>>, Record<never, never>, Record<never, never>>;
    updateSetting: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        key: import("zod").ZodString;
        value: import("zod").ZodUnknown;
    }, import("zod/v4/core").$strip>, import("@orpc/server").Schema<{
        success: boolean;
        key: string;
        value: unknown;
    }, {
        success: boolean;
        key: string;
        value: unknown;
    }>, Record<never, never>, Record<never, never>>;
    listRecentProjects: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodOptional<import("zod").ZodObject<{
        limit: import("zod").ZodOptional<import("zod").ZodNumber>;
    }, import("zod/v4/core").$strip>>, import("@orpc/server").Schema<{
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }[], {
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }[]>, Record<never, never>, Record<never, never>>;
    touchRecentProject: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        projectId: import("zod").ZodString;
        projectName: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("@orpc/server").Schema<{
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }, {
        id: number;
        projectId: string;
        projectName: string;
        openedAt: Date;
    }>, Record<never, never>, Record<never, never>>;
    deleteRecentProject: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("zod").ZodObject<{
        projectId: import("zod").ZodString;
    }, import("zod/v4/core").$strip>, import("@orpc/server").Schema<{
        success: boolean;
        projectId: string;
    }, {
        success: boolean;
        projectId: string;
    }>, Record<never, never>, Record<never, never>>;
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
export type { AppStore };
//# sourceMappingURL=index.d.ts.map