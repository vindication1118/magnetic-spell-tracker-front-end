import _ from 'lodash';
import { PathPosition } from '../interfaces/path-position';
import { SvgShapeData } from '../interfaces/svg-shape-data';
import { CharShape } from '../interfaces/char-shape';
import { LineSegment } from '../interfaces/line-segment';
import * as THREE from 'three';
import { PathCommand } from '../interfaces/path-command';
import * as jscad from '@jscad/modeling';

type JGeom2 = jscad.geometries.geom2.Geom2;
type JGeom3 = jscad.geometries.geom3.Geom3;

export class CommandHandler {
  /**Adds extra segments to lines for voronoi diagram purposes
   * @param {string} pathData - string of svg path commands, found after a d= attribute in a <path> tag
   * @param {number} density - number indicating density of points along a line. I think it means max dist
   * between points on a line, so that if you have a really short line, and a really long line, they
   * don't both end up with 12 segments. Regardless, smaller number here means more segments
   * which means better voronoi diagram.
   */

  public static addExtraPointsToLines(pathData: string, density = 30) {
    //let lineCommandCount = 0;
    const commands = pathData.match(/[a-df-z][^a-df-z]*/gi);
    //console.log('Command count: ' + commands?.length);
    const positions = this.getPositionsFromCommands(commands);
    //console.log(positions);
    const mergedCommands: string[] = [];
    if (commands !== null) {
      for (let i = 0; i < commands.length; i++) {
        const type = commands[i][0];
        //console.log('Type: ' + type + 'Length: ' + type.length);
        //const args = commands[i]
        //.slice(1)
        //.trim()
        //.split(/[\s,]+/)
        //.map(Number);
        if (type === 'L') {
          //lineCommandCount++;
          //const newPoints: string[] = [];
          //console.log(args);
          const prevPos = positions[i - 1];
          const currentPos = positions[i];
          //console.log(prevPos);
          //console.log(currentPos);
          //newPoints.push(commands[i - 1]); // Add the original point?

          // Determine the number of segments based on density
          const distance = this.getDist(prevPos, currentPos);
          //console.log('Distance: ' + distance);
          const segments = Math.max(Math.floor(distance / density), 4);
          //console.log('Segments: ' + segments);

          // Interpolate points along the straight line segment
          for (let j = 1; j < segments; j++) {
            const t = j / segments;
            const x = THREE.MathUtils.lerp(prevPos.x, currentPos.x, t);
            const y = THREE.MathUtils.lerp(prevPos.y, currentPos.y, t);
            const newCommand: string = 'L' + x + ' ' + y;
            //console.log('Pushing new command: ' + newCommand);
            mergedCommands.push(newCommand);
          }
        } else {
          //console.log('Type of commands[i]: ' + typeof commands[i]);
          mergedCommands.push(commands[i]);
        }
      }
      //console.log('Line Command Count ' + lineCommandCount);
      //console.log('Merged Command Count: ' + mergedCommands.length);
      //console.log('ErrorBars = ' + density * lineCommandCount);
      //console.log(
      //'Expected (+- density * Line command Count = ' +
      //(commands.length + density * lineCommandCount),
      //);
    }
    return mergedCommands.join('');
  }

  public static getDist(
    prevPos: PathPosition,
    currentPos: PathPosition,
  ): number {
    //console.log(prevPos);
    //console.log(currentPos);
    const a = currentPos.x - prevPos.x;
    const b = currentPos.y - prevPos.y;
    //
    //console.log('a: ' + a + ' b: ' + b);
    return Math.sqrt(a ** 2 + b ** 2);
  }

  public static getPositionsFromCommands(commands: RegExpMatchArray | null) {
    let x = 0,
      y = 0,
      firstPosition = { x: 0, y: 0 }; // Starting position of the pen
    const positions: PathPosition[] = [];
    if (commands !== null) {
      commands.forEach((command) => {
        const type = command[0];
        const args = command
          .slice(1)
          .trim()
          .split(/[\s,]+/)
          .map(Number);

        switch (type) {
          case 'M': // Move to absolute
            [x, y] = args;
            positions.push({ x, y });
            break;
          case 'm': // Move to relative
            x += args[0];
            y += args[1];
            positions.push({ x, y });
            break;
          case 'L': // Line to absolute
            [x, y] = args;
            positions.push({ x, y });
            break;
          case 'l': // Line to relative
            x += args[0];
            y += args[1];
            positions.push({ x, y });
            break;
          case 'H': // Horizontal line to absolute
            x = args[0];
            positions.push({ x, y });
            break;
          case 'h': // Horizontal line to relative
            x += args[0];
            positions.push({ x, y });
            break;
          case 'V': // Vertical line to absolute
            y = args[0];
            positions.push({ x, y });
            break;
          case 'v': // Vertical line to relative
            y += args[0];
            positions.push({ x, y });
            break;
          case 'Q': // Quadratic Bézier curve to absolute
            {
              const [cx, cy, x2, y2] = args;
              x = x2;
              y = y2;
              positions.push({ x, y, cx, cy });
            }
            break;
          case 'q': // Quadratic Bézier curve to relative
            {
              const [dx, dy, dx2, dy2] = args;
              const cx = x + dx;
              const cy = y + dy;
              x += dx2;
              y += dy2;
              positions.push({ x, y, cx, cy });
            }
            break;
          case 'Z':
          case 'z': // Close path
            firstPosition = positions[0];
            x = firstPosition.x;
            y = firstPosition.y;
            positions.push({ x, y });
            break;
          // Handle other commands if necessary
        }
      });
    }

    return positions;
  }

