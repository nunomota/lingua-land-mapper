import "dotenv/config";
import express from "express";
import mapStreamRouter from "./routes/mapStream.js";
import mapRouter from "./routes/map.js";
import propsStreamRouter from "./routes/propStream.js";
import propsRouter from "./routes/props.js";

const app = express();
app.use(express.json());

app.use("/map", mapStreamRouter);
app.use("/map", mapRouter);
app.use("/props", propsStreamRouter);
app.use("/props", propsRouter);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
