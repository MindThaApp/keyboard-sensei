import { app } from "./app.js";
import { env } from "./config.js";
import { prisma } from "./db.js";
const server=app.listen(env.PORT,()=>console.log(`Keyboard Sensei API listening on http://localhost:${env.PORT}`));
const shutdown=()=>server.close(()=>void prisma.$disconnect().finally(()=>process.exit(0)));
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
