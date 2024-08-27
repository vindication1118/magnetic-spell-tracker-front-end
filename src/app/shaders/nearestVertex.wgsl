  struct Vertex {
  position : vec3<f32>,
  nearestVertex : u32,
};

struct Segment {
    v0: vec3<f32>,
    v2: vec3<f32>,
}

@group(0) @binding(0) var<storage, read> pointsA : array<Vertex>;
@group(0) @binding(1) var<storage, read> pointsB : array<Vertex>;
@group(0) @binding(2) var<storage, read_write> updatedPointsA : array<Vertex>;
@group(0) @binding(3) var<storage, read_write> vertexPairs : array<Segment>;

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

fn findNearestPointAlongAdjacentSegment(pointB: vec3<f32>, pBIndex: u32) {

    let nearestIndex = findNearestVertexInUpdatedA(pointB); // Find the nearest vertex in pointsA

    // Get the nearest vertex and its adjacent vertices in pointsA
    let A_nearest = updatedPointsA[nearestIndex].position;
    let A_next = updatedPointsA[min(nearestIndex + 1u, arrayLength(&updatedPointsA) - 1u)].position;

    // Project pointB onto the line segment [A_nearest, A_next]
    let projectedPoint = projectPointOntoLine(pointB, A_nearest, A_next);
    // Store the resulting pair
    vertexPairs[pBIndex] =  Segment(pointB, projectedPoint);
}

// Function to project point P onto the line segment [A, B]
fn projectPointOntoLine(P: vec3<f32>, A: vec3<f32>, B: vec3<f32>) -> vec3<f32> {
    // Vector AB = B - A
    let AB = B - A;

    // Vector AP = P - A
    let AP = P - A;

    // Dot product of AP and AB
    let dotProduct = dot(AP, AB);
    
    // Dot product of AB with itself
    let magnitudeAB2 = dot(AB, AB);

    // Projection scalar t
    let t = dotProduct / magnitudeAB2;

    // Clamp t to [0, 1] to ensure the projected point is within the segment
    let t_clamped = clamp(t, 0.0, 1.0);

    // Calculate the projection point P' = A + t * AB
    return A + t_clamped * AB;
}

fn findNearestVertexInUpdatedA(pB: vec3<f32>) -> u32 {
    var nearestIndex : u32 = 0u;
    var minDistance : f32 = 1e10;
    // Placeholder: Return the nearest vertex index for the given point P
    for (var i = 0u; i < arrayLength(&updatedPointsA); i = i + 1u) {
      let uPA = updatedPointsA[i].position;

      // Calculate the distance in the xz plane
      let distance = distance(vec3<f32>(uPA.x, uPA.y, uPA.z), vec3<f32>(pB.x, pB.y, pB.z));

      if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
      }
    }
    return nearestIndex;
}