import app from "../src/app.ts";

// Vercel's Node runtime accepts a default export of a function (req, res).
// An Express `app` is itself a request handler, so export a tiny wrapper
// that forwards the request/response objects to the Express app.
import connectDB from "../src/config/database.config";
import { initializeKnowledgeBase } from "../src/services/rag.service";

let isReady = false;
let initPromise: Promise<void> | null = null;

async function initOnce(): Promise<void> {
	if (isReady) return;
	if (!initPromise) {
		initPromise = (async () => {
			await connectDB();
			try {
				await initializeKnowledgeBase();
			} catch (err) {
				console.warn("Knowledge base initialization skipped or failed:", err);
			}
			isReady = true;
		})();
	}
	return initPromise;
}

export default async function handler(req: any, res: any) {
	try {
		await initOnce();
		return app(req, res);
	} catch (err) {
		console.error("Server init error:", err);
		res.statusCode = 500;
		res.end("Server initialization failed");
	}
}
