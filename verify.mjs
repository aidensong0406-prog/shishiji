import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seed = `(() => {
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  g.fillStyle='#6b5a45';g.fillRect(0,0,256,256);
  for(let i=0;i<8000;i++){const v=60+Math.random()*120;g.fillStyle='rgba('+v+','+(v*0.86|0)+','+(v*0.66|0)+',0.2)';g.fillRect(Math.random()*256,Math.random()*256,2,2);}
  const img=c.toDataURL('image/jpeg',0.8);
  const stone={id:'demo1',slot:0,name:'验石',image:img,addedAt:1,observation:{shape:{elongation:0.4,flatness:0.3,roundness:0.72}}};
  const db={'gallery:helpseen':'1','gallery:index':JSON.stringify({ids:['demo1']}),'gallery:stone:demo1':JSON.stringify(stone)};
  window.storage={get:k=>db[k]!==undefined?Promise.resolve({value:db[k]}):Promise.reject(new Error('m')),set:(k,v)=>{db[k]=v;return Promise.resolve();},delete:k=>{delete db[k];return Promise.resolve();}};
})();`;
const VIEWS = [
  ["vista_gate", 19.2, 0, -Math.PI/2, 0.03, 0],
  ["border_s", 22, -8, -Math.PI/2 - 0.4, 0.04, 0],
];
const run = async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless:"new", args:["--no-sandbox","--use-gl=angle","--use-angle=metal","--ignore-gpu-blocklist","--window-size=1500,950"] });
  const p = await b.newPage(); await p.setViewport({ width:1500, height:950, deviceScaleFactor:1 });
  const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
  await p.evaluateOnNewDocument(seed);
  await p.goto("http://localhost:4173/", { waitUntil:"domcontentloaded", timeout:30000 });
  await sleep(6500);
  for (const [name,x,z,yaw,pit,fl] of VIEWS) {
    await p.evaluate((x,z,yaw,pit,fl)=>{ window.__fl=fl; window.__tp(x,z,yaw,pit); }, x,z,yaw,pit,fl);
    await sleep(fl?1400:650);
    await p.screenshot({ path:`/tmp/v_${name}.png` });
  }
  await b.close();
  console.log(JSON.stringify({ errors: errs.slice(0,8) }));
};
run().catch(e=>{console.error("FAIL",e.message);process.exit(1);});
