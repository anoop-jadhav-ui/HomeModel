"""Vector plan and preliminary coordination sheets from the same native-model export."""
import csv
import html
import json
import math
import os


def export_review(model, parameters, output):
    dim=model["dimensions"]
    scale=25
    def xy(x,y):
        return (160+x*scale,1040-y*scale)
    parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1320" viewBox="0 0 1600 1320">',
           '<rect width="1600" height="1320" fill="#fffef9"/>',
           '<style>text{font-family:Arial,sans-serif;fill:#283e31}.small{font-size:13px}.tiny{font-size:11px}</style>',
           '<text x="60" y="46" font-size="26" font-weight="bold">Single-storey home / preliminary architectural coordination</text>',
           '<text x="60" y="77" font-size="19" fill="#984e25">NOT FOR CONSTRUCTION — no certification or permit approval</text>',
           '<text x="60" y="103" font-size="14">Cut +4 ft above finished floor · Local orientation: W rear / E front / S left / N right · Dimensions in feet</text>']
    def line(points,color="#364b3c",width=1.5,dash=None,close=False,fill="none"):
        coords=" ".join("%.2f,%.2f"%xy(*p) for p in points)
        parts.append('<%s points="%s" fill="%s" stroke="%s" stroke-width="%s"%s/>'%
                     ("polygon" if close else "polyline",coords,fill,color,width,
                      (' stroke-dasharray="'+dash+'"') if dash else ""))
    def text(x,y,value,size=13,color="#283e31",rotate=0):
        px,py=xy(x,y)
        parts.append('<text x="%.2f" y="%.2f" font-size="%s" text-anchor="middle" fill="%s"%s>%s</text>'%
                     (px,py,size,color,(' transform="rotate(%g %.2f %.2f)"'%(rotate,px,py)) if rotate else "",html.escape(str(value))))
    for face in model["plan"]["wall_faces"]:
        commands=[]
        for loop in face["loops"]:
            commands.extend(("M" if i==0 else "L")+"%.2f %.2f"%xy(*p) for i,p in enumerate(loop))
            commands.append("Z")
        parts.append('<path d="%s" fill="#46544c" fill-rule="evenodd"/>'%" ".join(commands))
    for item in model["plan"]["openings"]:
        if item["kind"]=="door":
            continue
        angle=math.radians(item["angle_degrees"])
        u=(math.cos(angle),math.sin(angle))
        normal=(-u[1],u[0])
        def pos(a,n):
            return (item["x"]+u[0]*a+normal[0]*n,item["y"]+u[1]*a+normal[1]*n)
        w,t=item["width"]/2,item["wall_thickness"]/2
        line([pos(-w,-t),pos(w,-t),pos(w,t),pos(-w,t)],"#087e9d",2,
             "4 3" if item["kind"]=="vent" else None,True)
        line([pos(-w,0),pos(w,0)],"#087e9d",1.3,"4 3" if item["kind"]=="vent" else None)
        x,y=item["x"],item["y"]
        if item["host"]=="Front E": y-=1
        elif item["host"]=="Rear W": y+=.8
        elif item["host"]=="Left S": x-=1
        else: x+=1
        text(x,y,item["mark"],12,"#087e9d")
    for door in model["doorways"]:
        a=math.radians(door["angle_degrees"])
        u=(math.cos(a),math.sin(a))
        s=-1 if door["hinge"]=="start" else 1
        hinge=(door["x"]+u[0]*s*door["width"]/2,door["y"]+u[1]*s*door["width"]/2)
        closed=(hinge[0]-u[0]*s*door["width"],hinge[1]-u[1]*s*door["width"])
        opened=(hinge[0]+door["opens_to"][0]*door["width"],hinge[1]+door["opens_to"][1]*door["width"])
        start=math.atan2(closed[1]-hinge[1],closed[0]-hinge[0])
        end=math.atan2(door["opens_to"][1],door["opens_to"][0])
        sweep=math.atan2(math.sin(end-start),math.cos(end-start))
        arc=[(hinge[0]+math.cos(start+sweep*i/24)*door["width"],
              hinge[1]+math.sin(start+sweep*i/24)*door["width"]) for i in range(25)]
        line(arc,"#9d5322",1.6,"5 4")
        line([hinge,opened],"#813e16",2.3)
        text(door["x"]-door["opens_to"][0]*.9,door["y"]-door["opens_to"][1]*.9,door["mark"],12,"#813e16")
    for item in model["passages"]:
        a=math.radians(item["angle_degrees"])
        dx,dy=math.cos(a)*item["width"]/2,math.sin(a)*item["width"]/2
        line([(item["x"]-dx,item["y"]-dy),(item["x"]+dx,item["y"]+dy)],"#267252",1.6,"5 4")
        text(item["x"]+(1 if dy else 0),item["y"]+(0 if dy else .8),"OPEN %g ft"%item["width"],12,"#267252",-90 if dy else 0)
    for room in model["rooms"]:
        compact=room["width"]<6
        label={"Wash_point":"Wash","Common_bath":"Bath","Attached_bath":"Bath (att.)"}.get(room["name"],room["name"].replace("_"," "))
        cx,cy=room["x"]+room["width"]/2,room["y"]+room["depth"]*(.76 if compact else .53)
        text(cx,cy,label,11 if compact else 14)
        text(cx,cy-.65,"%g x %g"%(round(room["width"],2),round(room["depth"],2)),10 if compact else 12)
    def dimension(a,b,label,vertical=False):
        line([a,b],"#657166",1)
        for x,y in (a,b):
            line([(x-.18,y-.18),(x+.18,y+.18)],"#657166",1)
        text((a[0]+b[0])/2,(a[1]+b[1])/2+.15,label,13,"#344b3b",-90 if vertical else 0)
    dimension((0,-3),(dim["width"],-3),"%g ft exterior"%dim["width"])
    dimension((-3,0),(-3,dim["depth"]),"%g ft exterior"%dim["depth"],True)
    for name in ("Kitchen","Hall","Bedroom_front_right"):
        r=next(r for r in model["rooms"] if r["name"]==name)
        dimension((r["x"],dim["depth"]+3),(r["x"]+r["width"],dim["depth"]+3),"%g ft clear"%r["width"])
    for name in ("Kitchen","Prayer","Bedroom_rear_left"):
        r=next(r for r in model["rooms"] if r["name"]==name)
        dimension((dim["width"]+3,r["y"]),(dim["width"]+3,r["y"]+r["depth"]),"%g ft clear"%r["depth"],True)
    parts.extend([
        '<text x="60" y="1170" class="small">Brown: door leaves; dashed arcs: ASSUMED handing. Blue: windows; dashed cyan: vents above the cut. Green: OPEN passages.</text>',
        '<text x="60" y="1196" class="small">Main clear bays total 40 x 32 ft; assumed 9-inch perimeter / 4.5-inch partitions enlarge the exterior to 42.25 x 34.25 ft.</text>',
        '<text x="60" y="1222" class="small">Unresolved: prayer 8x8 vs written 8x10; rear 4+3+4+5 ft service grid excludes partition allowance; all levels/roof/opening offsets provisional.</text>',
        '<text x="60" y="1248" class="small">Raised floor +4 ft, wall height 10 ft assumed from sketch. Foundation, structural supports, stairs/ramp, drainage, code and MEP NOT DESIGNED.</text>',
        '<text x="60" y="1274" class="small">Do not scale for setting out. Confirm dimensions and site conditions with qualified local professionals. Furniture visualization is illustrative only.</text>',
        '</svg>'])
    with open(os.path.join(output,"architectural-plan.svg"),"w",encoding="utf-8") as f:
        f.write("\n".join(parts))
    rows=[]
    with open(os.path.join(output,"opening-schedule.csv"),"w",newline="",encoding="utf-8") as f:
        writer=csv.writer(f)
        writer.writerow(["Mark","Width_ft","Height_ft","Count","Sill_above_FFL_ft","Status"])
        for mark,spec in parameters["opening_types"].items():
            sill=0 if mark.startswith("D") else parameters["vent_sill"] if mark.startswith("V") else parameters["window_sill"]
            writer.writerow([mark,spec["width"],spec["height"],spec["count"],sill,"PRELIMINARY - verify site, frame clearances and handing"])
            rows.append("<tr><td>%s</td><td>%g</td><td>%g</td><td>%d</td><td>%g</td></tr>"%
                        (mark,spec["width"],spec["height"],spec["count"],sill))
    document='''<!doctype html><html lang="en"><meta charset="utf-8"><title>Jadhav Nivaas | Preliminary coordination package</title>
<style>body{font:15px system-ui;color:#263c2d;max-width:1250px;margin:35px auto;padding:0 24px;line-height:1.55}h1{font-size:28px}.warning{background:#fff0d6;border-left:5px solid #aa5a26;padding:16px}table{border-collapse:collapse;width:100%%}td,th{border:1px solid #bbc6b8;text-align:left;padding:8px}img{width:100%%}h2{margin-top:32px}@media print{body{max-width:none;margin:0}a{color:inherit}@page{size:A3;margin:15mm}.break{break-before:page}}</style>
<h1>Jadhav Nivaas / preliminary coordination package</h1>
<div class="warning"><b>NOT FOR CONSTRUCTION. Not certified, permit-ready or a structural design.</b> This is a dimensioned conceptual layout and opening schedule derived from the editable FreeCAD model. Increased visual detail does not establish construction readiness.</div>
<p>Confirmed scope: ground floor only; the raised roof element is a ventilation/light monitor, not another storey. No existing site/engineering documents have been supplied. Site jurisdiction/location has been deferred.</p>
<h2>Architectural layout</h2><p>Room/grid extents are not external dimensions. Main clear bays total 40 x 32 ft; assumed walls give 42.25 x 34.25 ft exterior. Units: feet. Exact setting-out dimensions are provisional.</p>
<p>By user direction, the hall/dining connection is open across the full 16-ft central bay, with both short returns and the upper wall/lintel removed. Flanking vertical partitions and neighboring D1 hosts remain. This conceptual revision is not demolition advice; structural support/load paths remain unverified.</p>
<img src="architectural-plan.svg" alt="Dimensioned cut plan with door swings, windows, vents and clear room sizes">
<p><a href="architectural-plan.svg">Open vector drawing</a> · <a href="Home.FCStd">Editable master</a> · <a href="Home.ifc">IFC</a> · <a href="index.html">Furnished visualization</a></p>
<h2 class="break">Preliminary opening schedule</h2><table><thead><tr><th>Mark</th><th>Width (ft)</th><th>Height (ft)</th><th>Count</th><th>Sill above FFL (ft)</th></tr></thead><tbody>%s</tbody></table>
<p><a href="opening-schedule.csv">Download CSV</a>. Sizes describe model opening extents, not certified clear passage or manufactured frame dimensions. Door handing is assumed for visualization. Window positions and sills require confirmation. Monitor vents are additional unscheduled conceptual openings.</p>
<p><b>User-directed vent revision:</b> all six existing bathroom/toilet ventilation openings are now 1 ft 6 in wide by 2 ft high. V/V1 marks and counts are retained for traceability; the three former V openings were reduced from 2 ft wide by 2 ft 6 in high. Locations, ordinary W/W1/W2 windows and the separate monitor assemblies are unchanged. Ventilation adequacy has not been assessed.</p>
<h2>Screened roof monitor concept</h2><p>The retained hipped roof and central ventilation/light monitor now have a Maharashtrian wada / Konkan-inspired timber-louver band with a recessed illustrative metal grille, rather than a wide-open band. These elements are present in the native FreeCAD model, IFC and exported visualization. They are not a burglar-proofing claim or a construction detail. <a href="Roof-reference-note.html">References, interpretation and unresolved specifications</a>.</p>
<h2>Resolve the plan before detailed design</h2><ul>
<li>Prayer: plan says 8x8 ft; written list appears 8x10 ft. Current model follows 8x8.</li>
<li>Rear service widths 4+3+4+5 ft already total the 16-ft central bay. After partitions, clear widths are 3.8125, 2.625, 3.625 and 4.8125 ft. Confirm workable fixture/use clearances and revise through the designer if necessary.</li>
<li>Confirm 4-ft raised floor and 10-ft wall interpretation, all opening corner offsets/sills/handing and the monitor/roof dimensions.</li>
<li>The 4-ft plinth currently has no designed stair, accessible approach, landings or guards. A rendered building must not be used as evidence of safe access.</li>
</ul>
<h2>Required inputs and professional coordination</h2><table><tr><th>Discipline / input</th><th>Outstanding before construction issue</th></tr>
<tr><td>Site / approvals</td><td>Location and jurisdiction; measured boundary/topographic survey; levels, setbacks, title/approval requirements and locally applicable regulations.</td></tr>
<tr><td>Ground / structure</td><td>Geotechnical investigation; qualified structural design of foundations, supports, slabs, walls, roof/monitor and connections for actual site actions. No soil capacity, member sizes, reinforcement or load paths are certified here.</td></tr>
<tr><td>Architecture / safety</td><td>Resolve conflicting dimensions, wet-room usability, room access, egress, access stairs/ramp/guards, weathering, ventilation, energy/fire/accessibility requirements as applicable locally.</td></tr>
<tr><td>MEP</td><td>Water, waste/vent, stormwater falls/discharge, electrical circuits/protection, lighting and any mechanical ventilation; coordinate fixtures and service routes with structure. No sewer or concealed plumbing routes are invented.</td></tr>
<tr><td>Issue control</td><td>Coordinated signed drawings/specifications, material selections, approved setting-out dimensions and qualified local review/approvals. IFC geometry integrity is not engineering approval.</td></tr></table>
<p>Furniture and fixture assets are authored illustrative geometry, not specified products. Their room fit and assumed door-sweep checks are not a code, accessibility, egress or maintenance-clearance assessment. Native FreeCAD/IFC remains the architectural geometry master.</p>
<p><a href="Guide.md">Source, editing workflow and all assumptions</a></p></html>'''%"".join(rows)
    with open(os.path.join(output,"Preliminary-coordination.html"),"w",encoding="utf-8") as f:
        f.write(document)


if __name__=="__main__":
    root=os.path.dirname(os.path.abspath(__file__))
    raw=open(os.path.join(root,"output","review-data.js"),encoding="utf-8").read()
    export_review(json.loads(raw[len("window.HOME_MODEL="):-1]),
                  json.load(open(os.path.join(root,"parameters.json"),encoding="utf-8")),
                  os.path.join(root,"output"))
