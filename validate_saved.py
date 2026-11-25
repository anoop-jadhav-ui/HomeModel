"""Reopen persisted deliverables and check geometry, not just authoring parameters."""
import json
import os
from collections import Counter

import FreeCAD as App
import Arch
import Part
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.unit

root = os.path.dirname(os.path.abspath(__file__))
parameters=json.load(open(os.path.join(root,"parameters.json"),encoding="utf-8"))
doc = App.openDocument(os.path.join(root, "output", "Home.FCStd"))
ft = 304.8
objects = [o for o in doc.Objects if "ReviewRole" in o.PropertiesList
           and o.ReviewRole != "Spaces" and not o.Label.startswith("Hall to dining")]
enclosed=parameters["monitor_enclosure"]["enabled"]
assert len(objects) == 63-int(parameters["hall_dining_full_bay"])+(8 if enclosed else 0), len(objects)
assert all(not o.Shape.isNull() and o.Shape.isValid() and o.Shape.Volume > 0 for o in objects)
by_label = {o.Label:o for o in doc.Objects}
changed_service_walls={"Kitchen Middle","FrontBedroom Middle","RearBedroom Left Front",
                       "RearBedroom Right Front","Service Front","RearBath Front","Left S"}
screen_names=[prefix+side for side in ("Front","Right","Rear","Left")
              for prefix in ("Monitor Timber Louvers ","Monitor Recessed Grille ")]
for label in screen_names:
    assert (label in by_label)==enclosed, label
    if enclosed:
        screen=by_label[label]
        assert screen.ReviewRole=="Roof" and len(screen.Shape.Solids)>1, label
slab = by_label["Ground Floor Slab"].Shape.BoundBox
assert abs(slab.XLength/ft-42.25) < 1e-6
assert abs(slab.YLength/ft-34.25) < 1e-6
for label, expected in {
    "Kitchen": (12,12), "Hall": (16,12),
    "Bedroom front right": (12,12), "Bedroom rear left": (12,12),
    "Bedroom rear right": (12,12), "Prayer": (8,8), "Bath right": (6,8)
}.items():
    box=by_label[label].Shape.BoundBox
    assert abs(box.XLength/ft-expected[0])<1e-6, label
    assert abs(box.YLength/ft-expected[1])<1e-6, label
front=by_label["Front E"]
assert abs(front.Shape.Volume/ft**3-241.875)<1e-5
if parameters["hall_dining_full_bay"]:
    assert "Hall Dining" not in by_label
    assert not any(label.startswith("Hall to dining") for label in by_label)
    for x in (13.18,14,16,21.125,26,28,29.07):
        for z in (4.1,8,13.9):
            probe=Part.makeBox(.04*ft,.04*ft,.04*ft,App.Vector((x-.02)*ft,12.9175*ft,z*ft))
            assert all(o.Shape.common(probe).Volume<1e-4 for o in objects if o.ReviewRole=="Walls"),(x,z)
else:
    portal=next(o for label,o in by_label.items() if label.startswith("Hall to dining"))
    assert portal.Hosts[0].Label=="Hall Dining"
