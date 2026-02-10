const modelBase64 = await Bun.file("/tmp/model_base64.txt").text();
const loaderPath = "/opt/inference/opencode/packages/opencode/src/wake-word/model-loader.ts";
let content = await Bun.file(loaderPath).text();
const newContent = content.replace(/const MODEL_BASE64: string = ".*"/, `const MODEL_BASE64: string = "${modelBase64}"`);
if (content === newContent && !content.includes(modelBase64.substring(0, 10))) {
    console.error("Replacement failed!");
    process.exit(1);
}
await Bun.write(loaderPath, newContent);
console.log("Embedded model into model-loader.ts");
