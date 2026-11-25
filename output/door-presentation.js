// Display fitting gaps, not a fabrication specification or revised native rough opening.
export const DOOR_DISPLAY_GAPS=Object.freeze({side:.01,top:.01,bottom:.02});

export function doorLeaves(door){
 return door.leaves?door.leaves.map(part=>({...door,...part,leaves:undefined,nativeFitted:true})):[door];
}

export function doorPresentation(door){
 if(door.leaves)throw new Error('Use doorLeaves before fitting a paired door.');
 const {leaf}=door,sign=door.hinge==='start'?-1:1,a=door.angle_degrees*Math.PI/180;
 const normal=door.opens_to[0]*Math.sin(a)-door.opens_to[1]*Math.cos(a);
 const angle=Math.asin(Math.max(-1,Math.min(1,normal*sign)));
 const width=door.nativeFitted?leaf.width:Math.min(leaf.width,door.width-2*door.frame_width)-2*DOOR_DISPLAY_GAPS.side;
 const height=leaf.height-(door.nativeFitted?0:DOOR_DISPLAY_GAPS.top+DOOR_DISPLAY_GAPS.bottom);
 if(!(width>0&&height>0&&leaf.thickness>0))throw new Error('Invalid door presentation: '+door.name);
 const centerZ=-sign*Math.sign(angle)*leaf.thickness/2;
 return {sign,angle,width,height,bottom:leaf.bottom+(door.nativeFitted?0:DOOR_DISPLAY_GAPS.bottom),centerZ,
  pivotX:sign*(door.width/2-door.frame_width-(door.fitting_gaps?.side_gap??DOOR_DISPLAY_GAPS.side)),
  pivotZ:-leaf.normal_offset-centerZ,thickness:leaf.thickness};
}
