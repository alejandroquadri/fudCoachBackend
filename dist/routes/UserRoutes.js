"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
class UserRoutes {
    constructor() {
        this.router = express_1.default.Router();
        this.initializeRoutes();
    }
    initializeRoutes() {
        this.router.get('/', this.getUsers);
        this.router.get('/:id', this.getUserById);
    }
    getUsers(req, res) {
        res.send('Users Home');
    }
    getUserById(req, res) {
        const userId = req.params.id;
        res.send(`User ID: ${userId}`);
    }
    getRouter() {
        return this.router;
    }
}
exports.default = UserRoutes;
//# sourceMappingURL=UserRoutes.js.map