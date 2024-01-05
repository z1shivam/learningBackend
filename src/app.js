import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import errorHandler from "./middlewares/error.middleware.js";

const app = express();

app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));

// Routes
import router from "./routes/user.routes.js";

// Routes Declaration: http://localhost:8000/api/v1/user/register
app.use("/api/v1/users", router);

// Use the error handling middleware
app.use(errorHandler);

export { app };
