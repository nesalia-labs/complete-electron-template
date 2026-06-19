import { os } from '@orpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users } from '@electron-template/db';
export function createUsersRoutes(db) {
    const createUser = os
        .input(z.object({
        name: z.string(),
        email: z.string().optional()
    }))
        .handler(({ input }) => {
        const result = db
            .insert(users)
            .values({ name: input.name, email: input.email ?? null })
            .returning()
            .all();
        const row = result[0];
        if (!row) {
            throw new Error('Failed to create user');
        }
        return row;
    });
    const getUsers = os.handler(() => {
        return db.select().from(users).all();
    });
    const getUserById = os
        .input(z.object({ id: z.number() }))
        .handler(({ input }) => {
        return db.select().from(users).where(eq(users.id, input.id)).get();
    });
    const deleteUser = os
        .input(z.object({ id: z.number() }))
        .handler(({ input }) => {
        db.delete(users).where(eq(users.id, input.id)).run();
        return { success: true };
    });
    return {
        createUser,
        getUsers,
        getUserById,
        deleteUser
    };
}
//# sourceMappingURL=index.js.map