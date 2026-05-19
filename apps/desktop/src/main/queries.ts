import { userService } from './services/userService'
import type { NewUser, User } from './db/schema'

console.log('[QUERIES] queries.ts module loaded')

export async function createUser(data: NewUser): Promise<User> {
  console.log('[QUERIES] createUser called with:', data)
  return userService.create(data)
}

export async function getUsers(): Promise<User[]> {
  console.log('[QUERIES] getUsers called')
  return userService.findAll()
}

export async function getUserById(id: number): Promise<User | undefined> {
  console.log('[QUERIES] getUserById called with id:', id)
  return userService.findById(id)
}

export async function deleteUser(id: number): Promise<void> {
  console.log('[QUERIES] deleteUser called with id:', id)
  return userService.delete(id)
}