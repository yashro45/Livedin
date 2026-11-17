/* Minimal zero-dependency test helpers shared by the test files. */
const assert = require('assert');
let passed = 0, failed = 0; const failures = [];
function suite(name) { console.log('\n' + name); }
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; failures.push(name + ' -> ' + e.message); console.log('  FAIL ' + name + '\n         ' + e.message.split('\n')[0]); }
}
function summary(label) {
  console.log('\n' + label + ': ' + passed + ' passed, ' + failed + ' failed');
  if (failed) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exitCode = 1; }
  return { passed, failed };
}
module.exports = { assert, suite, test, summary };
