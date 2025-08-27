// 2-Player Tank Battle (no rotation) — Canvas + PNG sprites
const TILE = 42;
const W = 1305, H = 780;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false; // pixelated look

// HUD
const p1WinsEl = document.getElementById("p1Wins");
const p2WinsEl = document.getElementById("p2Wins");
const overlay = document.getElementById("overlay");
const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const btnRestart = document.getElementById("btnRestart");
const btnResetMatch = document.getElementById("btnResetMatch");

// State
let roundActive = true;
let keys = {};
let bullets = [];
let walls = [];
let powerups = [];
let explosions = [];
let lastPowerSpawn = 0;
let powerSpawnInterval = 6000; // ms
let p1Wins = 0, p2Wins = 0;
const winsToMatch = 3;

// Load images
const ASSET = (name) => `assets/${name}`;
const sprites = {
  grass: loadImg("grass.png"),
  sand: loadImg("sand.png"),
  road: loadImg("road.png"),
  wallsTreeGrass: [
    loadImg("wall_tree.png"),
    loadImg("wall_grass.png")
  ],
  wallsStone: [
    loadImg("wall_stone1.png"),
    loadImg("wall_stone2.png")
  ],
  wallsSandGrassStone: [
    loadImg("wall_grass.png"),
    loadImg("wall_stone1.png"),
    loadImg("wall_stone2.png")
  ],
  grass: loadImg("grass.png"),
  sand: loadImg("sand.png"),
  road: loadImg("road.png"),
  wall: loadImg("wall_tree.png"),
  p1: {
    up: loadImg("tank_red_up.png"),
    down: loadImg("tank_red_down.png"),
    left: loadImg("tank_red_left.png"),
    right: loadImg("tank_red_right.png"),
  },
  p2: {
    up: loadImg("tank_blue_up.png"),
    down: loadImg("tank_blue_down.png"),
    left: loadImg("tank_blue_left.png"),
    right: loadImg("tank_blue_right.png"),
  },
  bullet: loadImg("bullet.png"),
  power_heart: loadImg("power_heart.png"),
  power_speed: loadImg("power_speed.png"),
  power_rapid: loadImg("power_rapid.png"),
  explosion: [
    loadImg("explosion_1.png"),
    loadImg("explosion_2.png"),
    loadImg("explosion_3.png"),
    loadImg("explosion_4.png")
  ]
};

function loadImg(name){
  const img = new Image();
  img.src = ASSET(name);
  return img;
}

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function rectsOverlap(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }

class Tank {
  constructor(x,y,skin){
    this.x=x; this.y=y; this.w=28; this.h=28;
    this.dir="down";
    this.speed=2.8;
    this.hpMax=5;
    this.hp=this.hpMax;
    this.reload=350; // ms
    this.canShoot=true;
    this.skin=skin; // sprites.p1 or sprites.p2
    this.bulletsActive=0;
    this.bulletLimit=3;
    this.rapidUntil=0;
    this.speedUntil=0;
  }
  bbox(){ return {x:this.x, y:this.y, w:this.w, h:this.h}; }
  draw(){
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "black";
    ctx.fillRect(this.x+2, this.y+this.h-4, this.w-4, 4);
    ctx.globalAlpha = 1.0;
    ctx.drawImage(this.skin[this.dir], this.x-2, this.y-2, TILE, TILE);
    const pct = this.hp/this.hpMax;
    ctx.fillStyle = "#00000088";
    ctx.fillRect(this.x, this.y-8, this.w, 5);
    ctx.fillStyle = pct > .6 ? "#44e06a" : (pct > .3 ? "#e6c451" : "#e06464");
    ctx.fillRect(this.x, this.y-8, this.w * pct, 5);
  }
  move(dx,dy){
    const prev = {x:this.x, y:this.y};
    this.x += dx * this.speed;
    this.y += dy * this.speed;
    this.x = clamp(this.x, 0, W - this.w);
    this.y = clamp(this.y, 0, H - this.h);
    for(const w of walls){
      if(rectsOverlap(this.bbox(), w)) { this.x = prev.x; this.y = prev.y; break; }
    }
  }
  shoot(ownerId){
    if(!this.canShoot) return;
    if(this.bulletsActive >= this.bulletLimit) return;
    const bSize = 8;
    let bx = this.x + this.w/2 - bSize/2;
    let by = this.y + this.h/2 - bSize/2;
    let vx = 0, vy = 0;
    if(this.dir==="up") vy = -6;
    else if(this.dir==="down") vy = 6;
    else if(this.dir==="left") vx = -6;
    else if(this.dir==="right") vx = 6;
    bullets.push({x:bx, y:by, w:bSize, h:bSize, vx, vy, owner:ownerId, alive:true});
    this.bulletsActive++;
    this.canShoot=false;
    const now = performance.now();
    const cd = (now < this.rapidUntil) ? 120 : this.reload;
    setTimeout(()=>{ this.canShoot=true; }, cd);
  }
}

