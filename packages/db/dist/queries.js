import { userService } from './service.js';
export async function createUser(data) {
    return userService.create(data);
}
export async function getUsers() {
    return userService.findAll();
}
export async function getUserById(id) {
    return userService.findById(id);
}
export async function deleteUser(id) {
    return userService.delete(id);
}
//# sourceMappingURL=queries.js.map