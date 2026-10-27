import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless:"new", args:["--no-sandbox","--use-gl=angle","--use-angle=metal","--ignore-gpu-blocklist"] });
  const p = await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push("PAGEERR "+e.message)); p.on("console",m=>{if(m.type()==="error")errs.push("CONS "+m.text());});
  await p.evaluateOnNewDocument(`window.storage={get:()=>Promise.reject(new Error('m')),set:()=>Promise.resolve(),delete:()=>Promise.resolve()};`);
  await p.goto("http://localhost:4173/", { waitUntil:"domcontentloaded", timeout:30000 });
  await sleep(7000);
  const hasCanvas = await p.evaluate(()=>!!document.querySelector("canvas"));
  await b.close();
  console.log(JSON.stringify({ hasCanvas, errors: errs.slice(0,10) }, null, 2));
};
run().catch(e=>{console.error("DIAGFAIL", e.message);process.exit(1);});
