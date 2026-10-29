/* Layout check for the Network Maps (js/topology-data.js).

   How to run: open the site, then paste this whole file into the browser console (DevTools -> Console) and press Enter.
   It visits each map with every layer switched on, and prints one list per map (msp, cloud, cnet):
     [] means the map is clean. Otherwise each line names a problem:
       - a link crossing a device box or a label
       - a label overlapping a device or another label
       - zones overlapping (other than nested) or a device straddling a zone border
       - text cut off with "…" or running out of its box
   Re-run it after any edit to the map data. It leaves the page on the CNET map with all layers on (reload to reset). */
(async()=>{
const out={};
const svg=document.querySelector('.topo-svg');
for (const id of ['msp','cloud','cnet']) {
  document.getElementById('tab-'+id).click();
  document.querySelectorAll('[data-layer]').forEach(c=>{ if(!c.checked){c.checked=true;c.dispatchEvent(new Event('change'))} });
  await new Promise(r=>setTimeout(r,200));
  const res=[];
  const W=176,H=60;
  // node rects from DOM transforms
  const nodes=[...svg.querySelectorAll('.t-node')].map(g=>{const m=g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/);return {id:g.dataset.n,x:+m[1]-W/2,y:+m[2]-H/2,w:W,h:H}});
  const bb=e=>{const b=e.getBBox();return {x:b.x,y:b.y,w:b.width,h:b.height}};
  const tags=[...svg.querySelectorAll('.t-tag')].map(g=>({t:g.textContent,...bb(g.querySelector('rect'))}));
  const inter=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
  // links: read path d
  const links=[...svg.querySelectorAll('.t-link')].map(p=>{const pts=p.getAttribute('d').slice(1).split('L').map(q=>q.split(',').map(Number));return pts});
  // segment-rect intersection (Liang-Barsky on axis-aligned segs)
  const segHit=(a,b,r)=>{ const x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]); return x0<r.x+r.w&&x1>r.x&&y0<r.y+r.h&&y1>r.y; };
  // link vs node: need link endpoints' nodes; derive by hit-testing: node whose rect contains first or last point (center) 
  links.forEach((pts,li)=>{
    const ends=new Set();
    nodes.forEach(n=>{ [pts[0],pts[pts.length-1]].forEach(p=>{ if(p[0]>=n.x&&p[0]<=n.x+n.w&&p[1]>=n.y&&p[1]<=n.y+n.h) ends.add(n.id)}) });
    for(let i=1;i<pts.length;i++){
      nodes.forEach(n=>{ if(ends.has(n.id)) return; // own end cards may hide the line
        // shrink 1px so touching edges do not count
        const r={x:n.x+1,y:n.y+1,w:n.w-2,h:n.h-2}; if(segHit(pts[i-1],pts[i],r)) res.push('link'+li+' crosses node '+n.id); });
      tags.forEach(t=>{ const r={x:t.x+0.5,y:t.y+0.5,w:t.w-1,h:t.h-1}; if(segHit(pts[i-1],pts[i],r)) res.push('link'+li+' crosses label "'+t.t+'"'); });
    }
  });
  tags.forEach((t,i)=>{ nodes.forEach(n=>{ if(inter({x:t.x+.5,y:t.y+.5,w:t.w-1,h:t.h-1},{x:n.x+1,y:n.y+1,w:n.w-2,h:n.h-2})) res.push('label "'+t.t+'" overlaps node '+n.id)});
    for(let j=i+1;j<tags.length;j++) if(inter(t,tags[j])) res.push('label "'+t.t+'" overlaps label "'+tags[j].t+'"'); });
  // zones
  const zs=[...svg.querySelectorAll('.t-zborder')].map(r=>({x:+r.getAttribute('x'),y:+r.getAttribute('y'),w:+r.getAttribute('width'),h:+r.getAttribute('height')}));
  if(!nodes.length||!zs.length) res.push('found no devices or zones: script out of date');
  const inside=(a,b)=>a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h;
  zs.forEach((a,i)=>zs.forEach((b,j)=>{ if(j>i&&inter(a,b)&&!inside(a,b)&&!inside(b,a)) res.push('zones overlap '+i+','+j)}));
  // every node fully inside a zone or none; node partly overlapping a zone border?
  nodes.forEach(n=>zs.forEach((z,i)=>{ if(inter(n,z)&&!inside(n,z)) res.push('node '+n.id+' straddles zone '+i)}));
  // text overflow / truncation
  svg.querySelectorAll('text').forEach(t=>{ if(t.textContent.endsWith('…')) res.push('truncated: '+t.textContent) });
  // text inside its card
  svg.querySelectorAll('.t-node').forEach(g=>{ const c=g.querySelector('.t-card').getBBox(); g.querySelectorAll('.t-host,.t-role,.t-ip').forEach(t=>{const b=t.getBBox(); if(b.x+b.width>c.x+c.width-4||b.y<c.y||b.y+b.height>c.y+c.height) res.push('text overflows card: '+t.textContent)}) });
  svg.querySelectorAll('.t-zname,.t-zmeta').forEach(t=>{ const z=zs.find(z=>{const b=t.getBBox();return b.x>=z.x&&b.y>=z.y&&b.y<=z.y+z.h&&b.x<=z.x+z.w}); if(z){const b=t.getBBox(); if(b.x+b.width>z.x+z.w-8) res.push('zone text overflows: '+t.textContent)} });
  out[id]=res;
}
console.log(JSON.stringify(out, null, 1));
return out;
})();
