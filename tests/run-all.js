// Esegue tutti i test: node run-all.js  (oppure npm test)
(async()=>{
  let failed=0;
  for (const f of ['./app.test.js','./sync.test.js']) failed += await require(f)();
  console.log(failed ? '\n✗ '+failed+' controlli falliti' : '\n✓ tutti i controlli superati');
  process.exit(failed?1:0);
})();
