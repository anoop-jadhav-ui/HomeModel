"""Run with the supplied FreeCAD macro; all authoring dimensions are in parameters.json."""
import json
import math
import os
import traceback
import runpy
from collections import Counter

import FreeCAD as App
import Part
import Arch
import Draft

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "output")
os.makedirs(OUT, exist_ok=True)
FT = 304.8
P = json.load(open(os.path.join(ROOT, "parameters.json"), encoding="utf-8"))
V = App.Vector


def build():
    if App.ActiveDocument:
        App.closeDocument(App.ActiveDocument.Name)
    doc = App.newDocument("SketchHome")
    sheet = doc.addObject("Spreadsheet::Sheet", "Parameters")
    sheet.Label = "Parameters (ft) - edit JSON then regenerate"
    sheet.set("A1", "Parameter")
    sheet.set("B1", "Value (feet unless stated)")
    for row, (key, value) in enumerate(P.items(), 2):
        sheet.set("A%d" % row, key)
        sheet.set("B%d" % row, str(value))
    site = Arch.makeSite(name="Site")
    site.Label = "Concept site - E front / N right"
    building = Arch.makeBuilding(name="Home")
    site.addObject(building)
    storey = Arch.makeFloor(name="GroundFloor")
    storey.Label = "Ground floor - raised plinth"
    building.addObject(storey)
    groups = {}
    for name in ("Walls", "Openings", "Floors", "Roof", "Spaces"):
        groups[name] = doc.addObject("App::DocumentObjectGroup", name)
        storey.addObject(groups[name])
    e, t = P["external_wall"], P["partition_wall"]
    a = e + P["left_bay"]
    b = a + t + P["center_bay"]
    width = b + t + P["right_bay"] + e
    c = e + P["front_bay"]
    d = c + t + P["middle_bay"]
    depth = d + t + P["rear_bay"] + e
    floor_z = P["plinth_height"]
    walltop = floor_z + P["wall_height"]
    wallmap, records = {}, []
    palette = {"Walls": (0.90, 0.84, 0.70), "Floors": (0.62, 0.65, 0.63),
               "Roof": (0.53, 0.20, 0.12), "Openings": (0.30, 0.60, 0.76)}

    def metadata(obj, role, detail):
        obj.addProperty("App::PropertyString", "DesignNote", "Concept")
        obj.DesignNote = detail
        obj.addProperty("App::PropertyString", "ReviewRole", "Concept")
        obj.ReviewRole = role
        return obj

    def wall(name, x1, y1, x2, y2, thick=t, height=None, z=None, group="Walls"):
        base = Draft.make_wire([V(x1*FT, y1*FT, (floor_z if z is None else z)*FT),
                                V(x2*FT, y2*FT, (floor_z if z is None else z)*FT)])
        base.Label = name + " baseline"
        obj = Arch.makeWall(base, width=thick*FT,
                            height=(P["wall_height"] if height is None else height)*FT,
                            align="Center", name=name)
        obj.Label = name.replace("_", " ")
        metadata(obj, group, "Concept only; no structural sizing.")
        groups[group].addObject(obj)
        base.ViewObject.Visibility = False
        obj.ViewObject.ShapeColor = palette[group]
        wallmap[name] = obj
        return obj

    # Grid dimensions are clear main bays. Wall thickness is additional.
    wall("Front_E", e/2, e/2, width-e/2, e/2, e)
    wall("Rear_W", e/2, depth-e/2, width-e/2, depth-e/2, e)
    wall("Left_S", e/2, e, e/2, depth-e, e)
    wall("Right_N", width-e/2, e, width-e/2, depth-e, e)
    wall("Kitchen_Hall", a+t/2, e, a+t/2, c+t/2)
    wall("Hall_FrontBedroom", b+t/2, e, b+t/2, c+t/2)
    wall("Kitchen_Middle", e, c+t/2, a+t/2, c+t/2)
    wall("FrontBedroom_Middle", b+t/2, c+t/2, width-e, c+t/2)
    wall("Hall_Dining", a+t/2, c+t/2, b+t/2, c+t/2)
    wall("RearBedroom_Left_Front", e, d+t/2, a+t/2, d+t/2)
    wall("RearBedroom_Right_Front", b+t/2, d+t/2, width-e, d+t/2)
    wall("RearBedroom_Left_Inside", a+t/2, d+t/2, a+t/2, depth-e)
    wall("RearBedroom_Right_Inside", b+t/2, d+t/2, b+t/2, depth-e)
    # The prayer-room edge is marked OPEN, with no side wall or door in the sketch.
    px = e + P["prayer_width"]
    rx = width-e-P["right_bath_width"]
    wall("RightBath_Inside", rx-t/2, c+t, rx-t/2, d)
    svc_x = a+t
    rear_inner = depth-e
    svc_bottom = rear_inner-P["rear_small_service_depth"]
    bath_bottom = rear_inner-P["rear_attached_bath_depth"]
    bounds = [svc_x]
    for bay in P["rear_service_grid_widths"]:
        bounds.append(bounds[-1]+bay)
    if abs(bounds[-1]-b) > 1e-7:
        raise ValueError("Rear service grid widths must sum to center_bay.")
    for i, x in enumerate(bounds[1:-1], 1):
        bottom = bath_bottom if i == 3 else svc_bottom
        wall("Service_Partition_%d" % i, x, bottom-t/2, x, rear_inner)
    wall("Service_Front", bounds[1], svc_bottom-t/2, bounds[3], svc_bottom-t/2)
    wall("RearBath_Front", bounds[3], bath_bottom-t/2, b, bath_bottom-t/2)

    opening_counts = Counter()
    doorways = []
    plan_openings = []
    def opening(code, host, x, y, angle=0, sill=None, width_override=None, label=None,
                connects=None):
        """Sketch plane local X horizontal, local Y vertical; native ArchWindow cuts host."""
        spec = P["opening_types"].get(code, {})
        ow = spec.get("width", width_override)
        oh = spec.get("height", 8)
        if width_override is not None:
            ow = width_override
        isdoor = code.startswith("D") or code == "OPEN"
        sill = (0 if isdoor else P["vent_sill"] if code.startswith("V") else P["window_sill"]) if sill is None else sill
        name = label or "%s_%02d_%s" % (code, opening_counts[code]+1, host)
        preset = "Opening only" if code == "OPEN" else "Simple door" if isdoor else "Fixed"
        obj = Arch.makeWindowPreset(preset,
                                   width=ow*FT, height=oh*FT,
                                   h1=P["frame_width"]*FT, h2=P["frame_width"]*FT,
                                   h3=0, w1=P["frame_depth"]*FT,
                                   w2=P["frame_secondary_width"]*FT, o1=0, o2=0)
        if obj is None:
            raise RuntimeError("FreeCAD could not create window preset " + name)
        # A preset's placement is its base sketch placement, not the derived object.
        rot = App.Rotation(V(0,0,1), angle).multiply(App.Rotation(V(1,0,0), 90))
        along = App.Rotation(V(0,0,1), angle).multVec(V(ow*FT/2,0,0))
        obj.Base.Placement = App.Placement(V(x*FT,y*FT,(floor_z+sill)*FT)-along, rot)
        obj.Label = name
        obj.Hosts = [wallmap[host]]
        obj.HoleDepth = (e+0.2)*FT
        metadata(obj, "Openings", "Placement assumed; scheduled size %s. Not a certified opening detail." % code)
        if code.startswith("D"):
            obj.DesignNote = ("Wall and qualitative location follow the drawn door gap. "
                              "Exact jamb offset and hinge/swing are unconfirmed; leaf shown closed.")
            obj.addProperty("App::PropertyString", "DoorMark", "Concept")
            obj.DoorMark = code
            obj.addProperty("App::PropertyString", "ConnectedSpaces", "Concept")
            obj.ConnectedSpaces = " <-> ".join(connects)
            doorways.append({"name":name, "mark":code, "host":host.replace("_"," "),
                             "x":x, "y":y, "angle_degrees":angle,
                             "width":ow, "height":oh, "connects":list(connects),
                             "swing_assumed":True, **P["plan_swing_assumptions"][name]})
        groups["Openings"].addObject(obj)
        obj.ViewObject.ShapeColor = palette["Openings"]
        obj.Base.ViewObject.Visibility = False
        if code == "OPEN":
            obj.ViewObject.Visibility = False
        else:
            opening_counts[code] += 1
            plan_openings.append({"name":name, "mark":code, "host":wallmap[host].Label,
                                  "kind":"door" if code.startswith("D") else "vent" if code.startswith("V") else "window",
                                  "x":x, "y":y, "angle_degrees":angle, "width":ow,
                                  "height":oh, "sill":sill,
                                  "wall_thickness":wallmap[host].Width.Value/FT})
        return obj

    midx = (a+t+b)/2
    opening("D", "Front_E", midx, e/2, connects=("Outside east", "Hall"))
    for x in (a+t+2, b-2):
        opening("W2", "Front_E", x, e/2)
    for x in (e+6, width-e-6):
        opening("W", "Front_E", x, e/2)
        opening("W", "Rear_W", x, depth-e/2)
    for side, x in (("Left_S", e/2), ("Right_N", width-e/2)):
        for y in (e+6, rear_inner-6):
            opening("W", side, x, y, 90)
    opening("W1", "Left_S", e/2, c+t+P["middle_bay"]/2, 90)
    jamb = P["door_corner_clearance"]
    d1half = P["opening_types"]["D1"]["width"]/2
    d2half = P["opening_types"]["D2"]["width"]/2
    # All four D1 gaps lie in horizontal room-to-middle-strip walls in the original.
    opening("D1", "Kitchen_Middle", a-jamb-d1half, c+t/2,
            connects=("Kitchen", "Left middle circulation"))
    opening("D1", "FrontBedroom_Middle", b+t+jamb+d1half, c+t/2,
            connects=("Bedroom front right", "Right middle circulation"))
    opening("D1", "RearBedroom_Left_Front", a-jamb-d1half, d+t/2,
            connects=("Bedroom rear left", "Left middle circulation"))
    opening("D1", "RearBedroom_Right_Front", b+t+jamb+d1half, d+t/2,
            connects=("Bedroom rear right", "Right middle circulation"))
    opening("D2", "FrontBedroom_Middle", rx+jamb+d2half, c+t/2,
            connects=("Bath right", "Bedroom front right"))
    for i in (1, 2):
        opening("D2", "Service_Front", (bounds[i]+bounds[i+1])/2, svc_bottom-t/2,
                connects=(("WC" if i == 1 else "Common bath"), "Central circulation"))
    opening("D2", "RearBedroom_Right_Inside", b+t/2, bath_bottom+jamb+d2half, 90,
            connects=("Attached bath", "Bedroom rear right"))
    opening("OPEN", "Hall_Dining", midx, c+t/2,
            width_override=P["hall_opening_width"], label="Hall to dining - 8ft open portal")
    for i, code in enumerate(("V", "V1", "V1", "V1")):
        opening(code, "Rear_W", (bounds[i]+bounds[i+1])/2, depth-e/2)
    for y in (c+t+2, d-2):
        opening("V", "Right_N", width-e/2, y, 90)
    expected = {key: value["count"] for key,value in P["opening_types"].items()}
    if dict(opening_counts) != expected:
        raise ValueError("Opening schedule mismatch: %r vs %r" % (opening_counts, expected))

    def component(name, shape, ifctype, group, note):
        base = doc.addObject("PartDesign::Feature", name+"Geometry")
        base.Shape = shape
        obj = Arch.makeComponent(base, name=name)
        obj.Label = name.replace("_", " ")
        obj.IfcType = ifctype
        metadata(obj, group, note)
        groups[group].addObject(obj)
        obj.ViewObject.ShapeColor = palette.get(group, (0.7,0.7,0.7))
        base.ViewObject.Visibility = False
        return obj

    slab = Part.makeBox(width*FT, depth*FT, P["floor_thickness"]*FT,
                        V(0,0,(floor_z-P["floor_thickness"])*FT))
    component("Ground_Floor_Slab", slab, "Slab", "Floors", "Thickness assumed; slab not engineered.")
    plinth = Part.makeBox(width*FT,depth*FT,(floor_z-P["floor_thickness"])*FT)
    component("Raised_Plinth_Concept",plinth,"Building Element Proxy","Floors",
              "Solid visual envelope only, NOT foundation/fill design. 4ft elevation interpreted from sketch.")

    # Labels and zones are schematic review geometry, not habitable-area certification.
    room_specs = [
        ("Kitchen",e,e,a,c), ("Hall",a+t,e,b,c),
        ("Bedroom_front_right",b+t,e,width-e,c),
        ("Prayer",e,c+t,px,d),
        ("Bath_right",rx,c+t,width-e,d),
        ("Bedroom_rear_left",e,d+t,a,rear_inner),
        ("Bedroom_rear_right",b+t,d+t,width-e,rear_inner),
        ("Dining_central_zone",svc_x,c+t,b,bath_bottom-t),
    ]
    for i, label in enumerate(("Wash_point", "WC", "Common_bath", "Attached_bath")):
        x1 = bounds[i] + (t/2 if i else 0)
        x2 = bounds[i+1] - (t/2 if i < 3 else 0)
        y1 = bath_bottom if i == 3 else svc_bottom
        room_specs.append((label,x1,y1,x2,rear_inner))
    for label,x1,y1,x2,y2 in room_specs:
        records.append({"name":label,"x":x1,"y":y1,"width":x2-x1,"depth":y2-y1})
        boundary = doc.addObject("Part::Box", label+"Boundary")
        boundary.Length = (x2-x1)*FT
        boundary.Width = (y2-y1)*FT
        boundary.Height = P["wall_height"]*FT
        boundary.Placement.Base = V(x1*FT,y1*FT,floor_z*FT)
        space = Arch.makeSpace(boundary, name=label)
        space.Label = label.replace("_"," ")
        boundary.ViewObject.Visibility = False
        metadata(space, "Spaces", "Schematic zone; dining zone is not a closed-room measurement.")
        groups["Spaces"].addObject(space)
        space.ViewObject.Visibility = False

    over = P["roof_overhang"]
    mx1, mx2 = (width-P["monitor_width"])/2, (width+P["monitor_width"])/2
    my1, my2 = (depth-P["monitor_depth"])/2, (depth+P["monitor_depth"])/2
    runx, runy = mx1+over, my1+over
    if abs(runx-runy) > 0.01:
        raise ValueError("Equal-pitch hipped monitor roof requires matched X/Y runs; adjust monitor dimensions.")
    rise = runx*math.tan(math.radians(P["roof_pitch_degrees"]))
    mz = walltop+rise
    outer = [(-over,-over,walltop),(width+over,-over,walltop),
             (width+over,depth+over,walltop),(-over,depth+over,walltop)]
    inner = [(mx1,my1,mz),(mx2,my1,mz),(mx2,my2,mz),(mx1,my2,mz)]

    def panel(name, points):
        wire = Part.makePolygon([V(*(n*FT for n in p)) for p in points+[points[0]]])
        shape = Part.Face(wire).extrude(V(0,0,P["roof_thickness"]*FT))
        return component(name,shape,"Roof","Roof",
                         "Parametric-source roof panel; assumed pitch/overhang. No truss or drainage design.")

    for i, side in enumerate(("Front","Right","Rear","Left")):
        j=(i+1)%4
        panel("Hip_Roof_"+side,[outer[i],outer[j],inner[j],inner[i]])
    # Four native wall strips make an open lantern ring: light/air gap is conceptual.
    mh = P["monitor_height"]
    curb = P["monitor_curb_height"]
    member = P["monitor_member_width"]
    for i in range(4):
        j=(i+1)%4
        wall("Monitor_Curb_%d"%i, *inner[i][:2], *inner[j][:2],
             thick=member,height=curb,z=mz,group="Roof")
    # Native window objects are intentionally not counted as scheduled room vents.
    # Corner posts and open clerestory band represent unspecified ventilation, not an upper floor.
    for i,(x,y,_) in enumerate(inner):
        shape=Part.makeBox(member*FT,member*FT,mh*FT,V((x-member/2)*FT,(y-member/2)*FT,mz*FT))
        component("Monitor_Corner_%d"%i,shape,"Member","Roof","Unverified conceptual monitor framing.")
    co=P["monitor_cap_overhang"]
    capz=mz+mh
    cap=[(mx1-co,my1-co,capz),(mx2+co,my1-co,capz),
         (mx2+co,my2+co,capz),(mx1-co,my2+co,capz)]
    half=(P["monitor_depth"]+2*co)/2
    ridge1=(mx1-co+half,(my1+my2)/2,capz+P["monitor_cap_rise"])
    ridge2=(mx2+co-half,(my1+my2)/2,capz+P["monitor_cap_rise"])
    panel("Monitor_Cap_Front",[cap[0],cap[1],ridge2,ridge1])
    panel("Monitor_Cap_Right",[cap[1],cap[2],ridge2])
    panel("Monitor_Cap_Rear",[cap[2],cap[3],ridge1,ridge2])
    panel("Monitor_Cap_Left",[cap[3],cap[0],ridge1])
    doc.recompute()
    for obj in doc.Objects:
        if hasattr(obj,"Base") and obj.Base and hasattr(obj.Base,"ViewObject"):
            obj.Base.ViewObject.Visibility=False
    solid_objects = []
    invalid = []
    for group in ("Walls","Openings","Floors","Roof"):
        for obj in groups[group].Group:
            if obj.Label.startswith("Hall to dining"):
                continue
            if not hasattr(obj,"Shape") or obj.Shape.isNull() or not obj.Shape.isValid():
                invalid.append(obj.Label)
            elif obj.Shape.Volume <= 0:
                invalid.append(obj.Label+" (zero volume)")
            else:
                solid_objects.append(obj)
    if invalid:
        raise RuntimeError("Invalid/empty model objects: "+", ".join(invalid))
    for door in doorways:
        host = next(obj for obj in groups["Walls"].Group if obj.Label == door["host"])
        probe = Part.makeBox(.05*FT,.05*FT,.05*FT,
                             V((door["x"]-.025)*FT, (door["y"]-.025)*FT,
                               (floor_z+door["height"]/2)*FT))
        if host.Shape.common(probe).Volume > 1e-4:
            raise RuntimeError("Doorway does not cut its host wall: "+door["name"])
    # Native cut volume provides a geometry check independent of the schedule counter.
    frontvolume = wallmap["Front_E"].Shape.Volume/FT**3
    expectedfront = (width-e)*e*P["wall_height"] - e*(4*7+2*3*4+2*6*4)
    if abs(frontvolume-expectedfront)>0.05:
        raise RuntimeError("Front wall openings were not cut correctly: %.4f vs %.4f ft3"%(frontvolume,expectedfront))
    plan_z=(floor_z+P["plan_cut_height"])*FT
    cutter=Part.makeBox((width+2)*FT,(depth+2)*FT,.01*FT,V(-FT,-FT,plan_z))
    cut_faces=[]
    plan_wall_faces=[]
    for wallobj in groups["Walls"].Group:
        sliced=wallobj.Shape.common(cutter)
        for face in sliced.Faces:
            if face.normalAt(0,0).z>.99:
                cut_faces.append(face)
                plan_wall_faces.append({"wall":wallobj.Label,
                                        "loops":[[[point.x/FT,point.y/FT] for point in wire.discretize(Deflection=.1)]
                                                 for wire in face.Wires]})
    if not cut_faces:
        raise RuntimeError("Plan cut generated no wall faces")
    passages=[{"name":"Hall OPEN","x":midx,"y":c+t/2,"width":P["hall_opening_width"],"angle_degrees":0},
              {"name":"Prayer OPEN","x":px,"y":(c+t+d)/2,"width":P["middle_bay"],"angle_degrees":90}]
    plan_group=doc.addObject("App::DocumentObjectGroup","PlanReview")
    plan_group.Label="Plan review - cut +%gft FFL; swings ASSUMED"%P["plan_cut_height"]

    def plan_feature(name, shapes, color, dashed=False):
        obj=doc.addObject("Part::Feature",name)
        obj.Shape=Part.makeCompound(shapes)
        obj.ViewObject.ShapeColor=color
        obj.ViewObject.LineColor=color
        obj.ViewObject.LineWidth=2
        if dashed:
            obj.ViewObject.DrawStyle="Dashed"
        obj.addProperty("App::PropertyString","DesignNote","Concept")
        obj.DesignNote="2D review only; door swing handing ASSUMED, not verified or construction-approved."
        plan_group.addObject(obj)
        return obj

    plan_feature("PlanCutWalls",cut_faces,(.25,.30,.28))
    door_lines=[]
    swing_arcs=[]
    for door in doorways:
        angle=math.radians(door["angle_degrees"])
        along=V(math.cos(angle),math.sin(angle),0)
        normal=V(*door["opens_to"],0)
        if abs(along.dot(normal))>1e-6 or abs(normal.Length-1)>1e-6:
            raise ValueError("Plan swing must be a unit direction perpendicular to its door: "+door["name"])
        sign=-1 if door["hinge"]=="start" else 1
        hinge=V(door["x"]*FT,door["y"]*FT,plan_z+.04*FT)+along*(sign*door["width"]*FT/2)
        closed=hinge-along*(sign*door["width"]*FT)
        opened=hinge+normal*(door["width"]*FT)
        door_lines.append(Part.makeLine(hinge,opened))
        start=math.atan2(closed.y-hinge.y,closed.x-hinge.x)
        end=math.atan2(normal.y,normal.x)
        sweep=math.atan2(math.sin(end-start),math.cos(end-start))
        middle=hinge+V(math.cos(start+sweep/2),math.sin(start+sweep/2),0)*(door["width"]*FT)
        swing_arcs.append(Part.Arc(closed,middle,opened).toShape())
    plan_feature("PlanDoorLeaves_ASSUMED",door_lines,(.60,.26,.08))
    plan_feature("PlanDoorSwings_ASSUMED",swing_arcs,(.60,.26,.08),True)
    window_lines=[]
    vent_lines=[]
    for item in plan_openings:
        if item["kind"]=="door":
            continue
        angle=math.radians(item["angle_degrees"])
        along=V(math.cos(angle),math.sin(angle),0)
        normal=V(-along.y,along.x,0)
        center=V(item["x"]*FT,item["y"]*FT,plan_z+.04*FT)
        lines=vent_lines if item["kind"]=="vent" else window_lines
        for offset in (-item["wall_thickness"]/2,0,item["wall_thickness"]/2):
            pos=center+normal*(offset*FT)
            lines.append(Part.makeLine(pos-along*(item["width"]*FT/2),pos+along*(item["width"]*FT/2)))
        for sign in (-1,1):
            pos=center+along*(sign*item["width"]*FT/2)
            lines.append(Part.makeLine(pos-normal*(item["wall_thickness"]*FT/2),
                                       pos+normal*(item["wall_thickness"]*FT/2)))
    plan_feature("PlanWindowSymbols",window_lines,(.04,.43,.58))
    plan_feature("PlanHighVents_DASHED",vent_lines,(.04,.43,.58),True)
    open_lines=[]
    for item in passages:
        angle=math.radians(item["angle_degrees"])
        delta=V(math.cos(angle),math.sin(angle),0)*(item["width"]*FT/2)
        center=V(item["x"]*FT,item["y"]*FT,plan_z+.04*FT)
        open_lines.append(Part.makeLine(center-delta,center+delta))
    plan_feature("PlanOPENPassages",open_lines,(.08,.43,.27),True)
    plan_group.ViewObject.Visibility=False
    doc.recompute()
    if App.GuiUp:
        import FreeCADGui as Gui
        Gui.activeDocument().activeView().viewAxonometric()
        Gui.activeDocument().activeView().fitAll()
    native_path=os.path.join(OUT,"Home.FCStd")
    doc.recompute()
    doc.saveAs(native_path)
    mesh_records=[]
    for obj in solid_objects:
        verts,tris=obj.Shape.tessellate(15)
        mesh_records.append({"name":obj.Label,"group":obj.ReviewRole,
                             "color":list(obj.ViewObject.ShapeColor),
                             "vertices":[[v.x/FT,v.y/FT,v.z/FT] for v in verts],
                             "triangles":tris})
    review={"dimensions":{"width":width,"depth":depth,"grid_width":40,"grid_depth":32,
                           "floor_elevation":floor_z,"wall_height":P["wall_height"],
                           "monitor_base":mz,"overall_height":capz+P["monitor_cap_rise"]+P["roof_thickness"]},
            "rooms":records,"objects":mesh_records,"opening_counts":dict(opening_counts),
            "doorways":doorways,"passages":passages,
            "plan":{"cut_height":P["plan_cut_height"],"wall_faces":plan_wall_faces,"openings":plan_openings,
                    "swing_note":"All hinge sides and swing directions are ASSUMED; not confirmed by the sketch."}}
    with open(os.path.join(OUT,"review-data.js"),"w",encoding="utf-8") as f:
        f.write("window.HOME_MODEL="+json.dumps(review,separators=(",",":"))+";")
    runpy.run_path(os.path.join(ROOT,"export_plan.py"))["export_review"](review,P,OUT)
    report={"native_file":native_path,"valid_solid_objects":len(solid_objects),
            "invalid_objects":invalid,"opening_counts":dict(opening_counts),
            "dimensions_ft":review["dimensions"],"front_wall_cut_volume_ft3":frontvolume,
            "rooms":records,"doorways":doorways,"door_host_cut_probes":"passed",
            "plan_cut_wall_faces":len(plan_wall_faces),
            "plan_symbols":dict(Counter(obj["kind"] for obj in plan_openings)),"ifc_status":"not attempted"}
    try:
        from importers import importIFC
        import ifcopenshell
        ifcpath=os.path.join(OUT,"Home.ifc")
        importIFC.export([building],ifcpath)
        if not os.path.isfile(ifcpath):
            raise RuntimeError("IFC exporter returned without creating a file")
        exported=ifcopenshell.open(ifcpath)
        import ifcopenshell.util.unit
        import ifcopenshell.guid
        unit_scale=ifcopenshell.util.unit.calculate_unit_scale(exported)
        voids={obj.Name:obj for obj in exported.by_type("IfcOpeningElement")}
        filling_count=0
        # This exporter scales geometry but leaves OverallWidth/Height in native mm.
        for product in exported.by_type("IfcDoor")+exported.by_type("IfcWindow"):
            native=next(obj for obj in groups["Openings"].Group if obj.Label==product.Name)
            product.OverallWidth=native.Width.Value/1000/unit_scale
            product.OverallHeight=native.Height.Value/1000/unit_scale
            if not product.FillsVoids:
                exported.create_entity("IfcRelFillsElement",GlobalId=ifcopenshell.guid.new(),
                                       OwnerHistory=product.OwnerHistory,
                                       RelatingOpeningElement=voids[product.Name],
                                       RelatedBuildingElement=product)
                filling_count+=1
        exported.write(ifcpath)
        exported=ifcopenshell.open(ifcpath)
        products=exported.by_type("IfcProduct")
        represented=[p for p in products if p.Representation]
        if not represented:
            raise RuntimeError("IFC contains no represented products")
        import ifcopenshell.geom
        failures=[]
        for product in represented:
            try:
                shape=ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(),product)
                if not shape.geometry.verts:
                    raise RuntimeError("Exported product has no mesh vertices")
            except Exception as exc:
                failures.append({"name":product.Name,"error":str(exc)})
        if failures:
            raise RuntimeError("IFC geometry failures: "+str(failures))
        report.update(ifc_status="exported and reopened with geometry",
                      ifc_represented_products=len(represented),
                      ifc_opening_dimensions_in_declared_units=True,
                      ifc_filling_relationships_added=filling_count,
                      ifc_classes=dict(Counter(p.is_a() for p in represented)))
    except Exception:
        report["ifc_status"]="FAILED"
        report["ifc_error"]=traceback.format_exc()
    with open(os.path.join(OUT,"validation.json"),"w",encoding="utf-8") as f:
        json.dump(report,f,indent=2)
    if App.GuiUp:
        import FreeCADGui as Gui
        from PySide import QtGui
        Gui.Selection.clearSelection()
        Gui.activeDocument().activeView().viewAxonometric()
        Gui.activeDocument().activeView().fitAll()
        QtGui.QApplication.processEvents()
        Gui.activeDocument().activeView().saveImage(os.path.join(OUT,"exterior.png"),1600,1100,"White")
        for group in ("Walls","Roof","Openings"):
            groups[group].ViewObject.Visibility=False
        plan_group.ViewObject.Visibility=True
        Gui.activeDocument().activeView().viewTop()
        Gui.activeDocument().activeView().fitAll()
        QtGui.QApplication.processEvents()
        Gui.activeDocument().activeView().saveImage(os.path.join(OUT,"plan-cutaway.png"),1600,1100,"White")
        plan_group.ViewObject.Visibility=False
        for group in ("Walls","Roof","Openings"):
            groups[group].ViewObject.Visibility=True
        for obj in groups["Openings"].Group:
            if obj.Label.startswith("Hall to dining"):
                obj.ViewObject.Visibility=False
        Gui.activeDocument().activeView().viewAxonometric()
        Gui.activeDocument().activeView().fitAll()
        doc.save()
    error_path = os.path.join(OUT,"build-error.txt")
    if os.path.exists(error_path):
        os.remove(error_path)
    with open(os.path.join(OUT,"build-complete.txt"),"w") as f:
        f.write(report["ifc_status"])


try:
    build()
except Exception:
    with open(os.path.join(OUT,"build-error.txt"),"w",encoding="utf-8") as f:
        f.write(traceback.format_exc())
    raise
