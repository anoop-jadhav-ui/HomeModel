// Visualization only: feet, not surveyed or jurisdiction-checked.
// These are editable aesthetic assumptions, not legal boundaries/setbacks,
// grading/drainage levels, or an engineered wall/landscape specification.
// Absolute grade is supplied only by model.dimensions.ground_elevation (feet).
export const SITE_SETTINGS = Object.freeze({
  assumption: 'Illustrative only - not surveyed; no legal boundary, setback, grading, drainage or engineered wall design.',
  margins: Object.freeze({front:18, side:8, rear:8}),
  wall: Object.freeze({thickness:.5, height:2.5, copingWidth:.7, copingHeight:.16}),
  gateway: Object.freeze({minimumOpening:8, postWidth:.6, postHeight:4, capWidth:.8, capHeight:.12, postCount:2}),
  entrance: Object.freeze({pathWidth:6.25, pathThickness:.08}),
  garden: Object.freeze({
    frontInset:2.5, houseRoofClearance:2, outerInset:2,
    corridorClearance:1.5, lawnThickness:.04, bedDepth:2, bedThickness:.06,
    shrubsPerBed:6, shrubRadius:.65, shrubHeight:1.4, shrubEndInset:1.1,
    shrubDetail:1,
  }),
  budget: Object.freeze({meshes:80, triangles:10000}),
});