attached=[o for o in objects if o.Label.startswith("D2") and o.Hosts[0].Label=="RearBedroom Right Inside"]
assert len(attached)==1
expected_doors = {
    "D_01_Front_E": ("Front E",21.125,.375,4,0),
    "D1_01_Kitchen_Middle": ("Kitchen Middle",11,12.9375,3,0),
    "D1_02_FrontBedroom_Middle": ("FrontBedroom Middle",31.25,12.9375,3,0),
    "D1_03_RearBedroom_Left_Front": ("RearBedroom Left Front",11,21.3125,3,0),
    "D1_04_RearBedroom_Right_Front": ("RearBedroom Right Front",31.25,21.3125,3,0),
    "D2_01_FrontBedroom_Middle": ("FrontBedroom Middle",37,12.9375,2.5,0),
    "D2_02_Service_Front": ("Service Front",18.625,27.3125,2.5,0),
    "D2_03_Service_Front": ("Service Front",22.125,27.3125,2.5,0),
    "D2_04_RearBedroom_Right_Inside": ("RearBedroom Right Inside",29.3125,27,2.5,90)
}
for name,(host,x,y,width,angle) in expected_doors.items():
    door=by_label[name]
    assert door.Hosts[0].Label==host, name
    center=door.Base.Placement.multVec(App.Vector(width*ft/2,0,0))
    assert abs(center.x/ft-x)<1e-6 and abs(center.y/ft-y)<1e-6, name
    assert abs(center.z/ft-4)<1e-6, name
    sketchbox=door.Base.Shape.BoundBox
    assert abs((sketchbox.YLength if angle else sketchbox.XLength)/ft-width)<1e-6, name
    assert abs(sketchbox.ZLength/ft-7)<1e-6, name
    for offset in (-width/2+.1,0,width/2-.1):
        cx,cy=(x,y+offset) if angle else (x+offset,y)
        probe=Part.makeBox(.04*ft,.04*ft,.04*ft,App.Vector((cx-.02)*ft,(cy-.02)*ft,7*ft))
        assert door.Hosts[0].Shape.common(probe).Volume<1e-4, name
# The previous misplaced D1 holes must be solid wall again, not duplicate access.
for host,x,y in (("Kitchen Hall",12.9375,10.75),("Hall FrontBedroom",29.3125,10.75),
                 ("RearBedroom Left Inside",12.9375,23.5),("RearBedroom Right Inside",29.3125,23.5)):
    probe=Part.makeBox(.04*ft,.04*ft,.04*ft,App.Vector((x-.02)*ft,(y-.02)*ft,7*ft))
    assert by_label[host].Shape.common(probe).Volume>probe.Volume*.99, host
assert not any("Prayer Return" in o.Label for o in objects)
prayer_edge=Part.makeBox(.04*ft,7.9*ft,.04*ft,App.Vector(8.73*ft,13.175*ft,7*ft))
assert all(o.Shape.common(prayer_edge).Volume<1e-4 for o in objects if o.ReviewRole=="Walls")
raw=open(os.path.join(root,"output","review-data.js"),encoding="utf-8").read()
review=json.loads(raw[len("window.HOME_MODEL="):-1])
grade=parameters["ground_elevation"]
assert review["dimensions"]["ground_elevation"]==grade
assert abs(doc.getObject("Site").IllustrativeGroundElevation.Value/ft-grade)<1e-7
assert review["dimensions"]["floor_above_grade"]==4-grade
assert review["finishes"]["base"]==parameters["base_finish"]
for label in ("Ground Floor Slab","Raised Plinth Concept"):
    assert by_label[label].IllustrativeBaseFinish==parameters["base_finish"]
baseline=App.openDocument(os.path.join(root,"archives","before-grade-change","Home.FCStd"))
old={o.Label:o for o in baseline.Objects if hasattr(o,"Shape")}
for current in objects:
    previous=old[current.Label]
    if current.Label in changed_service_walls:
        continue
    if current.Label=="D_01_Front_E" and parameters["main_entry"]["leaf_count"]==2:
        leaves=[s for s in current.Shape.Solids if abs(s.BoundBox.YLength/ft-.15)<1e-7]
        assert len(leaves)==2
        expected=(4-2*parameters["frame_width"]-2*parameters["main_entry"]["side_gap"]-parameters["main_entry"]["meeting_gap"])/2
        assert all(abs(s.BoundBox.XLength/ft-expected)<1e-7 for s in leaves)
        assert all(abs(s.BoundBox.ZLength/ft-6.82)<1e-7 for s in leaves)
        probe=Part.makeBox(.01*ft,.1*ft,.1*ft,App.Vector(21.12*ft,.4*ft,7*ft))
        assert current.Shape.common(probe).Volume<1e-5,"Paired entry must have a real meeting gap, not a centre post"
        continue
    if current.Label in ("Front E","Rear W"):
        e=parameters["external_wall"]*ft
        y=0 if current.Label=="Front E" else slab.YMax-e
        additions=[Part.makeBox(e/2,e,parameters["wall_height"]*ft,App.Vector(x,y,4*ft))
                   for x in (0,slab.XMax-e/2)]
        expected=additions[0].fuse(additions[1])
        added=current.Shape.cut(previous.Shape)
        assert previous.Shape.cut(current.Shape).Volume<1e-3,current.Label+" lost approved geometry"
        assert abs(added.Volume-expected.Volume)<1e-3,current.Label
        assert added.cut(expected).Volume<1e-3,current.Label+" changed outside the corner closures"
        continue
    assert abs(current.Shape.Volume-previous.Shape.Volume)<1e-3,current.Label+" changed geometry with grade"
    for field in ("XMin","XMax","YMin","YMax","ZMin","ZMax"):
        assert abs(getattr(current.Shape.BoundBox,field)-getattr(previous.Shape.BoundBox,field))<1e-5,current.Label
