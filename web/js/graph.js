const D_mapViewBtn=$('mapViewBtn'),D_graphLayer=$('graphLayer'),D_graphCanvas=$('graphCanvas'),D_graphNodes=$('graphNodes'),D_closeGraphBtn=$('closeGraphBtn');
let graphActive=false,animFrame=null,hoveredNode=null,draggedNode=null;let graphLinks=[];
let graphScale=1,graphPanX=0,graphPanY=0;let graphTime=0;function buildGraph(){graphScale=1;
graphPanX=0;graphPanY=0;graphNodes=[];graphLinks=[];D_graphNodes.innerHTML='';const cx=window.innerWidth/2,cy=window.innerHeight/2;
const idMap={},childrenOf={},globalRoots=[];let maxLevel=0;savedList.forEach(r=>{if(r.isFolderMeta)return;
const parts=(r.folder||'Uncategorized').split('/');let parentId=null;parts.forEach((p,i)=>{const fid='folder_'+parts.slice(0,i+1).join('/');
if(!idMap[fid]){const lvl=i;if(lvl>maxLevel)maxLevel=lvl;const fn={id:fid,label:p,type:'folder',level:lvl,x:cx,y:cy,vx:0,vy:0,fixed:!!globalLayout[fid],phase:Math.random()*Math.PI*2};
if(globalLayout[fid]){fn.x=globalLayout[fid].x;fn.y=globalLayout[fid].y}graphNodes.push(fn);
idMap[fid]=fn;if(parentId){graphLinks.push({source:idMap[parentId],target:fn,len:150});
if(!childrenOf[parentId])childrenOf[parentId]=[];if(!childrenOf[parentId].includes(fid))childrenOf[parentId].push(fid)}
else{globalRoots.push(fid)}childrenOf[fid]=[]}parentId=fid});const lvl=parts.length;
if(lvl>maxLevel)maxLevel=lvl;const rn={id:r.id,label:r.name,type:'request',data:r,level:lvl,x:cx,y:cy,vx:0,vy:0,fixed:!!globalLayout[r.id],phase:Math.random()*Math.PI*2};
if(globalLayout[r.id]){rn.x=globalLayout[r.id].x;rn.y=globalLayout[r.id].y}graphNodes.push(rn);
if(parentId){graphLinks.push({source:idMap[parentId],target:rn,len:120});if(!childrenOf[parentId])childrenOf[parentId]=[];
if(!childrenOf[parentId].includes(r.id))childrenOf[parentId].push(r.id)}else{globalRoots.push(r.id)}
idMap[r.id]=rn});const ringRadius=150;function layoutRadial(nodeId,angle,arc,depth){const children=childrenOf[nodeId]||[];
if(children.length===0)return;const parent=idMap[nodeId];const childArc=arc/Math.max(1,children.length);
let startAngle=angle-arc/2+childArc/2;children.forEach((cid,i)=>{const child=idMap[cid];
if(!child)return;if(globalLayout[cid])return;const a=startAngle+i*childArc;const r=ringRadius*(1+depth*0.45);
child.x=parent.x+Math.cos(a)*r;child.y=parent.y+Math.sin(a)*r;layoutRadial(cid,a,childArc*0.9,depth+1)})}
const GR_count=globalRoots.length;let clusterSeparation=Math.max(300,ringRadius*1.5);
if(GR_count<=2)clusterSeparation=250;globalRoots.forEach((grid,i)=>{if(globalLayout[grid])return;
const angle=(i/Math.max(1,GR_count))*Math.PI*2;const rootNode=idMap[grid];if(!rootNode)return;
rootNode.x=cx+Math.cos(angle)*clusterSeparation;rootNode.y=cy+Math.sin(angle)*clusterSeparation;
const spreadArc=GR_count===1?(Math.PI*2):(Math.PI*1.5);layoutRadial(grid,angle,spreadArc,0)});
graphLinks.forEach(l=>{const dx=l.target.x-l.source.x,dy=l.target.y-l.source.y;l.len=Math.max(80,Math.sqrt(dx*dx+dy*dy))});
graphNodes.forEach(n=>{n.vx=0;n.vy=0;const el=document.createElement('div');el.className='gn-node '+(n.type==='folder'?'folder':'');
el.textContent=n.label;if(n.type==='request')el.title="Double click to open";n.el=el;
el.onmouseenter=()=>{hoveredNode=n};el.onmouseleave=()=>{if(hoveredNode===n)hoveredNode=null};
el.onmousedown=(e)=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();
n.fixed=true;n.vx=0;n.vy=0;draggedNode=n;const ox=(n.x*graphScale+graphPanX)-e.clientX;
const oy=(n.y*graphScale+graphPanY)-e.clientY;const mm=(me)=>{n.x=(me.clientX+ox-graphPanX)/graphScale;
n.y=(me.clientY+oy-graphPanY)/graphScale};const mu=()=>{draggedNode=null;storeSaved(true);
document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu)};
document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu)};
el.ondblclick=(e)=>{e.preventDefault();e.stopPropagation();if(n.type==='request'){closeGraph();
createTab(savedList.find(x=>x.id===n.id))}};D_graphNodes.appendChild(el)});D_graphLayer.onmousedown=(e)=>{if(e.target!==D_graphLayer&&e.target!==D_graphCanvas&&e.target!==D_graphNodes)return;
if(e.button!==0&&e.button!==2)return;e.preventDefault();const sx=e.clientX,sy=e.clientY;
const startPanX=graphPanX,startPanY=graphPanY;const mm=(me)=>{graphPanX=startPanX+(me.clientX-sx);
graphPanY=startPanY+(me.clientY-sy)};const mu=()=>{document.removeEventListener('mousemove',mm);
document.removeEventListener('mouseup',mu)};document.addEventListener('mousemove',mm);
document.addEventListener('mouseup',mu)};D_graphLayer.onwheel=(e)=>{e.preventDefault();
const zoom=Math.exp((e.deltaY<0?1:-1)*0.1);const mouseX=e.clientX,mouseY=e.clientY;
graphPanX=mouseX-(mouseX-graphPanX)*zoom;graphPanY=mouseY-(mouseY-graphPanY)*zoom;
graphScale*=zoom;if(graphScale<0.6)D_graphLayer.classList.add('zoomed-out');else D_graphLayer.classList.remove('zoomed-out')}}
function physicsLoop(){if(!graphActive)return;graphTime+=0.015;const ctx=D_graphCanvas.getContext('2d');
const W=D_graphLayer.offsetWidth,H=D_graphLayer.offsetHeight;if(D_graphCanvas.width!==W||D_graphCanvas.height!==H){D_graphCanvas.width=W;
D_graphCanvas.height=H}const centerX=W/2,centerY=H/2;const N=graphNodes.length;const minDist=90;
for(let i=0;i<N;i++){const a=graphNodes[i];for(let j=i+1;j<N;j++){const b=graphNodes[j];
if(a.fixed&&b.fixed)continue;let dx=a.x-b.x,dy=a.y-b.y;let dist2=dx*dx+dy*dy;if(dist2<1){dx=Math.random()-0.5;
dy=Math.random()-0.5;dist2=1}const dist=Math.sqrt(dist2);let f=Math.min(1200/dist2,4);
if(dist<minDist)f+=(minDist-dist)*0.3;const fx=(dx/dist)*f,fy=(dy/dist)*f;if(!a.fixed){a.vx+=fx;
a.vy+=fy}if(!b.fixed){b.vx-=fx;b.vy-=fy}}}for(let i=0;i<graphLinks.length;i++){const l=graphLinks[i];
const dx=l.target.x-l.source.x,dy=l.target.y-l.source.y;const dist=Math.sqrt(dx*dx+dy*dy);
if(dist<10)continue;let stiff=(l.source.fixed||l.target.fixed)?0:0.002;const spring=(dist-l.len)*stiff;
const fx=(dx/dist)*spring,fy=(dy/dist)*spring;if(!l.source.fixed){l.source.vx+=fx;
l.source.vy+=fy}if(!l.target.fixed){l.target.vx-=fx;l.target.vy-=fy}}const damping=0.9;
for(let i=0;i<N;i++){const n=graphNodes[i];if(n.fixed){n.vx=0;n.vy=0}else{const dx=centerX-n.x,dy=centerY-n.y;
n.vx+=dx*0.0003;n.vy+=dy*0.0003;n.vx*=damping;n.vy*=damping;n.x+=n.vx;n.y+=n.vy}
n.wx=Math.sin(graphTime*1.2+n.phase)*2.5+Math.sin(graphTime*1.8+n.phase*2)*1.2;n.wy=Math.cos(graphTime*1.1+n.phase*1.4)*2.5+Math.cos(graphTime*1.6+n.phase*0.8)*1.2;
const rx=n.x+n.wx,ry=n.y+n.wy;n.el.style.transform=`translate(${rx*graphScale+graphPanX}px,${ry*graphScale+graphPanY}px) translate(-50%,-50%)`}
ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);ctx.setTransform(graphScale,0,0,graphScale,graphPanX,graphPanY);
ctx.beginPath();for(let i=0;i<graphLinks.length;i++){const l=graphLinks[i];ctx.moveTo(l.source.x+l.source.wx,l.source.y+l.source.wy);
ctx.lineTo(l.target.x+l.target.wx,l.target.y+l.target.wy)}ctx.strokeStyle='rgba(200,97,47,0.30)';
ctx.lineWidth=1.5;ctx.stroke();graphNodes.forEach(n=>{n.el.classList.remove('gn-child','gn-descendant')});
const target=hoveredNode||draggedNode;if(target){let queue=[target];let visited=new Set([target.id]);
let isFirstLevel=true;while(queue.length>0){let nextQueue=[];for(let parent of queue){for(let l of graphLinks){if(l.source===parent&&!visited.has(l.target.id)){visited.add(l.target.id);
if(isFirstLevel)l.target.el.classList.add('gn-child');else l.target.el.classList.add('gn-descendant');
nextQueue.push(l.target)}}}queue=nextQueue;isFirstLevel=false}}animFrame=requestAnimationFrame(physicsLoop)}
D_mapViewBtn.onclick=()=>{const active=D_graphLayer.style.display==='block';if(active){closeGraph()}
else{graphActive=true;D_graphLayer.style.display='block';D_graphNodes.style.display='block';
D_graphCanvas.style.display='block';if(animFrame)cancelAnimationFrame(animFrame);
if(graphNeedsRebuild){buildGraph();graphNeedsRebuild=false}physicsLoop()}};D_closeGraphBtn.onclick=closeGraph;
function closeGraph(){graphActive=false;D_graphLayer.style.display='none';if(animFrame)cancelAnimationFrame(animFrame)}