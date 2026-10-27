import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const run=async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--use-gl=angle","--use-angle=metal","--ignore-gpu-blocklist","--window-size=1400,900"]});
  const p=await b.newPage(); await p.setViewport({width:1400,height:900,deviceScaleFactor:1});
  const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.evaluateOnNewDocument(`(()=>{const db={'gallery:helpseen':'1'};window.storage={get:k=>db[k]!==undefined?Promise.resolve({value:db[k]}):Promise.reject(new Error('m')),set:(k,v)=>{db[k]=v;return Promise.resolve();},delete:k=>{delete db[k];return Promise.resolve();}};})()`);
  await p.goto("http://localhost:4173/",{waitUntil:"domcontentloaded",timeout:30000});
  await sleep(7000);
  await p.screenshot({path:"/tmp/hand_crop.png", clip:{x:300,y:600,width:800,height:300}});
  await b.close(); console.log(JSON.stringify({errors:errs}));
};
run().catch(e=>{console.error("FAIL",e.message);process.exit(1);});
