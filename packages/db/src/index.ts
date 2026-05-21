export { initDatabase, getDb } from './initDb.js'

export type { User, NewUser, Post, NewPost } from './schema.js'
export { createUser, getUsers, getUserById, deleteUser } from './queries.js'