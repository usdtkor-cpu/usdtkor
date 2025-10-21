// ===== URL 파라미터 =====
const url = new URL(location.href);
const raceId     = Number(url.searchParams.get("race_id") || 1);
const startTime  = Number(url.searchParams.get("start_time") || Math.floor(Date.now()/1000));
const raceToken  = url.searchParams.get("race_token") || "";
const BETTING_SEC = 300;   // 5분
const RACE_SEC    = 12;

// Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg){ tg.expand(); tg.setHeaderColor("#0b0f15"); tg.setBackgroundColor("#0b0f15"); }
const initData = tg?.initData || "";

// ===== 데이터 =====
const HORSES = [
  { name:"블랙썬더",    odd:8.5,  color:"#e5e7eb" },
  { name:"레드불",      odd:3.2,  color:"#ef4444" },
  { name:"골든윈드",    odd:12.0, color:"#f59e0b" },
  { name:"블루스트ーム", odd:5.1, color:"#60a5fa" },
  { name:"그린파워",    odd:7.8,  color:"#10b981" },
  { name:"퍼플킹",      odd:15.0, color:"#a78bfa" },
];

// ===== DOM =====
const meta = document.getElementById("raceMeta");
const statusEl = document.getElementById("status");
const oddsRow = document.getElementById("oddsRow");
const betButtons = document.getElementById("betButtons");
const scoreBtn = document.getElementById("scoreBtn");
const stage = document.getElementById("stage");
const cdBox = document.getElementById("countdown");
const photo = document.getElementById("photoFinish");
const confettiBox = document.getElementById("confetti");

// 캔버스
const bg = document.getElementById("bg");
const track = document.getElementById("track");
const fx = document.getElementById("fx");
const bgx = bg.getContext("2d");
const ctx = track.getContext("2d");
const fxx = fx.getContext("2d");

// ===== UI 생성 =====
HORSES.forEach(h=>{
  const t=document.createElement("div");
  t.className="tag";
  t.textContent=`${h.name} (${h.odd}배)`;
  oddsRow.appendChild(t);
});
let selected=null;
HORSES.forEach((h,i)=>{
  const b=document.createElement("button");
  b.className="btn";
  b.textContent=h.name;
  b.onclick=()=>{ selected=i; [...betButtons.children].forEach(x=>x.classList.remove("selected")); b.classList.add("selected"); sendBet(i); };
  betButtons.appendChild(b);
});
scoreBtn.onclick=()=>sendData({action:"myscore"});

// ===== 트랙/카메라 파라미터 =====
const W = track.width, H = track.height;
const LANES = HORSES.length;
const laneH = Math.floor(H/LANES);
const FINISH_X = W - 52;
const START_X  = 28;

const cam = { x:0, target:0, zoom:1 };

const posX   = new Array(LANES).fill(START_X);
const phase  = new Array(LANES).fill(Math.random()*Math.PI*2); // 다리 사이클
const velBase= HORSES.map(h => 1.55 + (1/h.odd));              // 배당 낮을수록 기본속도↑
const vel    = velBase.slice();

const idleAmp = 1.5;   // 대기중 상하 바운스 진폭
const idleWob = 2.2;   // 대기중 제자리 좌우 흔들림

// 스프린트(버스트) 예약
const bursts = HORSES.map(()=>({t1:2+Math.random()*4, t2:6+Math.random()*4, on:false, left:0}));

// 먼지 파티클
const particles=[];
function addDust(x,y,color){
  for(let i=0;i<3;i++){
    particles.push({ x:x-6, y:y+6, vx:-(0.6+Math.random()*1.2), vy:-(Math.random()*0.6),
      life:380+Math.random()*280, age:0, color });
  }
}

// ===== 배경 =====
function drawBackground(time){
  bgx.clearRect(0,0,W,H);
  // 관중 웨이브
  const rows=4;
  for(let r=0;r<rows;r++){
    const y=10+r*8, amp=.6 + r*.25;
    for(let i=0;i<38;i++){
      const x=6+i*12 + Math.sin(time*.002 + i*.32 + r)*amp;
      const a=.24 + r*.08;
      bgx.fillStyle=`rgba(226,232,240,${a})`;
      bgx.fillRect(x,y,3,3);
    }
  }
  // 레인 + 결승선
  for(let i=0;i<LANES;i++){
    bgx.fillStyle = i%2? "#0e1728":"#0c1423";
    bgx.fillRect(0,i*laneH,W,laneH);
    bgx.strokeStyle="#152033"; bgx.beginPath(); bgx.moveTo(0,i*laneH); bgx.lineTo(W,i*laneH); bgx.stroke();
  }
  bgx.strokeStyle="#22d3ee"; bgx.setLineDash([6,4]);
  bgx.beginPath(); bgx.moveTo(FINISH_X,0); bgx.lineTo(FINISH_X,H); bgx.stroke();
  bgx.setLineDash([]);
}

