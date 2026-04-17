import express from "express";
import mapStreamRouter from "./routes/mapStream.js";
import mapRouter from "./routes/map.js";

const app = express();
app.use(express.json());

app.use("/map", mapStreamRouter);
app.use("/map", mapRouter);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
