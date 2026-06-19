import { z } from 'zod';
import { type AppDatabase } from '@electron-template/db';
export declare function createUsersRoutes(db: AppDatabase): {
    createUser: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        name: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, import("@orpc/server").Schema<{
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
    getUserById: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        id: z.ZodNumber;
    }, z.core.$strip>, import("@orpc/server").Schema<{
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
    deleteUser: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        id: z.ZodNumber;
    }, z.core.$strip>, import("@orpc/server").Schema<{
        success: boolean;
    }, {
        success: boolean;
    }>, Record<never, never>, Record<never, never>>;
};
//# sourceMappingURL=index.d.ts.map