// ===== 말(벡터) =====
function drawHorse(x,y,color,phi,scale,mode){
  // mode: "idle" | "run"
  ctx.save();
  ctx.translate(x,y);

  // 상하 바운스
  const bob = (mode==="run" ? Math.sin(phi*2)*1.4 : Math.sin(phi*2)*idleAmp);
  ctx.translate(0, bob);

  // 몸통
  ctx.fillStyle = color;
  roundRect(-16,-7,34,14,6); ctx.fill();

  // 머리(약간 위/앞)
  ctx.beginPath(); ctx.ellipse(22,-2,7,6,0,0,Math.PI*2); ctx.fill();

  // 눈/귀/굴레 디테일
  ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(26,-3,1.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(18,-8); ctx.lineTo(21,-12); ctx.lineTo(23,-7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#222"; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(16,-4); ctx.lineTo(28,-1); ctx.stroke();

  // 갈기
  ctx.strokeStyle=color; ctx.lineWidth=2;
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const px=-12+i*4;
    const py=-7 - Math.sin(phi*3 + i*.7)*(mode==="run"?2.2:1.2);
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.stroke();

  // 꼬리
  ctx.beginPath(); ctx.moveTo(-16,0);
  for(let t=0;t<5;t++){
    const px=-20-t*3;
    const py=Math.sin(phi*3 - t*.6)*(mode==="run"?2.2:1.2);
    ctx.lineTo(px,py);
  }
  ctx.stroke();

  // 다리 (앞/뒤 위상차)
  const a = (mode==="run"? Math.sin(phi)*7 : Math.sin(phi)*10);
  const b = (mode==="run"? Math.sin(phi+Math.PI)*7 : Math.sin(phi+Math.PI)*10);
  leg(-6,7,a);  leg(4,7,a*0.85);
  leg(-12,7,b); leg(-2,7,b*0.9);

  // 그림자
  ctx.globalAlpha=.25; ctx.fillStyle="#000";
  ctx.beginPath(); ctx.ellipse(2,9,16,4,0,0,Math.PI*2); ctx.fill();

  ctx.restore();

  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  function leg(lx,ly,ang){
    ctx.save(); ctx.translate(lx,ly); ctx.rotate(ang*Math.PI/180);
    ctx.fillStyle=color; ctx.fillRect(-2,0,4,8); ctx.fillRect(-1,8,2,6); ctx.fillRect(-3,13,6,3);
    ctx.restore();
  }
}

// ===== 이펙트 레이어 =====
function drawFX(dt){
  fxx.clearRect(0,0,W,H);
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.age+=dt*1000; p.x+=p.vx; p.y+=p.vy;
    const life=Math.max(0,1-p.age/p.life);
    fxx.globalAlpha=life*.7; fxx.fillStyle=p.color;
    fxx.beginPath(); fxx.arc(p.x,p.y,1.5+2*(1-life),0,Math.PI*2); fxx.fill();
    if(p.age>=p.life) particles.splice(i,1);
  }
  fxx.globalAlpha=1;
}

// ===== 상태/루프 =====
let gamePhase="betting"; // betting → racing → finished
let startRaceAt=0;
let winnerIdx=null;

function updateMeta(){
  const now=Math.floor(Date.now()/1000);
  const remain=BETTING_SEC - (now - startTime);
  if(remain>0){
    gamePhase="betting";
    const m=Math.floor(remain/60), s=remain%60;
    meta.textContent=`제${raceId}경기 베팅 오픈 · ${m}:${String(s).padStart(2,"0")} 남음`;
  }else if(remain<=0 && remain>-RACE_SEC){
    if(gamePhase!=="racing"){
      gamePhase="racing";
      startRaceAt=Date.now();
      // 카운트다운/GO
      cdBox.classList.remove("hidden"); cdBox.textContent="3";
      setTimeout(()=>cdBox.textContent="2", 350);
      setTimeout(()=>cdBox.textContent="1", 700);
      setTimeout(()=>{ cdBox.classList.add("go"); cdBox.textContent="GO!"; setTimeout(()=>{cdBox.classList.add("hidden"); cdBox.classList.remove("go");}, 450); }, 1050);
      stage.classList.add("rumble"); setTimeout(()=>stage.classList.remove("rumble"), 900);
    }else{
      const sec=Math.min(RACE_SEC, Math.floor((Date.now()-startRaceAt)/1000)+1);
      meta.textContent=`제${raceId}경기 LIVE · ${sec}초`;
    }
  }else{
    if(gamePhase!=="finished"){
      gamePhase="finished";
      photo.classList.add("hidden");
      winnerIdx = posX.indexOf(Math.max(...posX));
      spawnConfetti();
    }
    meta.textContent=`제${raceId}경기 종료 (공식 결과는 채널 메시지 참조)`;
  }
}

function stepPhysics(dt){
  const t=(Date.now()-startRaceAt)/1000;
  const slow=((RACE_SEC - t) < 2) ? 0.6 : 1.0;

  for(let i=0;i<LANES;i++){
    // 버스트
    if(!bursts[i].on && (Math.abs(t-bursts[i].t1)<.05 || Math.abs(t-bursts[i].t2)<.05)){
      bursts[i].on=true; bursts[i].left=.55+Math.random()*.6;
    }
    let boost=0;
    if(bursts[i].on){ bursts[i].left-=dt; boost=.8+Math.random()*.5; if(bursts[i].left<=0) bursts[i].on=false; }

    // 피로+노이즈
    const fatigue=Math.max(0,t/18);
    vel[i]+= (velBase[i]-vel[i])*.02;
    const noise=(Math.random()-.5)*.4;
    const v=Math.max(1.1, vel[i]+noise-fatigue+boost);

    // 전진
    posX[i]=Math.min(FINISH_X, posX[i] + v*(dt*12)*slow);

    // 다리 위상
    phase[i]+= dt*(6 + v*.7);
    if(phase[i]>Math.PI*2) phase[i]-=Math.PI*2;

    // 먼지
    if(Math.random()<.6){ addDust(posX[i], Math.floor(i*laneH + laneH/2), HORSES[i].color); }
  }

  // 포토피니시
  const nearFinish = Math.max(...posX.map(p=>FINISH_X-p)) < 44 && gamePhase==="racing";
  photo.classList.toggle("hidden", !nearFinish);
}

function stepIdle(dt, time){
  // 레이스 전에도 "진짜 움직이는 말" 연출 (제자리 캔터)
  for(let i=0;i<LANES;i++){
    // 제자리에서 살짝 좌우 흔들며 대기
    const wobble = Math.sin(time*.003 + i)*idleWob;
    posX[i] = START_X + wobble;

    // 다리/갈기/꼬리 위상 진행(느리게)
    phase[i]+= dt*4.0;
    if(phase[i]>Math.PI*2) phase[i]-=Math.PI*2;
  }
}

function drawScene(ts, dt){
  drawBackground(ts);

  // 카메라: 선두 추적
  const leadIndex = posX.indexOf(Math.max(...posX));
  const leadX = posX[leadIndex];
  const targetX = Math.min(Math.max(leadX - W*.55, 0), Math.max(FINISH_X - W*.66, 0));
  cam.x += (targetX - cam.x)*.06;

  const nearFinish = Math.max(...posX.map(p=>FINISH_X-p)) < 44 && gamePhase==="racing";
  cam.zoom += ((nearFinish?1.06:1.0) - cam.zoom)*.05;

  ctx.clearRect(0,0,W,H);
  ctx.save(); ctx.translate(-cam.x,0); ctx.scale(cam.zoom,cam.zoom);

  // 말 + 모션블러
  for(let i=0;i<LANES;i++){
    const y = Math.floor(i*laneH + laneH/2);
    const run = (gamePhase==="racing");
    const trailAlpha = run ? (0.10 + Math.min(0.35, vel[i]*0.04)) : 0.08;

    // 트레일
    ctx.globalAlpha = trailAlpha;
    const trailStep = run ? (vel[i]*1.6) : 1.2;
    for(let t=6;t>=1;t--){
      drawHorse(posX[i]-t*trailStep, y, HORSES[i].color, phase[i]-t*0.2, 1.0, run?"run":"idle");
    }
    ctx.globalAlpha = 1;
    drawHorse(posX[i], y, HORSES[i].color, phase[i], 1.0, run?"run":"idle");
  }
  ctx.restore();

  drawFX(dt);
}

// 콘페티
function spawnConfetti(){
  confettiBox.classList.remove("hidden"); confettiBox.innerHTML="";
  for(let i=0;i<90;i++){
    const d=document.createElement("div");
    d.style.position="absolute";
    d.style.left=(Math.random()*100)+"%";
    d.style.top=(-10-Math.random()*30)+"px";
    d.style.width="6px"; d.style.height="10px";
    d.style.borderRadius="2px";
    d.style.background=`hsl(${Math.random()*360}deg 90% 60%)`;
    d.style.opacity=".9";
    d.style.transform=`rotate(${Math.random()*360}deg)`;
    d.style.animation=`fall ${2+Math.random()*1.8}s linear ${Math.random()*0.7}s forwards`;
    confettiBox.appendChild(d);
  }
}

// 루프
let last=performance.now();
function loop(ts){
  const dt=Math.min(0.05,(ts-last)/1000); last=ts;

  updateMeta();
  if(gamePhase==="racing") stepPhysics(dt);
  else stepIdle(dt, ts);

  drawScene(ts, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===== 전송/토스트 =====
function toast(msg){ statusEl.textContent=msg; }
toast(`제${raceId}경기 • 베팅 또는 관전 가능`);

function sendData(obj){
  if(!tg){ alert("브라우저에서 열림: "+JSON.stringify(obj)); return; }
  obj.init_data = initData;
  tg.sendData(JSON.stringify(obj));
  tg.HapticFeedback?.impactOccurred("soft");
}
function sendBet(horseIndex){
  const now=Math.floor(Date.now()/1000);
  if(now-startTime >= BETTING_SEC){ toast("베팅 마감"); tg?.HapticFeedback?.notificationOccurred("error"); return; }
  if(!raceToken){ toast("레이스 토큰 누락(관리자에게 문의)"); return; }
  const h=HORSES[horseIndex];
  sendData({ action:"bet", race_id:raceId, horse:horseIndex, race_token:raceToken });
  toast(`보냄: 제${raceId}경기 ${h.name} 베팅`);
}