App.closeDocument(baseline.Name)
baseline=App.openDocument(os.path.join(root,"archives","before-paired-entry","Home.FCStd"))
old={o.Label:o for o in baseline.Objects if hasattr(o,"Shape")}
for current in objects:
    if current.Label=="D_01_Front_E" or current.Label in changed_service_walls:
        continue
    previous=old[current.Label]
    assert abs(current.Shape.Volume-previous.Shape.Volume)<1e-3,current.Label+" changed outside paired entry"
    for field in ("XMin","XMax","YMin","YMax","ZMin","ZMax"):
        assert abs(getattr(current.Shape.BoundBox,field)-getattr(previous.Shape.BoundBox,field))<1e-5,current.Label
App.closeDocument(baseline.Name)
old_raw=open(os.path.join(root,"archives","before-paired-entry","review-data.js"),encoding="utf-8").read()
old_review=json.loads(old_raw[len("window.HOME_MODEL="):-1])
old_meshes={record["name"]:record for record in old_review["objects"]}
assert review["rooms"]==old_review["rooms"]
assert review["dimensions"]==old_review["dimensions"]
for record in review["objects"]:
    if record["name"]!="D_01_Front_E" and record["name"] not in changed_service_walls:
        assert record==old_meshes[record["name"]],record["name"]+" changed native exported geometry"
baseline=App.openDocument(os.path.join(root,"archives","before-corner-exhaust","Home.FCStd"))
old={o.Label:o for o in baseline.Objects if hasattr(o,"Shape")}
corner_walls=changed_service_walls-{"Left S"}
for current in objects:
    previous=old[current.Label]
    if current.Label in corner_walls:
        assert previous.Shape.cut(current.Shape).Volume<1e-3,current.Label+" lost approved wall geometry"
        added=current.Shape.cut(previous.Shape)
        expected=(parameters["partition_wall"]*ft)**2/2*parameters["wall_height"]*ft
        assert abs(added.Volume-expected)<1e-3,current.Label+" changed outside its half-thickness endpoint closure"
    elif current.Label=="Left S":
        cutter=by_label["Kitchen Exhaust Provisional Penetration"].Shape
        assert current.Shape.cut(previous.Shape).Volume<1e-3,"Service wall gained unrelated geometry"
        assert previous.Shape.cut(current.Shape).cut(cutter).Volume<1e-3,"Service wall lost geometry outside the proposed round hole"
        assert current.Shape.common(cutter).Volume<1e-3,"Service cylinder did not cut the persisted wall"
    else:
        assert abs(current.Shape.Volume-previous.Shape.Volume)<1e-3,current.Label+" changed outside corner/exhaust scope"
        for field in ("XMin","XMax","YMin","YMax","ZMin","ZMax"):
            assert abs(getattr(current.Shape.BoundBox,field)-getattr(previous.Shape.BoundBox,field))<1e-5,current.Label
