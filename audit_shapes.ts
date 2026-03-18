
import { SHAPES } from "./constants/constants";
import { getAllShapeDifficulties } from "./utils/shapeDifficulty";

const diffs = getAllShapeDifficulties();

console.log("INDEX | TIER   | DIFF | CELLS | COMPACT | LINE | BOUNDING");
console.log("-----------------------------------------------------------");
diffs.forEach((d, i) => {
  const line = [
    i.toString().padEnd(5),
    d.tier.padEnd(6),
    d.difficulty.toFixed(2).padEnd(4),
    d.cellCount.toString().padEnd(5),
    d.compactness.toFixed(2).padEnd(7),
    (d.isLine ? "Y" : "N").padEnd(4),
    `${d.width}x${d.height}`.padEnd(8)
  ].join(" | ");
  console.log(line);
}); 
