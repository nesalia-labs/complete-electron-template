import { type User, type NewUser } from './schema.js';
export declare class UserService {
    create(data: NewUser): Promise<User>;
    findAll(): Promise<User[]>;
    findById(id: number): Promise<User | undefined>;
    delete(id: number): Promise<void>;
}
export declare const userService: UserService;
//# sourceMappingURL=service.d.ts.map