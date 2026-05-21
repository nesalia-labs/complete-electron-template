import { userService } from './service.js'
import type { NewUser, User } from './schema.js'

export async function createUser(data: NewUser): Promise<User> {
  return userService.create(data)
}

export async function getUsers(): Promise<User[]> {
  return userService.findAll()
}

export async function getUserById(id: number): Promise<User | undefined> {
  return userService.findById(id)
}

export async function deleteUser(id: number): Promise<void> {
  return userService.delete(id)
}