App.closeDocument(baseline.Name)
for x,y in ((13.03,13.03),(29.22,13.03),(13.03,21.22),(29.22,21.22),(17.03,27.22),(24.03,25.22)):
    for z in (4.1,8,13.9):
        assert any(o.Shape.isInside(App.Vector(x*ft,y*ft,z*ft),1e-5,True)
                   for o in objects if o.ReviewRole=="Walls"),(x,y,z)
assert review["passages"][0]["width"]==(16 if parameters["hall_dining_full_bay"] else parameters["hall_opening_width"])
for record in review["doorways"]:
    native=by_label[record["name"]]
    assert abs(record["leaf"]["thickness"]-.15)<1e-7
    assert any(abs(s.BoundBox.ZLength/ft-record["leaf"]["height"])<1e-7 for s in native.Shape.Solids)
planwalls=doc.getObject("PlanCutWalls").Shape
cutz=(4+parameters["plan_cut_height"]+.01)*ft
plan_checks={"door":0,"window":0,"vent":0}
for opening in review["plan"]["openings"]:
    point=Part.Vertex(App.Vector(opening["x"]*ft,opening["y"]*ft,cutz))
    distance=planwalls.distToShape(point)[0]
    if opening["kind"]=="vent":
        assert distance<1e-4, opening["name"]
    else:
        assert distance>.03*ft, opening["name"]
    plan_checks[opening["kind"]]+=1
assert plan_checks=={"door":9,"window":11,"vent":6}
ifc=ifcopenshell.open(os.path.join(root,"output","Home.ifc"))
for label in screen_names:
    if enclosed:
        product=next(p for p in ifc.by_type("IfcProduct") if p.Name==label)
        shape=ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(),product)
        assert shape.geometry.verts, label
assert len(ifc.by_type("IfcDoor"))==9
assert len(ifc.by_type("IfcWindow"))==17
assert len(ifc.by_type("IfcSpace"))==12
service_void=next(o for o in ifc.by_type("IfcOpeningElement") if o.Name=="Kitchen Exhaust Provisional Penetration")
assert service_void.VoidsElements[0].RelatingBuildingElement.Name=="Left S"
assert any(p.Name=="ConceptKitchenExhaust" for p in ifc.by_type("IfcPropertySet"))
entry=next(d for d in ifc.by_type("IfcDoor") if d.Name=="D_01_Front_E")
assert entry.OperationType=="DOUBLE_DOOR_SINGLE_SWING"
assert any(p.Name=="ConceptPairedEntrance" for p in ifc.by_type("IfcPropertySet"))
vents=[o for o in objects if o.Label.startswith(("V_","V1_"))]
assert len(vents)==6
for vent in vents:
    assert abs(vent.Width.Value/ft-1.5)<1e-7,vent.Label
    assert abs(vent.Height.Value/ft-2)<1e-7,vent.Label
units=ifcopenshell.util.unit.calculate_unit_scale(ifc)
levels=next(p for p in ifc.by_type("IfcPropertySet") if p.Name=="ConceptLocalLevels")
level_values={p.Name:p.NominalValue.wrappedValue for p in levels.HasProperties}
for key,expected in (("IllustrativeGroundElevation",grade),("FinishedFloorElevation",4),
                     ("FinishedFloorAboveIllustrativeGrade",4-grade)):
    assert abs(level_values[key]*units/.3048-expected)<1e-7,key
assert "not a survey" in level_values["ReferenceDatum"]
finish=next(p for p in ifc.by_type("IfcPropertySet") if p.Name=="ConceptFinishes")
assert finish.HasProperties[0].NominalValue.wrappedValue==parameters["base_finish"]
for product in ifc.by_type("IfcDoor")+ifc.by_type("IfcWindow"):
    native=by_label[product.Name]
    assert abs(product.OverallWidth*units-native.Width.Value/1000)<1e-7, product.Name
    assert abs(product.OverallHeight*units-native.Height.Value/1000)<1e-7, product.Name