class PowerUp {
  constructor(x, y, type){
    this.x=x; this.y=y; this.w=TILE; this.h=TILE; this.type=type;
  }
  draw(){
    if(this.type==="heart") ctx.drawImage(sprites.power_heart, this.x, this.y, TILE, TILE);
    if(this.type==="speed") ctx.drawImage(sprites.power_speed, this.x, this.y, TILE, TILE);
    if(this.type==="rapid") ctx.drawImage(sprites.power_rapid, this.x, this.y, TILE, TILE);
  }
}

class Explosion {
  constructor(x,y){
    this.x=x; this.y=y; this.t=0;
  }
  draw(dt){
    this.t += dt;
    const frame = Math.min(3, Math.floor(this.t/60));
    ctx.drawImage(sprites.explosion[frame], this.x-8, this.y-8, TILE, TILE);
  }
  done(){ return this.t > 260; }
}

function buildWalls(){
  walls.length = 0;
  const cols = Math.floor(W/TILE), rows = Math.floor(H/TILE);
  for(let y=1; y<rows-1; y++){
    for(let x=1; x<cols-1; x++){
      if(Math.random() < 0.12){
        const rx = x*TILE, ry = y*TILE;
        if( (rx<200 && ry>150 && ry<H-150) || (rx>W-200 && ry>150 && ry< H-150) ) continue;
        walls.push({x:rx, y:ry, w:TILE, h:TILE, img:sprites.wall});
      }
    }
  }
}

function drawBg(){
  for(let y=0; y<H; y+=TILE){
    for(let x=0; x<W; x+=TILE){
      ctx.drawImage(sprites.grass, x, y, TILE, TILE);
    }
  }
}

let p1, p2;

function resetRound(){
  bullets = [];
  powerups = [];
  explosions = [];
  buildWalls();
  p1 = new Tank(60, H/2-16, sprites.p1);
  p2 = new Tank(W-100, H/2-16, sprites.p2);
  p1.dir = "right";
  p2.dir = "left";
  roundActive = true;
  overlay.classList.add("hidden");
}

function endRound(text){
  roundActive = false;
  resultTitle.textContent = text;
  resultSub.textContent = `Score — P1: ${p1Wins} | P2: ${p2Wins}`;
  overlay.classList.remove("hidden");
}

function resetMatch(){
  p1Wins = 0; p2Wins = 0;
  p1WinsEl.textContent = p1Wins;
  p2WinsEl.textContent = p2Wins;
  resetRound();
}

btnRestart.addEventListener("click", ()=>{
  if(p1Wins >= winsToMatch || p2Wins >= winsToMatch){
    resetMatch();
  } else {
    resetRound();
  }
});
btnResetMatch.addEventListener("click", resetMatch);

document.addEventListener("keydown", (e)=>{
  keys[e.key] = true;
  if(e.key === "r" || e.key === "R") resetRound();
  if(!roundActive) return;
  if(e.key === "f" || e.key === "F"){ p1.shoot(1); }
  if(e.key === "Enter"){ p2.shoot(2); }
});
document.addEventListener("keyup", (e)=>{ keys[e.key] = false; });

function maybeSpawnPower(){
  const now = performance.now();
  if(now - lastPowerSpawn < powerSpawnInterval) return;
  lastPowerSpawn = now;
  const types = ["heart", "speed", "rapid"];
  const type = types[Math.floor(Math.random()*types.length)];
  for(let tries=0; tries<40; tries++){
    const x = Math.floor(Math.random()*(W/TILE-2)+1)*TILE;
    const y = Math.floor(Math.random()*(H/TILE-2)+1)*TILE;
    const pu = new PowerUp(x,y,type);
    const rect = {x:pu.x, y:pu.y, w:pu.w, h:pu.h};
    if(walls.some(w=>rectsOverlap(rect,w))) continue;
    if(rectsOverlap(rect, p1.bbox()) || rectsOverlap(rect, p2.bbox())) continue;
    powerups.push(pu);
    break;
  }
}

