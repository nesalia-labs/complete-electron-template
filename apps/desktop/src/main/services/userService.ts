import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { users, type User, type NewUser } from '../db/schema'

console.log('[SERVICE] userService.ts module loaded')

export class UserService {
  async create(data: NewUser): Promise<User> {
    console.log('[SERVICE] UserService.create called with:', data)
    const db = await getDb()
    console.log('[SERVICE] db instance:', db ? 'ok' : 'null')

    const insertData = {
      name: data.name,
      email: data.email ?? null
    }
    console.log('[SERVICE] Insert data:', insertData)

    try {
      const result = await db.insert(users).values(insertData).returning()
      console.log('[SERVICE] Insert result:', result)
      if (!result[0]) {
        throw new Error('Failed to create user')
      }
      return result[0]
    } catch (error) {
      console.error('[SERVICE] UserService.create error:', error)
      throw error
    }
  }

  async findAll(): Promise<User[]> {
    const db = await getDb()
    return db.select().from(users).all()
  }

  async findById(id: number): Promise<User | undefined> {
    const db = await getDb()
    const result = db.select().from(users).where(eq(users.id, id)).all()
    return result[0]
  }

  async delete(id: number): Promise<void> {
    const db = await getDb()
    db.delete(users).where(eq(users.id, id)).run()
  }

  async count(): Promise<number> {
    const db = await getDb()
    const result = db.select({ count: users.id }).from(users).all()
    return result.length
  }
}

export const userService = new UserService()