import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth/index.js";
import userRouter from "./routes/user/index.js";
import {
  requestLogger,
  notFoundHandler,
  errorHandler,
  registerProcessErrorHandlers,
} from "./middlewares/error-handler.js";

registerProcessErrorHandlers();

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

app.use("/auth", authRouter);
app.use("/user", userRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ message: "All Good !!!" });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[auth-controller] listening on http://localhost:${PORT}`);
});