let last = performance.now();
function loop(now){
  const dt = now - last; last = now;
  if(roundActive){
    const s1 = (now < p1.speedUntil) ? 4.2 : p1.speed;
    if(keys["w"]){ p1.dir="up"; p1.speed=s1; p1.move(0,-1); }
    if(keys["s"]){ p1.dir="down"; p1.speed=s1; p1.move(0, 1); }
    if(keys["a"]){ p1.dir="left"; p1.speed=s1; p1.move(-1,0); }
    if(keys["d"]){ p1.dir="right"; p1.speed=s1; p1.move(1, 0); }
    const s2 = (now < p2.speedUntil) ? 4.2 : p2.speed;
    if(keys["ArrowUp"]){ p2.dir="up"; p2.speed=s2; p2.move(0,-1); }
    if(keys["ArrowDown"]){ p2.dir="down"; p2.speed=s2; p2.move(0, 1); }
    if(keys["ArrowLeft"]){ p2.dir="left"; p2.speed=s2; p2.move(-1,0); }
    if(keys["ArrowRight"]){ p2.dir="right"; p2.speed=s2; p2.move(1, 0); }

    for(const b of bullets){
      if(!b.alive) continue;
      b.x += b.vx; b.y += b.vy;
      if(b.x<-10 || b.x>W+10 || b.y<-10 || b.y>H+10){ b.alive=false; }
      for(const w of walls){ if(rectsOverlap(b, w)){ b.alive=false; break; } }
      if(b.alive && b.owner!==1 && rectsOverlap(b, p1.bbox())){ b.alive=false; hitPlayer(p1, b); }
      if(b.alive && b.owner!==2 && rectsOverlap(b, p2.bbox())){ b.alive=false; hitPlayer(p2, b); }
    }
    bullets = bullets.filter(b=>{
      if(!b.alive){
        if(b.owner===1) p1.bulletsActive = Math.max(0, p1.bulletsActive-1);
        if(b.owner===2) p2.bulletsActive = Math.max(0, p2.bulletsActive-1);
        return false;
      }
      return true;
    });

    maybeSpawnPower();
    for(let i=powerups.length-1; i>=0; i--){
      const pu = powerups[i];
      if(rectsOverlap(pu, p1.bbox())){ applyPower(p1, pu.type); powerups.splice(i,1); }
      else if(rectsOverlap(pu, p2.bbox())){ applyPower(p2, pu.type); powerups.splice(i,1); }
    }
  }

  drawBg();
  for(const w of walls){ ctx.drawImage(w.img, w.x, w.y, TILE, TILE); }
  for(const pu of powerups){ pu.draw(); }
  p1.draw(); p2.draw();
  for(const b of bullets){ ctx.drawImage(sprites.bullet, b.x, b.y, b.w, b.h); }
  for(const ex of explosions){ ex.draw(dt); }
  explosions = explosions.filter(e=>!e.done());

  requestAnimationFrame(loop);
}

function hitPlayer(player, bullet){
  explosions.push(new Explosion(player.x+player.w/2, player.y+player.h/2));
  player.hp -= 1;
  if(player.hp <= 0){
    if(player === p1){ p2Wins++; p2WinsEl.textContent = p2Wins; }
    else { p1Wins++; p1WinsEl.textContent = p1Wins; }
    if(p1Wins >= winsToMatch) endRound("🏁 Player 1 wins the match!");
    else if(p2Wins >= winsToMatch) endRound("🏁 Player 2 wins the match!");
    else endRound(player === p1 ? "💥 Player 2 wins the round!" : "💥 Player 1 wins the round!");
  }
}

function applyPower(player, type){
  const now = performance.now();
  if(type==="heart"){ player.hp = Math.min(player.hpMax, player.hp + 1); }
  else if(type==="speed"){ player.speedUntil = now + 5000; }
  else if(type==="rapid"){ player.rapidUntil = now + 6000; }
}

function drawBg(){
  const terrains = [sprites.grass, sprites.sand, sprites.road];
  for(let y=0; y<H; y+=TILE){
    for(let x=0; x<W; x+=TILE){
      const terrain = terrains[Math.floor(Math.random() * terrains.length)];
      ctx.drawImage(terrain, x, y, TILE, TILE);
    }
  }
}


let terrainMap = [];
let currentTerrainType = null;

function generateTerrain(){
  const terrainTypes = [sprites.grass, sprites.sand, sprites.road];
  currentTerrainType = terrainTypes[Math.floor(Math.random() * terrainTypes.length)];
  
  const cols = Math.floor(W / TILE);
  const rows = Math.floor(H / TILE);
  terrainMap = [];
  for(let y=0; y<rows; y++){
    terrainMap[y] = [];
    for(let x=0; x<cols; x++){
      terrainMap[y][x] = currentTerrainType;  // whole map same terrain
    }
  }
}

