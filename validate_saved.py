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
assert len(objects) == 63, len(objects)
assert all(not o.Shape.isNull() and o.Shape.isValid() and o.Shape.Volume > 0 for o in objects)
by_label = {o.Label:o for o in doc.Objects}
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
assert abs(front.Shape.Volume/ft**3-236.25)<1e-5
portal=by_label["Hall to dining - 8ft open portal"]
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
assert len(ifc.by_type("IfcDoor"))==9
assert len(ifc.by_type("IfcWindow"))==17
assert len(ifc.by_type("IfcSpace"))==12
units=ifcopenshell.util.unit.calculate_unit_scale(ifc)
for product in ifc.by_type("IfcDoor")+ifc.by_type("IfcWindow"):
    native=by_label[product.Name]
    assert abs(product.OverallWidth*units-native.Width.Value/1000)<1e-7, product.Name
    assert abs(product.OverallHeight*units-native.Height.Value/1000)<1e-7, product.Name
settings=ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS,True)
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
