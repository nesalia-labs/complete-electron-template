import type { NewUser, User } from './schema.js';
export declare function createUser(data: NewUser): Promise<User>;
export declare function getUsers(): Promise<User[]>;
export declare function getUserById(id: number): Promise<User | undefined>;
export declare function deleteUser(id: number): Promise<void>;
//# sourceMappingURL=queries.d.ts.map