  public static threeShapeToJSCadShape(threeShape: CharShape) {
    const outershapepoints = threeShape.shape.map((point) =>
      this.vec2ToArr(point),
    );
    const innershapespoints = threeShape.holes.map((hole) => {
      const holeArr = hole.map((point) => {
        return this.vec2ToArr(point);
      });
      return holeArr;
    });
    const outershape = jscad.geometries.geom2.fromPoints(outershapepoints);
    const innershapes = innershapespoints.map((hole) => {
      return jscad.geometries.geom2.fromPoints(hole);
    });
    return jscad.booleans.subtract(outershape, ...innershapes);
  }

  public static vec2ToArr(three: THREE.Vec2): [number, number] {
    return [three.x, three.y];
  }

  /**Takes voronoi path and splits it into separate paths, excluding segments that reach bounds
   * Should only consist of M and L commands.
   */
  public static splitPath(
    pathData: string,
    vBounds?: [number, number, number, number],
    charShape?: CharShape,
  ): string[] {
    const commands = pathData.match(/[a-df-z][^a-df-z]*/gi);
    const pathsArr: string[] = [];
    if (commands !== null) {
      let buildString = '';
      commands.forEach((command) => {
        const type = command[0];
        switch (type) {
          case 'M': // Move to absolute
            pathsArr.push(buildString);
            buildString = command + '';
            break;
          case 'm': // Move to relative
            pathsArr.push(buildString);
            buildString = command + '';
            break;
          default:
            buildString = buildString + command;
          // Handle other commands if necessary
        }
      });
    }
    //console.log(pathsArr);
    if (!_.isUndefined(vBounds)) {
      return this.removeOutsideSegments(pathsArr, vBounds, charShape);
    }
    return pathsArr;
  }

  /**Removes Segments of a Voronoi diagram that reach the boundaries of the bounding box set when creating the diagram*/
  public static removeOutsideSegments(
    pathArr: string[],
    vBounds: [number, number, number, number],
    charShape?: { shape: THREE.Vec2[]; holes: THREE.Vec2[][] },
  ): string[] {
    const trimmedPathArr = [];
    for (const path of pathArr) {
      const commands = path.match(/[a-df-z][^a-df-z]*/gi);
      const positions = this.getPositionsFromCommands(commands);
      let addable = true;
      for (const pos of positions) {
        if (pos.x <= vBounds[0] || pos.x >= vBounds[2]) {
          addable = false;
        }
        if (pos.y <= vBounds[1] || pos.y >= vBounds[3]) {
          addable = false;
        }
      }
      if (addable) {
        trimmedPathArr.push(path);
      }
    }
    if (!_.isUndefined(charShape)) {
      const trimmedPathCommands = trimmedPathArr.flatMap((path) => {
        return this.parsePathData(path);
      });
      const pathSegments = this.pathCommandsToLineSegments(trimmedPathCommands);
      const remainingSegments = this.removeUncontainedSegments(
        pathSegments,
        charShape,
      );
      const fullyRemovedPathArr =
        this.lineSegmentsToPathData(remainingSegments);
      return fullyRemovedPathArr;
    }

    return trimmedPathArr;
  }

  public static removeUncontainedSegments(
    pathSegments: LineSegment[],
    containingShape: SvgShapeData,
  ): LineSegment[] {
    const remainingSegments: LineSegment[] = [];
    pathSegments.forEach((segment) => {
      if (
        this.lineSegmentInPolygonWithHoles(
          segment,
          containingShape.shape as PathPosition[],
          containingShape.holes as PathPosition[][],
        )
      ) {
        remainingSegments.push(segment);
      }
    });
    return remainingSegments;
  }

