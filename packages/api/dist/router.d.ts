import { z } from 'zod';
export declare const ping: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
    message: z.ZodString;
}, z.core.$strip>, import("@orpc/server").Schema<string, string>, Record<never, never>, Record<never, never>>;
export declare const createUserProc: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
    name: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, import("@orpc/server").Schema<{
    name: string;
    email: string | null;
    id: number;
    createdAt: Date | null;
}, {
    name: string;
    email: string | null;
    id: number;
    createdAt: Date | null;
}>, Record<never, never>, Record<never, never>>;
export declare const getUsersProc: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("@orpc/server").Schema<unknown, unknown>, import("@orpc/server").Schema<{
    name: string;
    email: string | null;
    id: number;
    createdAt: Date | null;
}[], {
    name: string;
    email: string | null;
    id: number;
    createdAt: Date | null;
}[]>, Record<never, never>, Record<never, never>>;
export declare const getUserByIdProc: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
    id: z.ZodNumber;
}, z.core.$strip>, import("@orpc/server").Schema<{
    name: string;
    email: string | null;
    id: number;
    createdAt: Date | null;
} | undefined, {
    name: string;
    email: string | null;
    id: number;
    createdAt: Date | null;
} | undefined>, Record<never, never>, Record<never, never>>;
export declare const deleteUserProc: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
    id: z.ZodNumber;
}, z.core.$strip>, import("@orpc/server").Schema<{
    success: boolean;
}, {
    success: boolean;
}>, Record<never, never>, Record<never, never>>;
export declare const router: {
    ping: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        message: z.ZodString;
    }, z.core.$strip>, import("@orpc/server").Schema<string, string>, Record<never, never>, Record<never, never>>;
    createUser: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        name: z.ZodString;
        email: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, import("@orpc/server").Schema<{
        name: string;
        email: string | null;
        id: number;
        createdAt: Date | null;
    }, {
        name: string;
        email: string | null;
        id: number;
        createdAt: Date | null;
    }>, Record<never, never>, Record<never, never>>;
    getUsers: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, import("@orpc/server").Schema<unknown, unknown>, import("@orpc/server").Schema<{
        name: string;
        email: string | null;
        id: number;
        createdAt: Date | null;
    }[], {
        name: string;
        email: string | null;
        id: number;
        createdAt: Date | null;
    }[]>, Record<never, never>, Record<never, never>>;
    getUserById: import("@orpc/server").DecoratedProcedure<Record<never, never>, Record<never, never>, z.ZodObject<{
        id: z.ZodNumber;
    }, z.core.$strip>, import("@orpc/server").Schema<{
        name: string;
        email: string | null;
        id: number;
        createdAt: Date | null;
    } | undefined, {
        name: string;
        email: string | null;
        id: number;
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
export type RouterRouter = typeof router;
//# sourceMappingURL=router.d.ts.map