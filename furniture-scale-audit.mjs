import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import * as THREE from 'three';
import {createFurnishings,FT} from './output/furnishings.js';

const source=readFileSync(new URL('./output/review-data.js',import.meta.url),'utf8');
const model=JSON.parse(source.slice('window.HOME_MODEL='.length,-1)),assets=createFurnishings(model);
assets.root.updateMatrixWorld(true);
const floor=model.dimensions.floor_elevation*FT,round=value=>Math.round(value*1000)/1000;
const namedParts=new Set(['Mattress','Bed headboard','Nightstand body','Nightstand top',
 'Wardrobe carcass','Toilet seat','Vanity body','Vanity countertop','Vanity washbowl','Vanity mirror',
 'Shower tray','Shower head','Kitchen refrigerator','Kitchen hob','Kitchen inset steel sink',
 'Extractor capture canopy','Dining tabletop','Dining seat cushion','Sofa seat cushion',
 'Coffee tabletop','Media console body','Media screen','Prayer cabinet body']);
function measure(object){
 const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());
 return {name:object.name,worldXMM:round(size.x*1000),worldYMM:round(size.z*1000),
  heightMM:round(size.y*1000),bottomAboveFFLMM:round((box.min.y-floor)*1000),
  topAboveFFLMM:round((box.max.y-floor)*1000)};
}
const findings={
 bed:'Queen-like generic mattress1554 x2027mm; suite bounds include two nightstands and lamps, not a2560mm-wide bed. No scale change.',
 wardrobe:'About1737 x620 x2134mm including fronts/pulls. Front-bedroom orientation swaps world axes. No scale change.',
 toilet:'Compact overall381 x619mm; seat488mm above floor is a TALL placeholder. Not confirmed appropriate for the1626mm person; select an actual fixture/seat before relying on comfort. No speculative resize.',
 basin:'Countertops555/799mm wide; ceramic rim about873mm above floor. Mirror and tap are not basin height. No scale change.',
 shower:'Compact792mm tray, glass about2057mm high and head about1977mm above floor. These are illustrative, not selected enclosure/installation dimensions.',
 kitchen:'Combined group includes EXTERIOR exhaust and ceiling suspension: its bounding box is not a cabinet size. Refrigerator747 x762 x1920mm; counter top about890mm, hob518 x716mm; retained hood800 x600mm. No appliance scale change.',
 chair:'Eight chairs:457 x491mm overall footprint with849mm back. Measured seat corrected491 to460mm to match the cited reference; front supports adjusted, feet/positions/footprints/back height retained.',
 sofa:'Compact3-seat sofa2042 x808 x836mm; measured cushion top about451mm. Consistent with a45cm seat reference, not an exact product replica.',
 rug:'2134 x2134mm; custom loose rug, not a standard-size claim. No scale change.',
 media:'2012mm-wide shallow console, about300mm maximum projection including pulls. Screen about63in diagonal; not a purchased TV/cabinet. No scale change.',
 cabinet:'Custom prayer cabinet body1372 x351 x701mm; decorative back reaches1615mm. No universal product size applies. No scale change.'
};
const inventory=assets.items.map(item=>{
 const parts=[];item.group.traverse(object=>{if(namedParts.has(object.name))parts.push(measure(object))});
 return {room:item.room,name:item.name,kind:item.kind,bounds:measure(item.group),parts,
  finding:item.name==='Dining table'?'1829 x914mm top; measured height corrected783 to750mm. Supports/aprons/centerpiece follow; footprint and eight chair locations retained. Eight places are compact, not certified comfortable capacity.':
   item.name==='Living coffee table'?'640 x945mm top at430mm; normal low-table proportions, retained.':findings[item.kind]};
});
const report={units:'mm; worldX/worldY are plan axes, dimensions measured after full transforms',
 scope:'30 furnishing groups plus6 nested lamps. Component bounds, not combined suite/fixture bounds, determine functional sizes. Generic visual references, not specifications, universal standards, accessibility or use-clearance certification.',
 personMM:round(model.navigation.person_height*FT*1000),eyeMM:round((model.navigation.person_height-model.navigation.eye_below_crown)*FT*1000),
 inventory,lamps:assets.lamps.map(lamp=>measure(lamp.group))};
