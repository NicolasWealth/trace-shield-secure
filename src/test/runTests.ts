import { runAllRiskEngineTests } from "../services/__tests__/riskEngine.test.ts";
import { runAllGraphTests } from "../services/__tests__/graph.test.ts";

console.log("==================================================");
console.log(" TRACESHIELD RECALL & EXPOSURE ENGINE TEST SUITE");
console.log("==================================================\n");

const risk = runAllRiskEngineTests();
const graph = runAllGraphTests();
const results = [...risk.results, ...graph.results];
const passed = risk.passed + graph.passed;
const failed = risk.failed + graph.failed;

results.forEach((r, i) => {
  const icon = r.success ? "✓ PASS" : "✗ FAIL";
  console.log(`[${String(i + 1).padStart(2, "0")}] ${icon}: ${r.name}`);
  if (!r.success && r.details) {
    console.log(`     Error details: ${r.details}`);
  }
});

console.log("\n--------------------------------------------------");
console.log(` SUMMARY: ${passed} passed, ${failed} failed out of ${results.length} tests.`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
