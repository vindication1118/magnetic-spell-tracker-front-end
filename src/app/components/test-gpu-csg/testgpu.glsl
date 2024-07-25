      precision highp float;

      // Distance functions for basic shapes
      float sphereSDF(vec3 p, float r) {
        return length(p) - r;
      }

      float boxSDF(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
      }

      // CSG operations
      float opUnion(float d1, float d2) {
        return min(d1, d2);
      }

      float opIntersection(float d1, float d2) {
        return max(d1, d2);
      }

      float opDifference(float d1, float d2) {
        return max(d1, -d2);
      }

      // Combine shapes using CSG
      float getDistance(vec3 p) {
        float d1 = sphereSDF(p - vec3(0.5, 0.0, 0.0), 0.5);
        float d2 = boxSDF(p + vec3(0.5, 0.0, 0.0), vec3(0.3));
        return opDifference(d1, d2);
      }

      // Ray marching
      vec3 getNormal(vec3 p) {
        float eps = 0.001;
        vec3 n;
        n.x = getDistance(p + vec3(eps, 0.0, 0.0)) - getDistance(p - vec3(eps, 0.0, 0.0));
        n.y = getDistance(p + vec3(0.0, eps, 0.0)) - getDistance(p - vec3(0.0, eps, 0.0));
        n.z = getDistance(p + vec3(0.0, 0.0, eps)) - getDistance(p - vec3(0.0, 0.0, eps));
        return normalize(n);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(640.0, 480.0) * 2.0 - 1.0;
        vec3 ro = vec3(0.0, 0.0, 5.0); // Ray origin
        vec3 rd = normalize(vec3(uv.x, uv.y, -1.0)); // Ray direction

        float t = 0.0;
        for (int i = 0; i < 100; i++) {
          vec3 p = ro + t * rd;
          float d = getDistance(p);
          if (d < 0.001) {
            vec3 n = getNormal(p);
            vec3 lightDir = normalize(vec3(1.0, 1.0, -1.0));
            float diff = max(dot(n, lightDir), 0.0);
            gl_FragColor = vec4(vec3(diff), 1.0);
            return;
          }
          t += d;
        }

        gl_FragColor = vec4(0.0); // Background color
      }