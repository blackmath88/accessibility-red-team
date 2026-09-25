import { runScoutCorpus } from "./scout.js";

runScoutCorpus()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.results.some((item) => item.status === "ERROR")) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