function resetRound(){
  generateTerrain();
  bullets = [];
  powerups = [];
  explosions = [];
  buildWalls();
  p1 = new Tank(60, H/2-16, sprites.p1);
  p2 = new Tank(W-100, H/2-16, sprites.p2);
  p1.dir = "right";
  p2.dir = "left";
  roundActive = true;
  overlay.classList.add("hidden");
}

function drawBg(){
  const cols = Math.floor(W / TILE);
  const rows = Math.floor(H / TILE);
  for(let y=0; y<rows; y++){
    for(let x=0; x<cols; x++){
      const terrain = terrainMap[y][x];
      ctx.drawImage(terrain, x*TILE, y*TILE, TILE, TILE);
    }
  }
}
function drawBg(){
  const cols = Math.floor(W / TILE);
  const rows = Math.floor(H / TILE);
  for(let y=0; y<rows; y++){
    for(let x=0; x<cols; x++){
      const terrain = terrainMap[y][x];
      ctx.drawImage(terrain, x*TILE, y*TILE, TILE, TILE);
    }
  }
}

function resetRound(){
  generateTerrain(); // new terrain each round
  bullets = [];
  powerups = [];
  explosions = [];
  buildWalls();
  p1 = new Tank(60, H/2-16, sprites.p1);
  p2 = new Tank(W-100, H/2-16, sprites.p2);
  p1.dir = "right";
  p2.dir = "left";
  roundActive = true;
  overlay.classList.add("hidden");
}

function buildWalls(){
  walls.length = 0;
  const cols = Math.floor(W/TILE), rows = Math.floor(H/TILE);
  for(let y=1; y<rows-1; y++){
    for(let x=1; x<cols-1; x++){
      if(Math.random() < 0.12){
        const rx = x*TILE, ry = y*TILE;
        // avoid spawn areas
        if( (rx<200 && ry>150 && ry<H-150) || (rx>W-200 && ry>150 && ry< H-150) ) continue;
        const wallImg = sprites.walls[Math.floor(Math.random() * sprites.walls.length)];
        walls.push({x:rx, y:ry, w:TILE, h:TILE, img:wallImg});
      }
    }
  }
}

function buildWalls(){
  walls.length = 0;
  const cols = Math.floor(W/TILE), rows = Math.floor(H/TILE);
  for(let y=1; y<rows-1; y++){
    for(let x=1; x<cols-1; x++){
      if(Math.random() < 0.12){
        const rx = x*TILE, ry = y*TILE;
        // avoid spawn areas
        if( (rx<200 && ry>150 && ry<H-150) || (rx>W-200 && ry>150 && ry< H-150) ) continue;
        
        let wallImg = null;
        if(currentTerrainType === sprites.grass){
          // Grass map: only tree or grass
          wallImg = sprites.wallsTreeGrass[Math.floor(Math.random() * sprites.wallsTreeGrass.length)];
        } else if(currentTerrainType === sprites.sand){
          // Sand map: only stone or grass
          wallImg = sprites.wallsSandGrassStone[Math.floor(Math.random() * sprites.wallsSandGrassStone.length)];
        } else if(currentTerrainType === sprites.road){
          // Road map: only stones
          wallImg = sprites.wallsStone[Math.floor(Math.random() * sprites.wallsStone.length)];
        }
        
        walls.push({x:rx, y:ry, w:TILE, h:TILE, img:wallImg});
      }
    }
  }
}

const menuOverlay = document.getElementById("menuOverlay");
const btnStart = document.getElementById("btnStart");
const btnSettings = document.getElementById("btnSettings");
const settingsOverlay = document.getElementById("settingsOverlay");
const btnBack = document.getElementById("btnBack");

let gameStarted = false;

// Start game
btnStart.addEventListener("click", () => {
  menuOverlay.classList.add("hidden");  // hide menu
  gameStarted = true;
  resetRound();                          // start first round
  requestAnimationFrame(loop);           // start game loop
});

// Open settings
btnSettings.addEventListener("click", () => {
  menuOverlay.classList.add("hidden");   // hide menu
  settingsOverlay.classList.remove("hidden"); // show settings
});

// Back to menu
btnBack.addEventListener("click", () => {
  settingsOverlay.classList.add("hidden"); // hide settings
  menuOverlay.classList.remove("hidden");  // show menu
});


const ASSET = (name) => `assets/${name}`;



// Initialize
resetRound();
requestAnimationFrame(loop);


