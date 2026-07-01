import "dotenv/config";
import { z } from "zod";
export const env = z.object({DATABASE_URL:z.string().min(1),JWT_SECRET:z.string().min(16),ELEVENLABS_API_KEY:z.string().min(1),PORT:z.coerce.number().int().positive().default(3001),CORS_ORIGIN:z.string().default("http://localhost:5173")}).parse(process.env);
