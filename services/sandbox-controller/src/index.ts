import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initRouter } from "./routes/init/index.js";
import { usetoolRouter } from "./routes/use-tools/index.js";
import { editorRouter } from "./routes/editor/index.js";
import { browserRouter } from "./routes/browser/index.js";
import { persistRouter } from "./routes/persist/index.js";
import { requireInternalKey } from "./middlewares/internal-auth.js";
import {
  requestLogger,
  notFoundHandler,
  errorHandler,
  registerProcessErrorHandlers,
} from "./middlewares/error-handler.js";

registerProcessErrorHandlers();

const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

app.use("/sandbox", requireInternalKey, initRouter);
app.use("/sandbox", requireInternalKey, usetoolRouter)
app.use("/sandbox", requireInternalKey, browserRouter);;
app.use("/sandbox", requireInternalKey, editorRouter);
app.use("/sandbox", requireInternalKey, persistRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ message: "All Good !!!" });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[sandbox-controller] listening on http://localhost:${PORT}`);
});