  public static parsePathData(pathData: string): PathCommand[] {
    const commands: PathCommand[] = [];
    const commandPattern = /[ML][^ML]*/gi; // Regex to match 'M' or 'L' followed by coordinates
    const matches = pathData.match(commandPattern);

    if (matches) {
      for (const match of matches) {
        const type = match.charAt(0) as 'M' | 'L';
        const coordinates = match
          .slice(1)
          .trim()
          .split(/[\s,]+/)
          .map(Number);

        for (let i = 0; i < coordinates.length; i += 2) {
          const x = coordinates[i];
          const y = coordinates[i + 1];
          if (!isNaN(x) && !isNaN(y)) {
            commands.push({ type, x, y });
          }
        }
      }
    }

    return commands;
  }

  public static pathCommandsToLineSegments(
    commands: PathCommand[],
  ): LineSegment[] {
    const lineSegments: LineSegment[] = [];
    let currentPoint: PathPosition | null = null;

    for (const command of commands) {
      const { type, x, y } = command;
      const point: PathPosition = { x, y };

      if (type === 'M') {
        // 'M' command moves the current point to a new location
        currentPoint = point;
      } else if (type === 'L' && currentPoint) {
        // 'L' command creates a line from the current point to the new point
        const lineSegment: LineSegment = { p0: currentPoint, p1: point };
        lineSegments.push(lineSegment);
        currentPoint = point; // Update the current point to the end of this segment
      }
    }

    return lineSegments;
  }

  public static lineSegmentsToPathData(lineSegments: LineSegment[]): string[] {
    const pathArr: string[] = [];
    if (lineSegments.length === 0) {
      return pathArr;
    }

    for (const segment of lineSegments) {
      let pathData = `M${segment.p0.x},${segment.p0.y}`;
      pathData += ` L${segment.p1.x},${segment.p1.y}`;
      pathArr.push(pathData.trim());
    }

    return pathArr;
  }

