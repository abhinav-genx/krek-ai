import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initRouter } from "./routes/init/index.js";

const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use("/sandbox", initRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ message: "All Good !!!" });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
