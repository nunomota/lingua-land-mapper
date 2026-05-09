import "dotenv/config";
import express from "express";
import mapStreamRouter from "./routes/mapStream.js";
import mapRouter from "./routes/map.js";
import detailsStreamRouter from "./routes/detailStream.js";
import detailsRouter from "./routes/details.js";

const app = express();
app.use(express.json());

app.use("/map", mapStreamRouter);
app.use("/map", mapRouter);
app.use("/details", detailsStreamRouter);
app.use("/details", detailsRouter);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
