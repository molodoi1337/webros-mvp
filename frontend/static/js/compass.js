const FOV_DEG   = 50;                
const STEP_DEG  = 5;                 
const PX_PER_DEG = 5;                
const HALF_FOV_PX = (FOV_DEG*PX_PER_DEG)/2;   
const DIR = ['N','NE','E','SE','S','SW','W','NW'];

const TICKS = Math.ceil(FOV_DEG/STEP_DEG)+3;  

const scale = document.getElementById('scale');
for (let i=0;i<TICKS;i++){
  const t = document.createElement('div'); t.className='tick';
  t.appendChild(document.createElement('span'));
  scale.appendChild(t);
}
const ticks = [...scale.children];  

let heading=0, shown=0;
const hdSpan=document.getElementById('hd');

function draw(h){
  const leftDeg = Math.floor((h - FOV_DEG/2)/STEP_DEG)*STEP_DEG;
 
  const fracDeg = h - leftDeg;
  const offsetPx = HALF_FOV_PX - fracDeg*PX_PER_DEG;
  scale.style.transform = `translateX(${offsetPx}px)`;

  for (let i=0;i<TICKS;i++){
    const d = (leftDeg + i*STEP_DEG + 3600) % 360;   
    const label = d % 45 === 0 ? DIR[d/45] : d;      
    ticks[i].firstChild.textContent = label;
    hdSpan.textContent = heading;
  }
}
