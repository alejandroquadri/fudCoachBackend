"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const UserRoutes_1 = __importDefault(require("./routes/UserRoutes"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class App {
    constructor() {
        this.app = (0, express_1.default)();
        this.userRoutes = new UserRoutes_1.default();
        this.initializeMiddlewares();
        this.initializeRoutes();
    }
    initializeMiddlewares() {
        this.app.use(express_1.default.json());
        this.app.use((0, cors_1.default)());
    }
    initializeRoutes() {
        this.app.get('/', (req, res) => {
            res.send('Hello, cruel World!');
        });
        this.app.use('/users', this.userRoutes.getRouter());
    }
    start(port) {
        this.app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    }
}
const app = new App();
const port = Number(process.env.PORT || 5000); // esto lo dejo para ilustrar como obtener las env variables
app.start(port);
//# sourceMappingURL=index.js.map