settings=ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS,True)
def intersections_x(product,y,z):
    mesh=ifcopenshell.geom.create_shape(settings,product)
    points=list(zip(mesh.geometry.verts[0::3],mesh.geometry.verts[1::3],mesh.geometry.verts[2::3]))
    faces=mesh.geometry.faces
    result=set()
    for offset in range(0,len(faces),3):
        a,b,c=(points[i] for i in faces[offset:offset+3])
        determinant=(b[1]-c[1])*(a[2]-c[2])+(c[2]-b[2])*(a[1]-c[1])
        if abs(determinant)<1e-12:
            continue
        u=((b[1]-c[1])*(z-c[2])+(c[2]-b[2])*(y-c[1]))/determinant
        v=((c[1]-a[1])*(z-c[2])+(a[2]-c[2])*(y-c[1]))/determinant
        if u>=-1e-8 and v>=-1e-8 and u+v<=1+1e-8:
            result.add(round(u*a[0]+v*b[0]+(1-u-v)*c[0],8))
    return result
service=review["services"]["kitchen_exhaust"]
_,service_y,service_z=service["wall_center"]
service_host=next(p for p in ifc.by_type("IfcWall") if p.Name=="Left S")
assert not intersections_x(service_host,service_y*.3048,service_z*.3048),"Persisted IFC wall still blocks the exhaust"
assert intersections_x(service_host,(service_y+.4)*.3048,service_z*.3048),"IFC service hole removed neighboring masonry"
for label,x,y in (("Kitchen Middle",13.03,13.03),("FrontBedroom Middle",29.22,13.03),
                  ("RearBedroom Left Front",13.03,21.22),("RearBedroom Right Front",29.22,21.22),
                  ("Service Front",17.03,27.22),("RearBath Front",24.03,25.22)):
    product=next(p for p in ifc.by_type("IfcWall") if p.Name==label)
    assert len([hit for hit in intersections_x(product,y*.3048,8*.3048) if hit>x*.3048])%2==1,label+" IFC corner is still notched"
native_cutter=by_label["Kitchen Exhaust Provisional Penetration"]
assert native_cutter in by_label["Left S"].Subtractions
saved_radius=native_cutter.Radius.Value
saved_volume=by_label["Left S"].Shape.Volume
native_cutter.Radius=saved_radius+1
doc.recompute()
assert by_label["Left S"].Shape.Volume<saved_volume,"Native service opening did not remain parametric after reopening"
native_cutter.Radius=saved_radius
doc.recompute()
assert abs(by_label["Left S"].Shape.Volume-saved_volume)<.1
entry_mesh=ifcopenshell.geom.create_shape(settings,entry)
entry_shape=entry_mesh.geometry
points=list(zip(entry_shape.verts[0::3],entry_shape.verts[1::3],entry_shape.verts[2::3]))
welded={}
ids=[]
for point in points:
    key=tuple(round(value,6) for value in point)
    if key not in welded:
        welded[key]=len(welded)
    ids.append(welded[key])
parent=list(range(len(welded)))
def find(index):
    while parent[index]!=index:
        parent[index]=parent[parent[index]]
        index=parent[index]
    return index
for offset in range(0,len(entry_shape.faces),3):
    a,b,c=(ids[i] for i in entry_shape.faces[offset:offset+3])
    parent[find(b)]=find(a)
    parent[find(c)]=find(a)
components={}
for index,point in enumerate(points):
    components.setdefault(find(ids[index]),[]).append(point)
leaf_components=[points for points in components.values()
                 if abs(max(p[1] for p in points)-min(p[1] for p in points)-.15*.3048)<1e-6]
assert len(leaf_components)==2,"IFC must represent two actual disconnected fitted leaf solids, not just paired metadata"
assert all(abs((max(p[0] for p in points)-min(p[0] for p in points))/.3048-1.83)<1e-6
           for points in leaf_components)
for label in ("Front E","Rear W"):
    product=next(p for p in ifc.by_type("IfcWall") if p.Name==label)
    shape=ifcopenshell.geom.create_shape(settings,product)
    verts=shape.geometry.verts
    assert abs(min(verts[0::3]))<1e-6,label
    assert abs(max(verts[0::3])-slab.XMax/1000)<1e-6,label
