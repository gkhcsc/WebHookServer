import express from 'express';
import { exec } from "child_process";
const app = express();
app.use(express.json());
const CONFIG = {
    port: 8000
}
const SCRIPTS_PATH = {
    "ICTWeb": "/root/ICT_service/ICTWeb/autoBuildGitCode.sh",
    "ICTServer":"/root/ICT_service/ICTServer/build.sh"
}
function runCommand(script_name) {
    exec($`sh ${SCRIPTS_PATH[script_name]}`, (error, stdout, stderr) => {
        if (error) {
            console.log("exec failed", error.message);
            return;
        }

        console.log('stdout:', stdout);
        console.log('stderr:', stderr);
    })
}

app.post("/webHook", (req, res) => {
    //密码验证
    if (req.body.password !== "ANL-oo") {
        res.status(401).send("Unauthorized");
    }
    else {
        //判断是否是合并请求
        if (req.body.pull_request.state === "merged") {
            //判断是否是指定项目
            if (req.body.source_repo.project.full_name === "wygkhcsc/officialWebsite") {
                runCommand("ICTWeb");
                res.send("Command executed successfully");
            }
            else if (req.body.source_repo.project.full_name === "wygkhcsc/ICTServer") {
                runCommand("ICTServer");
                res.send("Command executed successfully");
            }
        }
    }
})



app.listen(CONFIG.port, () => {
    console.log(`Server running on port ${CONFIG.port}`);
});