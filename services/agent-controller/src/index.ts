import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { chatRouter } from "./routes/chat/index.js";
import {
  requestLogger,
  notFoundHandler,
  errorHandler,
  registerProcessErrorHandlers,
} from "./middlewares/error-handler.js";

registerProcessErrorHandlers();

const app = express();
const PORT = process.env.PORT ?? 7000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

app.use(chatRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ message: "All Good !!!" });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[agent-controller] listening on http://localhost:${PORT}`);
});