for vent in vents:
    product=next(p for p in ifc.by_type("IfcWindow") if p.Name==vent.Label)
    shape=ifcopenshell.geom.create_shape(settings,product)
    vertices=shape.geometry.verts
    axis=1 if vent.Label.endswith("Right_N") else 0
    assert abs((max(vertices[axis::3])-min(vertices[axis::3]))/.3048-1.5)<1e-6,vent.Label
    assert abs((max(vertices[2::3])-min(vertices[2::3]))/.3048-2)<1e-6,vent.Label
if parameters["hall_dining_full_bay"]:
    assert not any(p.Name=="Hall Dining" for p in ifc.by_type("IfcWall"))
for name,(host,x,y,width,angle) in expected_doors.items():
    door=next(o for o in ifc.by_type("IfcDoor") if o.Name==name)
    void=next(o for o in ifc.by_type("IfcOpeningElement") if o.Name==name)
    assert void.VoidsElements[0].RelatingBuildingElement.Name==host, name
    assert door.FillsVoids[0].RelatingOpeningElement==void, name
    assert abs(door.OverallWidth*units-width*ft/1000)<1e-7, name
    assert abs(door.OverallHeight*units-7*ft/1000)<1e-7, name
    for product in (door,void):
        shape=ifcopenshell.geom.create_shape(settings,product)
        verts=shape.geometry.verts
        axis=1 if angle else 0
        values=verts[axis::3]
        assert abs((max(values)+min(values))/2-(y if angle else x)*ft/1000)<.001, name
        assert abs(min(verts[2::3])-4*ft/1000)<.001, name
        assert abs(max(verts[2::3])-11*ft/1000)<.001, name
result={"saved_native_reopened":True,"valid_bim_solids":len(objects),
        "uniform_service_vents_ft":{"width":1.5,"height":2,"count":len(vents)},
        "hall_dining_full_height_clear_width_ft":review["passages"][0]["width"],
        "shared_local_levels_ft":{"ground":grade,"finished_floor":4,"floor_above_grade":4-grade},
        "native_solids_unchanged_from_before_corner_exhaust":len(objects)-len(changed_service_walls),
        "native_internal_corner_closures":6,
        "native_and_ifc_provisional_kitchen_service_penetration":True,
        "ifc_service_centerline_clear_and_neighboring_wall_solid":True,
        "native_service_radius_edit_recomputes_host":True,
        "ifc_internal_corner_closures":6,
        "paired_entrance_native_leaf_widths_ft":[s.BoundBox.XLength/ft for s in by_label["D_01_Front_E"].Shape.Solids if abs(s.BoundBox.YLength/ft-.15)<1e-7],
        "paired_entrance_ifc_operation":entry.OperationType,
        "paired_entrance_ifc_actual_leaf_components":len(leaf_components),
        "native_and_ifc_exterior_corner_closures":4,
        "monitor_enclosure_native_and_ifc_elements":len(screen_names) if enclosed else 0,
        "exterior_ft":[slab.XLength/ft,slab.YLength/ft],
        "main_clear_rooms_verified":7,"opening_host_and_portal_checks":"passed",
        "ifc_door_window_space_counts":[9,17,12],
        "door_position_width_height_and_host_checks":len(expected_doors),
        "native_host_clearance_probes":27,
        "old_d1_holes_closed":4,
        "prayer_full_open_edge_ft":8,
        "ifc_door_and_void_positions_and_hosts":"passed",
        "ifc_opening_dimension_units_checked":26,
        "native_plan_cut_opening_checks":plan_checks,
        "native_plan_review_features":len(doc.getObject("PlanReview").Group)}
with open(os.path.join(root,"output","saved-file-validation.json"),"w") as stream:
    json.dump(result,stream,indent=2)
print(json.dumps(result,indent=2))
App.closeDocument(doc.Name)