const escape=value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const dimensions=part=>`${part.worldXMM} x ${part.worldYMM} x ${part.heightMM}; top ${part.topAboveFFLMM}`;
const rows=inventory.map(item=>`<tr><td>${escape(item.room)}<br><strong>${escape(item.name)}</strong></td><td>${dimensions(item.bounds)}<ul>${item.parts.map(part=>`<li>${escape(part.name)}: ${dimensions(part)}</li>`).join('')}</ul></td><td>${escape(item.finding)}</td></tr>`).join('\n');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Furniture scale and walking review</title>
<style>body{max-width:1200px;margin:32px auto;padding:0 20px;font:15px/1.6 system-ui;color:#293d32}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bac6bb;padding:10px;text-align:left;vertical-align:top}td:nth-child(2){font-size:12px}ul{padding-left:16px}aside{background:#fff1d8;padding:16px}@media(max-width:700px){table,tbody,tr,td{display:block}thead{display:none}tr{margin:18px 0}}</style>
<h1>Furniture scale and free-walking review</h1>
<p>Measured from actual transformed meshes, in millimetres. Each size is world X x world Y x height, followed by its top above finished floor. Rotated furniture swaps plan axes. The1625.6mm person and1524mm eye datum are unchanged.</p>
<aside>Generic furnishings, not a purchasing schedule or installation/ergonomic certification. CAD/IFC, room dimensions, door openings and all furniture footprints/locations remain unchanged. The tall488mm toilet seats, compact792mm shower trays and compact eight-chair dining arrangement need actual product/user trials before depending on comfort or usable clearances.</aside>
<h2>Outcome</h2><p>No feet/metres conversion or wholesale furniture overscale defect was found. The dining seats were actually491mm, not the previously cited460mm reference. They are now460mm, with a matching750mm-high table instead of783mm. Supports and tabletop props follow the revised heights. Other measured dimensions are retained rather than arbitrarily shrinking items to make circulation easier.</p>
<h2>Dimension references, not universal limits</h2><ul>
<li><a href="https://www.ton.eu/en/14-chair-a-timeless-icon">TON14</a>: official indexed dimensions46cm seat,84cm total height; direct text page remains JavaScript-only. Modeled chair is independently authored and not a replica.</li>
<li><a href="https://www.ikea.com/sa/en/p/danderyd-skogsta-table-and-6-chairs-oak-veneer-white-acacia-s69568108/">IKEA DANDERYD/SKOGSTA</a>:180 x90 x75cm six-place example, close to the retained183 x91cm top. This does NOT establish eight-place comfort.</li>
<li><a href="https://www.muuto.com/product/Outline-Soft-Sofa-3-Seater/?configure=true">Muuto Outline Soft3-seater</a>: official indexed220 x84 x78cm,45cm seat; model is a more compact204cm sofa, not that product.</li>
<li><a href="https://www.ikea.com.hk/en/products/mattresses-and-accessories/mattresses/vesteroy-art-20450643">IKEA VESTEROY</a>:150 x200cm mattress example. Model1554 x2027mm is generic queen-like, not an exact catalogue size.</li>
<li><a href="https://www.ikea.com/se/en/p/pax-tyssedal-wardrobe-white-white-glass-s39568096/">IKEA PAX/TYSSEDAL</a>: official indexed175 x60 x201.2cm wardrobe example; the modeled174 x62 x213cm including hardware is a similar full-height furniture family, not that product.</li>
<li><a href="https://www.bosch-home.ie/en/mkt-product/fridges-and-freezers/fridge-freezers/freestanding-fridge-freezers-with-freezer-at-bottom/KGN492LDFG">Bosch KGN492LDFG</a>: official indexed2030 x700 x667mm fridge-freezer example. The retained1920 x747 x762mm placeholder is wider/deeper and shorter, not a selected appliance or approved cabinet installation.</li>
<li><a href="https://pro.duravit.co.uk/pro/content/homepage/products/series/overview/products~402880943a1b6e1b013a1bd20b39003d.uk-en.html?product=680979&amp;ncat=whirltubs">Duravit D-Code</a>: official indexed800 x800mm compact tray example. The modeled792mm tray is approximate; enclosure, waterproofing and usable clearance remain unresolved.</li>
<li>Other cabinetry, bedside units, media/prayer furniture, sanitary fittings, appliances and small decorative props remain explicit unselected illustrations. Their measured component sizes below are disclosed, not asserted to comply with a product standard. Existing <a href="Furniture-reference-note.html">furniture</a> and <a href="Exhaust-reference-note.html">exhaust</a> references retain their stated access/installation limitations.</li></ul>
<h2>Every furnishing group</h2><table><thead><tr><th>Room / group</th><th>Measured bounds and functional components (mm)</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Six nested bedside lamps</h2><ul>${report.lamps.map(lamp=>`<li>${escape(lamp.name)}: ${dimensions(lamp)}mm</li>`).join('')}</ul>
<h2>Walking correction</h2><p>Free W/A/S/D and touch movement no longer automatically turn toward a doorway or cardinal room axis. Cancelling deliberate room navigation also cancels its pending turn without discarding momentum or later user mouse look. Next/Previous/room selection remain deliberate guided navigation. The old50ms frame cap discarded elapsed movement time below20fps (one held-forward second moved1.265ft at10fps versus3.000ft at60fps). The viewer/controller now preserve intervals through100ms, still bounding longer stalls and substepping collision movement at no more than0.15ft. Walls, furniture, frames, closed doors, moving-door sweeps and the existing1.1ft-diameter collision envelope are not bypassed or enlarged.</p>
<p>Floor/step eye height remains exact; there is no vertical camera lag or head bob. This removes reproduced steering/timing defects, not a guarantee of render frame rate on a physical phone. Native architectural files and parked services work are untouched. Re-run <code>node furniture-scale-audit.mjs</code> after changing furnishings to refresh this generated audit.</p></html>`;
mkdirSync(new URL('./review/furniture-walk/',import.meta.url),{recursive:true});
writeFileSync(new URL('./review/furniture-walk/furniture-scale-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
writeFileSync(new URL('./output/Furniture-scale-audit.html',import.meta.url),html);
console.log(`Measured ${inventory.length} furnishing groups and ${report.lamps.length} lamps; saved component inventory and HTML audit.`);
