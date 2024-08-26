struct Vertex {
    position : vec3<f32>,
};

@group(0) @binding(0) var<storage, read> verticesAtY0 : array<Vertex>;
@group(0) @binding(1) var<storage, read> verticesAtY1 : array<Vertex>;
@group(0) @binding(2) var<storage, read_write> nearestVertices : array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let index = id.x;
    let vertexY1 = verticesAtY1[index].position;
    
    var nearestIndex : u32 = 0u;
    var minDistance : f32 = 1e10;

    for (var i = 0u; i < arrayLength(&verticesAtY0); i = i + 1u) {
        let vertexY0 = verticesAtY0[i].position;
        let distance = distance(vertexY1.xy, vertexY0.xy);

        if (distance < minDistance) {
            minDistance = distance;
            nearestIndex = i;
        }
    }

    nearestVertices[index] = nearestIndex;
}
