struct Vertex {
  position : vec3<f32>,
  nearestVertex : u32,
};

struct Segment {
    v0: vec4<f32>,
    v2: vec4<f32>,
}

@group(0) @binding(0) var<storage, read> pointsB : array<Vertex>;
@group(0) @binding(1) var<storage, read_write> updatedPointsA : array<Vertex>;
@group(0) @binding(2) var<storage, read_write> vertexPairs : array<Segment>;

//@compute @workgroup_size(${workgroupSize})
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let pBIndex = id.x;
    let pointB = pointsB[pBIndex].position;

    let nearestIndex = findNearestVertexInUpdatedA(pointB); // Find the nearest vertex in pointsA
    let maxIndex = arrayLength(&updatedPointsA) - 1u;
    // Get the nearest vertex and its adjacent vertices in pointsA
    let A_nearest = updatedPointsA[nearestIndex].position;
    var projectedPoint: vec4<f32>;
    if(nearestIndex == 0u){
        let A_next = updatedPointsA[nearestIndex + 1u].position;
        // Project pointB onto the line segment [A_nearest, A_next]
        projectedPoint = v3tov4(projectPointOntoLine(pointB, A_nearest, A_next));
        // Store the resulting pair
        vertexPairs[pBIndex] = Segment(v3tov4(pointB), projectedPoint);
    } else if (nearestIndex == maxIndex){
        let A_prev = updatedPointsA[nearestIndex - 1u].position;
        // Project pointB onto the line segment [A_nearest, A_next]
        projectedPoint = v3tov4(projectPointOntoLine(pointB, A_nearest, A_prev));
        // Store the resulting pair
        vertexPairs[pBIndex] = Segment(v3tov4(pointB), projectedPoint);
    }
    else {
        //Possible TODO: Add discontinuity checking
        let A_next = updatedPointsA[nearestIndex + 1u].position;
        let A_prev = updatedPointsA[nearestIndex - 1u].position;
        // Project pointB onto the line segment [A_nearest, A_next]
        let projectedPoint1 = projectPointOntoLine(pointB, A_nearest, A_next);
        let projectedPoint2 = projectPointOntoLine(pointB, A_nearest, A_prev);
        projectedPoint = v3tov4(getNearestPoint(pointB, projectedPoint1, projectedPoint2));
        // Store the resulting pair
        vertexPairs[pBIndex] =  Segment(v3tov4(pointB), projectedPoint);
    }
}

fn v3tov4(pointA: vec3<f32>) -> vec4<f32> {
    return vec4<f32>(pointA.x, pointA.y, pointA.z, 0.0);
}

fn getNearestPoint(startingPoint: vec3<f32>, projectedPoint1: vec3<f32>, projectedPoint2: vec3<f32>) -> vec3<f32> {
    let dist1 = distance(startingPoint, projectedPoint1);
    let dist2 = distance(startingPoint, projectedPoint2);
    if(dist1 <= dist2) {
        return projectedPoint1;
    } else {
        return projectedPoint2;
    }
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