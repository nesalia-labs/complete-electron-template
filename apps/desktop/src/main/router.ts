import { os } from '@orpc/server'
import { z } from 'zod'
import { createUser, getUsers, getUserById, deleteUser } from './queries'

export const ping = os
  .input(z.object({ message: z.string() }))
  .handler(async ({ input }) => {
    return `pong: ${input.message}`
  })

export const createUserProc = os
  .input(z.object({
    name: z.string(),
    email: z.string().optional()
  }))
  .handler(async ({ input }) => {
    return createUser({ name: input.name, email: input.email })
  })

export const getUsersProc = os.handler(async () => {
  return getUsers()
})

export const getUserByIdProc = os
  .input(z.object({ id: z.number() }))
  .handler(async ({ input }) => {
    return getUserById(input.id)
  })

export const deleteUserProc = os
  .input(z.object({ id: z.number() }))
  .handler(async ({ input }) => {
    await deleteUser(input.id)
    return { success: true }
  })

export const router = {
  ping,
  createUser: createUserProc,
  getUsers: getUsersProc,
  getUserById: getUserByIdProc,
  deleteUser: deleteUserProc
}