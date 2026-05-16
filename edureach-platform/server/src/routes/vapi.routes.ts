import { Router } from "express";
import { startCall } from "../controllers/vapi.controller";
import authMiddleware from "../middleware/auth.middleware";

const router = Router();

router.post("/call", authMiddleware, startCall);

export default router;