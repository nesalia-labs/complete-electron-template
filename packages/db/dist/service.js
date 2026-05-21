import { eq } from 'drizzle-orm';
import { getDb } from './index.js';
import { users } from './schema.js';
export class UserService {
    async create(data) {
        const db = await getDb();
        const result = await db.insert(users).values({
            name: data.name,
            email: data.email ?? null
        }).returning();
        if (!result[0]) {
            throw new Error('Failed to create user');
        }
        return result[0];
    }
    async findAll() {
        const db = await getDb();
        return db.select().from(users).all();
    }
    async findById(id) {
        const db = await getDb();
        const result = db.select().from(users).where(eq(users.id, id)).all();
        return result[0];
    }
    async delete(id) {
        const db = await getDb();
        db.delete(users).where(eq(users.id, id)).run();
    }
}
export const userService = new UserService();
//# sourceMappingURL=service.js.map