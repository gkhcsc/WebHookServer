import express from 'express';
import {exec} from "child_process";
const app = express();
app.use(express.json());
const CONFIG = {
    port:8000
}

app.post("/webHook", (req, res) => {
    console.log(req.body);
    res.send("ok");
})



app.listen(CONFIG.port, () => {
    console.log(`Server running on port ${CONFIG.port}`);
});