// Shared types for orpc procedures
// This ensures type safety between desktop (server) and web (client)

export interface PingInput {
  message: string
}

export interface User {
  id: number
  name: string
  email: string | null
  createdAt: Date
}

export interface CreateUserInput {
  name: string
  email?: string
}

export interface DeleteUserOutput {
  success: boolean
}

export interface AppRouter {
  ping: (input: PingInput) => Promise<string>
  createUser: (input: CreateUserInput) => Promise<User>
  getUsers: () => Promise<User[]>
  getUserById: (input: { id: number }) => Promise<User | undefined>
  deleteUser: (input: { id: number }) => Promise<DeleteUserOutput>
}