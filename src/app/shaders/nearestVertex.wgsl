  struct Vertex {
  position : vec3<f32>,
  nearestVertex : u32,
};

@group(0) @binding(0) var<storage, read> pointsA : array<Vertex>;
@group(0) @binding(1) var<storage, read> pointsB : array<Vertex>;
@group(0) @binding(2) var<storage, read_write> updatedPointsA : array<Vertex>;

//@compute @workgroup_size(${workgroupSize})
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
  let index = id.x;
  let pointA = pointsA[index].position;

  var nearestIndex : u32 = 0u;
  var minDistance : f32 = 1e10;

  for (var i = 0u; i < arrayLength(&pointsB); i = i + 1u) {
      let pointB = pointsB[i].position;

      // Calculate the distance in the xz plane
      let distance = distance(vec2<f32>(pointA.x, pointA.z), vec2<f32>(pointB.x, pointB.z));

      if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
      }
  }

  // Assign the new y value based on the distance to the nearest point in B
  let newY = 1.0 - minDistance;

  // Update the vertex with the new y value and the nearest vertex index
  updatedPointsA[index] = Vertex(vec3<f32>(pointA.x, newY, pointA.z), nearestIndex);
}