  /**
   * Returns a random number between min (inclusive) and max (exclusive)
   */
  public static getRandomArbitrary(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Returns a random integer between min (inclusive) and max (inclusive).
   * The value is no lower than min (or the next integer greater than min
   * if min isn't an integer) and no greater than max (or the next integer
   * lower than max if max isn't an integer).
   * Using Math.round() will give you a non-uniform distribution!
   */
  public static getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  public static getRandomColor(): string {
    const min = 0xffffff;
    const max = 0xffffff;
    const colorNumStr = this.getRandomInt(min, max).toString(16);
    return '#' + colorNumStr;
  }

  // Function to check if a point is inside a polygon
  public static pointInPolygon(
    point: PathPosition,
    polygon: PathPosition[],
  ): boolean {
    let inside = false;
    const { x, y } = point;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const { x: xi, y: yi } = polygon[i];
      const { x: xj, y: yj } = polygon[j];

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Function to check if a line segment intersects with any edge of a polygon
  public static lineIntersectsPolygon(
    lineSegment: LineSegment,
    polygon: PathPosition[],
  ): boolean {
    const { p0, p1 } = lineSegment;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const edge: LineSegment = { p0: polygon[i], p1: polygon[j] };
      if (this.lineSegmentsIntersect(p0, p1, edge.p0, edge.p1)) {
        return true;
      }
    }
    return false;
  }

  // Helper function to check if two line segments intersect
  public static lineSegmentsIntersect(
    p0: PathPosition,
    p1: PathPosition,
    p2: PathPosition,
    p3: PathPosition,
  ): boolean {
    const d1 = this.direction(p2, p3, p0);
    const d2 = this.direction(p2, p3, p1);
    const d3 = this.direction(p0, p1, p2);
    const d4 = this.direction(p0, p1, p3);

    if (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    ) {
      return true;
    }

    return (
      (d1 === 0 && this.onSegment(p2, p3, p0)) ||
      (d2 === 0 && this.onSegment(p2, p3, p1)) ||
      (d3 === 0 && this.onSegment(p0, p1, p2)) ||
      (d4 === 0 && this.onSegment(p0, p1, p3))
    );
  }

  public static direction(
    p0: PathPosition,
    p1: PathPosition,
    p2: PathPosition,
  ): number {
    return (p2.x - p0.x) * (p1.y - p0.y) - (p1.x - p0.x) * (p2.y - p0.y);
  }

  public static onSegment(
    p0: PathPosition,
    p1: PathPosition,
    p: PathPosition,
  ): boolean {
    return (
      Math.min(p0.x, p1.x) <= p.x &&
      p.x <= Math.max(p0.x, p1.x) &&
      Math.min(p0.y, p1.y) <= p.y &&
      p.y <= Math.max(p0.y, p1.y)
    );
  }

  //probably unecessary - use 'as' instead
  public static convertVec2ToPathPos(vec2: THREE.Vec2): PathPosition {
    const myPathPos: PathPosition = { x: vec2.x, y: vec2.y };
    return myPathPos;
  }

  // Function to check if a point is inside a polygon with holes
  public static pointInPolygonWithHoles(
    point: PathPosition,
    outerPolygon: PathPosition[],
    holes: PathPosition[][],
  ): boolean {
    // The point must be inside the outer polygon
    if (!this.pointInPolygon(point, outerPolygon)) {
      return false;
    }
    // The point must not be inside any of the holes
    for (const hole of holes) {
      if (this.pointInPolygon(point, hole)) {
        return false;
      }
    }
    return true;
  }

  // Function to check if a line segment is contained within a polygon with holes
  public static lineSegmentInPolygonWithHoles(
    lineSegment: LineSegment,
    outerPolygon: PathPosition[],
    holes: PathPosition[][],
  ): boolean {
    const { p0, p1 } = lineSegment;

    // Both endpoints must be inside the outer polygon and not in any hole
    const p0Inside = this.pointInPolygonWithHoles(p0, outerPolygon, holes);
    const p1Inside = this.pointInPolygonWithHoles(p1, outerPolygon, holes);

    if (!p0Inside || !p1Inside) {
      return false;
    }

    // The segment must not intersect the outer polygon's boundary
    if (this.lineIntersectsPolygon(lineSegment, outerPolygon)) {
      return false;
    }

    // The segment must not intersect any of the holes' boundaries
    for (const hole of holes) {
      if (this.lineIntersectsPolygon(lineSegment, hole)) {
        return false;
      }
    }

    return true;
  }

  public static lineSegmentsToGeom2(lineSegments: LineSegment[]): JGeom2 {
    const points: [number, number][] = [];
    for (const segment of lineSegments) {
      points.push([segment.p0.x, segment.p0.y]);
    }

    // Create an open or closed path from the points
    const path = jscad.geometries.geom2.fromPoints(points);
    return path;
  }

  public static createHullFromGeom2s(geom2a: JGeom2, geom2b: JGeom2): JGeom3 {
    // Convert geom2 objects to geom3 by extruding them along the z-axis
    const geom3a = jscad.extrusions.extrudeLinear({ height: 0.1 }, geom2a);
    const geom3b = jscad.extrusions.extrudeLinear({ height: 0.1 }, geom2b);

    // Translate one of the geom3 objects slightly along the y-axis
    const translatedGeom3a = jscad.transforms.translate([0, 0, 0], geom3a);
    const translatedGeom3b = jscad.transforms.translate([0, 5, 0], geom3b);

    // Create a hull between the two 3D shapes
    return jscad.hulls.hull(translatedGeom3a, translatedGeom3b);
  }

  // Helper function to create a square snake along a line segment
  public createSquareSnake(
    p0: [number, number],
    p1: [number, number],
    width: number,
  ): geom3.Geom3 {
    const direction = [p1[0] - p0[0], p1[1] - p0[1]];
    const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2);

    // Normalize direction
    const normalizedDirection = [direction[0] / length, direction[1] / length];

    // Create a square and extrude it along the direction of the segment
    const squareShape = jscad.primitives.square({ size: width });
    const extrudedSquare = jscad.extrusions.extrudeLinear(
      { height: length },
      squareShape,
    );

    // Align the extruded square with the line segment
    const angle = Math.atan2(normalizedDirection[1], normalizedDirection[0]);
    const rotatedSquare = jscad.transforms.rotateZ(angle, extrudedSquare);

    // Position the square snake along the line segment
    const midPoint = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const translatedSquare = jscad.transforms.translate(
      [midPoint[0], midPoint[1], 0],
      rotatedSquare,
    );

    return translatedSquare;
  }

  // Main function to create square snakes following a geom2
  public createSquareSnakes(geom: geom2.Geom2, width: number): geom3.Geom3 {
    const sides = jscad.geometries.geom2.toSides(geom);
    const snakes: geom3.Geom3[] = [];

    sides.forEach(([p0, p1]) => {
      const snake = this.createSquareSnake(
        [p0[0], p0[1]],
        [p1[0], p1[1]],
        width,
      );
      snakes.push(snake);
    });

    // Combine all the square snakes into one geom3 object
    return jscad.booleans.union(...snakes);
  }

  /*
// Example usage
const outerPolygon: PathPosition[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
];
const holes: PathPosition[][] = [
    [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 4 },
        { x: 2, y: 4 }
    ],
    [
        { x: 6, y: 6 },
        { x: 8, y: 6 },
        { x: 8, y: 8 },
        { x: 6, y: 8 }
    ]
];

const lineSegment: LineSegment = { p0: { x: 3, y: 3 }, p1: { x: 7, y: 7 } };

const contained: boolean = lineSegmentInPolygonWithHoles(lineSegment, outerPolygon, holes);

console.log('Segment is contained within the polygon with holes:', contained); */
}
